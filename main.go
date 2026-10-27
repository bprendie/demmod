package main

import (
	"embed"
	"flag"
	"io/fs"
	"log"
	"net/http"
	"time"
)

//go:embed web/*
var assets embed.FS

func main() {
	listen := flag.String("listen", "127.0.0.1:5000", "HTTP listen address")
	flag.Parse()
	root, err := fs.Sub(assets, "web")
	if err != nil {
		log.Fatal(err)
	}
	files := http.FileServer(http.FS(root))
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; worker-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		if r.URL.Path == "/healthz" {
			w.Header().Set("Content-Type", "text/plain")
			w.Write([]byte("ok\n"))
			return
		}
		if r.URL.Path == "/api/modem/encode" {
			encodeModem(w, r)
			return
		}
		if r.URL.Path == "/api/modem/decode" {
			decodeModem(w, r)
			return
		}
		if r.URL.Path == "/api/audio" {
			importAudio(w, r)
			return
		}
		files.ServeHTTP(w, r)
	})
	server := &http.Server{Addr: *listen, Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	log.Printf("Demmod listening at http://%s", *listen)
	log.Fatal(server.ListenAndServe())
}
