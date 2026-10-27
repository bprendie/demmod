package main

import (
	"bytes"
	"context"
	"io"
	"math"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"time"
)

func localPost(w http.ResponseWriter, r *http.Request) bool {
	if r.Method != "POST" {
		w.Header().Set("Allow", "POST")
		http.Error(w, "Use POST.", 405)
		return false
	}
	if r.Header.Get("X-Demmod-Request") != "audio-import" || r.Header.Get("Origin") != "http://"+r.Host ||
		(r.Host != "localhost:5000" && r.Host != "127.0.0.1:5000") {
		http.Error(w, "Open Demmod on localhost to use audio tools.", 403)
		return false
	}
	return true
}
func modemBinary() (string, error) {
	if name := os.Getenv("DEMMOD_MODEM"); name != "" {
		return exec.LookPath(name)
	}
	if name, err := exec.LookPath("demmod-modem"); err == nil {
		return name, nil
	}
	return exec.LookPath("./bin/demmod-modem")
}
func encodeModem(w http.ResponseWriter, r *http.Request) {
	if !localPost(w, r) {
		return
	}
	rate, _ := strconv.Atoi(r.URL.Query().Get("rate"))
	role := r.URL.Query().Get("role")
	if (rate != 300 && rate != 1200 && rate != 2400) || (role != "answer" && role != "originate") {
		http.Error(w, "Choose 300, 1200, or 2400 bps and a transmit channel.", 400)
		return
	}
	lead, tail := 4.0, .5
	if rate == 300 {
		lead, tail = 1, .2
	}
	maxBytes := int((300 - lead - tail) * float64(rate) / 10)
	payload, err := io.ReadAll(http.MaxBytesReader(w, r.Body, int64(maxBytes)))
	if err != nil || len(payload) == 0 {
		http.Error(w, "Message is empty or exceeds five minutes at this rate.", 400)
		return
	}
	binary, err := modemBinary()
	if err != nil {
		http.Error(w, "Modem engine is unavailable. Rebuild the container.", 503)
		return
	}
	live := r.URL.Query().Get("live") == "1"
	limit := 30 * time.Second
	kind := "file"
	if live {
		limit = 310 * time.Second
		kind = "live"
	}
	ctx, cancel := context.WithTimeout(r.Context(), limit)
	defer cancel()
	cmd := exec.CommandContext(ctx, binary, "encode", strconv.Itoa(rate), role, kind)
	cmd.Stdin = bytes.NewReader(payload)
	cmd.Stderr = io.Discard
	frames := int(math.Ceil((lead + 10*float64(len(payload))/float64(rate) + tail) * 8000))
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Audio-Rate", "8000")
	w.Header().Set("X-Audio-Frames", strconv.Itoa(frames))
	w.Header().Set("X-Data-Start", strconv.FormatFloat(lead, 'f', 1, 64))
	if live {
		// Flush sample blocks as the native modem generates them on its audio clock.
		pipe, err := cmd.StdoutPipe()
		if err != nil {
			http.Error(w, "Could not start transmission.", 500)
			return
		}
		if err = cmd.Start(); err != nil {
			http.Error(w, "Could not start transmission.", 500)
			return
		}
		w.WriteHeader(200)
		controller := http.NewResponseController(w)
		controller.Flush()
		chunk := make([]byte, 4096)
		for {
			n, readErr := pipe.Read(chunk)
			if n > 0 {
				if _, err = w.Write(chunk[:n]); err != nil {
					cancel()
					break
				}
				controller.Flush()
			}
			if readErr != nil {
				break
			}
		}
		cmd.Wait()
		return // Client verifies the declared sample count; incomplete streams cannot export.
	}
	out, err := cmd.Output()
	if err != nil || len(out) != frames*2 {
		http.Error(w, "Modem training or encoding failed.", 422)
		return
	}
	w.Write(out)
}
func decodeModem(w http.ResponseWriter, r *http.Request) {
	if !localPost(w, r) {
		return
	}
	rate, _ := strconv.Atoi(r.URL.Query().Get("rate"))
	if rate != 0 && rate != 1200 && rate != 2400 {
		http.Error(w, "Choose V.22/V.22bis or automatic detection.", 400)
		return
	}
	binary, err := modemBinary()
	if err != nil {
		http.Error(w, "Modem engine is unavailable. Rebuild the container.", 503)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxPCM)
	defer r.Body.Close()
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	convert := exec.CommandContext(ctx, "ffmpeg", "-v", "error", "-nostdin", "-f", "f32le", "-ar", "48000", "-ac", "1", "-i", "pipe:0", "-ar", "8000", "-f", "s16le", "pipe:1")
	convert.Stdin = r.Body
	convert.Stderr = io.Discard
	pipe, err := convert.StdoutPipe()
	if err != nil {
		http.Error(w, "Could not prepare receiver.", 500)
		return
	}
	receiver := exec.CommandContext(ctx, binary, "decode", strconv.Itoa(rate))
	receiver.Stdin = pipe
	receiver.Stderr = io.Discard
	if err = convert.Start(); err != nil {
		http.Error(w, "Could not prepare receiver.", 500)
		return
	}
	result, receiveErr := receiver.Output()
	if receiveErr != nil {
		cancel()
	}
	convertErr := convert.Wait()
	if receiveErr != nil || convertErr != nil {
		http.Error(w, "Could not process this recording.", 422)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Write(result)
}
