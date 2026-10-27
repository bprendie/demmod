package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAudioImportRejectsInvalidRequests(t *testing.T) {
	cases := []struct {
		name, method, origin, marker string
		want                         int
	}{
		{"method", "GET", "", "", http.StatusMethodNotAllowed},
		{"missing marker", "POST", "http://localhost:5000", "", http.StatusForbidden},
		{"foreign origin", "POST", "http://example.com", "audio-import", http.StatusForbidden},
		{"missing origin", "POST", "", "audio-import", http.StatusForbidden},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(tc.method, "http://localhost:5000/api/audio", strings.NewReader("audio"))
			r.Header.Set("Origin", tc.origin)
			r.Header.Set("X-Demmod-Request", tc.marker)
			w := httptest.NewRecorder()
			importAudio(w, r)
			if w.Code != tc.want {
				t.Fatalf("status = %d, want %d", w.Code, tc.want)
			}
		})
	}
}
