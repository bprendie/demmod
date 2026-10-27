package main

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"os/exec"
	"time"
)

const maxRecording = 50 * 1024 * 1024
const maxDuration = 300
const maxPCM = maxDuration * 48000 * 4

var conversionSlot = make(chan struct{}, 1)

func importAudio(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		http.Error(w, "Use POST to import a recording.", http.StatusMethodNotAllowed)
		return
	}
	if r.Header.Get("X-Demmod-Request") != "audio-import" ||
		r.Header.Get("Origin") != "http://"+r.Host ||
		(r.Host != "localhost:5000" && r.Host != "127.0.0.1:5000") {
		http.Error(w, "Open Demmod on localhost to import audio.", http.StatusForbidden)
		return
	}
	select {
	case conversionSlot <- struct{}{}:
		defer func() { <-conversionSlot }()
	default:
		http.Error(w, "Another recording is loading. Try again shortly.", http.StatusTooManyRequests)
		return
	}
	binary, err := exec.LookPath("ffmpeg")
	if err != nil {
		http.Error(w, "Audio import needs FFmpeg installed on this machine.", http.StatusServiceUnavailable)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxRecording)
	defer r.Body.Close()
	file, err := os.CreateTemp("", "demmod-audio-*")
	if err != nil {
		http.Error(w, "Could not prepare the recording. Check local temporary storage.", http.StatusInternalServerError)
		return
	}
	defer os.Remove(file.Name())
	n, copyErr := io.Copy(file, r.Body)
	closeErr := file.Close()
	if copyErr != nil || closeErr != nil {
		var limit *http.MaxBytesError
		if errors.As(copyErr, &limit) {
			http.Error(w, "Choose a recording under 50 MB.", http.StatusRequestEntityTooLarge)
		} else {
			http.Error(w, "Could not read the recording. Try selecting it again.", http.StatusBadRequest)
		}
		return
	}
	if n == 0 {
		http.Error(w, "This recording is empty.", http.StatusBadRequest)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, binary,
		"-hide_banner", "-loglevel", "error", "-nostdin",
		"-protocol_whitelist", "file,pipe",
		"-format_whitelist", "wav,mp3,flac,ogg,aac,mov",
		"-threads", "1", "-i", file.Name(),
		"-map", "0:a:0", "-vn", "-sn", "-dn",
		"-ac", "1", "-ar", "48000", "-t", "301",
		"-threads", "1", "-f", "f32le", "pipe:1")
	var pcm boundedPCM
	cmd.Stdout = &pcm
	cmd.Stderr = io.Discard
	err = cmd.Run()
	if pcm.Len() > maxPCM {
		http.Error(w, "Keep prototype recordings under five minutes.", http.StatusRequestEntityTooLarge)
		return
	}
	if ctx.Err() != nil {
		http.Error(w, "Audio import timed out. Try a shorter recording.", http.StatusRequestTimeout)
		return
	}
	if err != nil || pcm.Len() == 0 {
		http.Error(w, "Could not read this audio. Choose a valid WAV, MP3, FLAC, OGG, or AAC/M4A recording.", http.StatusUnprocessableEntity)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Write(pcm.Bytes())
}

// Bound FFmpeg output even for malformed inputs.
type boundedPCM struct{ bytes.Buffer }

func (b *boundedPCM) Write(p []byte) (int, error) {
	if b.Len()+len(p) > maxPCM+48000*4 {
		return 0, errors.New("audio exceeds duration limit")
	}
	return b.Buffer.Write(p)
}
