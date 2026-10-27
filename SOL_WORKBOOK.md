# Demmod — phased build workbook for Sol

Owner: Bob / Weazl  
Prepared: 2026-10-05  
Workspace: /home/bobp/Code/demmod  
Product: Demmod, demodulator/modulator — modem in reverse.

## 1. The agreed product

Build a local web application that encodes text and ANSI art into genuine 300, 1200 and 2400 bit/s modem audio and decodes supported recordings into an 80×24 color terminal. Ship it as a Docker container, available at http://localhost:5000.

Updated authorization, 2026-10-06: ship 300 bps plus experimental 1200/V.22 and 2400/V.22bis. Skip 9600 and higher. MNP remains out of scope. The dated baseline phases below preserve the original 300 bps plan; this update supersedes their scope restrictions. The import drop zone must support WAV, MP3, FLAC, OGG, and AAC. AAC in M4A is included. Output is lossless WAV unless a later request expands export formats.

The interface follows /home/bobp/weazl_ethos_lite.md and its parent /home/bobp/weazl_ethos.md:
- One small Go service with embedded vanilla HTML/CSS/JS.
- Numbered sidebar, one primary action per workspace, persistent playback footer.
- Keyboard support; no cloud accounts, telemetry, Electron, runtime Node, remote fonts, or CDN dependencies.
- Go files stay below 300 lines. Split by responsibility before approaching that limit.
- Work and progress are event driven. No idle polling or decorative animation clock.
- Native service binds loopback by default. Docker listens on all container interfaces but publishes to host loopback at port 5000.
- The terminal is the actual decoded artifact; the surrounding interface is a graphical desk, not a streamed shell.

Read these local references before changing the engine:
- /home/bobp/weazl-modem/README.txt
- /home/bobp/weazl-modem/make_recording.py
- /home/bobp/weazl-modem/decode_recording.py
- /home/bobp/weazl-modem/decoded-master.verification.json

That earlier project is Bell 212A at 1,200 bit/s with MNP3. It proves decoding of its generated recording, not hardware interoperability and not Bell 103 compatibility. Preserve it as reference; do not overwrite or silently relabel its fixtures.

### Approved visual identity

Bob approved the Weazl-head/telephone-handset graphic on 2026-10-05.
- Master: design/demmod-icon-v1.png (transparent PNG).
- Generation prompt/reference: design/demmod-icon-v1.prompt.txt.
- Embedded web copy: web/demmod-icon-v1.png.
- Used in the sidebar brand, desktop hero, and browser favicon.
- Preserve this identity in subsequent phases; the desktop hero is hidden at narrow widths while the sidebar icon remains visible.

## 2. Three claims that must remain separate

1. Audio format support: can Demmod read the WAV/MP3/FLAC/OGG/AAC container and codec?
2. Signal recovery: can its receiver recover the transmitted Bell 103 bytes?
3. Hardware interoperability: can a specified real modem receive the exported audio through a specified acoustic path?

Passing one does not establish the others. A supported MP3 can contain speech, a 1,200 bps signal, or damaged 300 bps audio. Report unsupported/no signal, not a fabricated transcript.

Fixed recordings cannot adapt to a live modem. Use Bell 103 asynchronous 8N1, no error control, no compression. A carrier lead-in is not a complete interactive handshake. Hardware playback requires documented modem configuration and receive channel. Do not market a generic fixed WAV as a universal modem connection.

## 3. Present implementation: inspect before extending

| Component | Location | Current behavior |
| --- | --- | --- |
| HTTP service | main.go | Embedded assets, CSP, explicit listen flag, health endpoint, local audio API |
| Audio import | audio.go | FFmpeg format detection, mono 48 kHz float PCM, bounded conversion, temporary-file cleanup |
| UI | web/index.html, web/style.css | Encode/Decode desk, responsive layout, drop input, modem settings fold, transport |
| UI orchestration | web/app.js | Text import, encode/export, audio import, decode, replay, keyboard controls |
| Modulation | web/modem.js | Bell 103 answer/originate AFSK, 300 bit/s, 8N1 |
| Receiver | web/modem.js, web/worker.js | Experimental tone detection and start-bit acquisition, both channel candidates |
| Terminal | web/terminal.js | CP437/UTF-8 conversion, 80×24 canvas, basic ANSI color/cursor/erase support |
| Tests | tests/modem.mjs, audio_test.go | Byte round trips, character conversion, terminal positions, bad input, origin/method rejection |
| Format smoke test | scripts/smoke-formats.mjs | Generates fixtures, imports through HTTP, verifies all 256 byte values in both channels |
| Deployment | Dockerfile, compose.yaml | Go binary + FFmpeg, non-root runtime, port 5000, bounded temporary storage |

Encoding currently runs in the browser; it is not yet a Go modem engine. Do not document it as server-side DSP. Source editor converts line endings to CRLF and translates the visible sequence \e[ into ESC [. That is convenient composition behavior, not a lossless arbitrary-byte editor.

Current limits:
- 50 MiB input; five minutes of normalized audio; 8,964 encoded source bytes.
- MP3, AAC, and OGG encoding damage may affect recovery. Tested fixtures do not establish every bitrate/profile.
- Receiver has no adaptive sample-clock tracking, robust channel equalizer, or checksum-backed correctness claim.
- ANSI renderer implements a subset and treats LF as a new line with column reset.
- All 256 bytes can traverse the signal codec; CP437 display of low control codes is a separate terminal policy.
- Stereo is averaged to mono. Opposite-phase channels can cancel; channel selection is future work.
- FFmpeg is a runtime dependency. The Go binary itself is static; the whole installation is not a single dependency-free binary.
- Conversion uses a private temporary file removed when the request finishes. Decoding stays local.
- No acoustic hardware test has been performed.

## 4. How Sol should work

Proceed phase by phase and update this workbook with evidence. Preserve the approved desk while replacing prototype internals. A phase is complete only when its acceptance criteria pass. Record actual commands, fixture hashes, recovered byte comparisons, and limitations; do not substitute screenshots for decoder correctness.

Use separate commits for coherent milestones once a repository is initialized. Do not create or push a remote without a destination. This workspace initially has no Git repository.

When stuck on physical hardware access, finish independent software work and mark only that phase blocked. Ask for the modem model, firmware/configuration, and coupler details when preparing hardware tests; they are not prerequisites for the file application.

### Phase 0 — freeze the mockup and baseline

Status: implementation present; visual approval remains with Bob.

Tasks:
- [x] Build an interactive localhost:5000 Encode/Decode desk.
- [x] Provide CP437/ANSI example and 80×24 color preview.
- [x] Wire real Bell 103 WAV generation and experimental decoding.
- [x] Accept WAV, MP3, FLAC, OGG, AAC/M4A.
- [x] Verify downloads, playback, seeking, import, help dialog, and mobile width in Chromium.
- [ ] Get visual feedback; preserve accepted layout and terminology.
- [ ] Capture versioned reference screenshots and establish repository history.

Gate: the UI distinguishes source preview, received output, and replay. Errors are visible and recoverable. No control claims hardware validation.

### Phase 1 — reproducible local and Docker delivery

Status: prototype container built and running successfully on this linux/amd64 host; clean-host and release validation remain.

Tasks:
- [x] Compile embedded UI into the Go service.
- [x] Include FFmpeg in the runtime image.
- [x] Run as non-root with read-only root filesystem and bounded /tmp.
- [x] Publish 127.0.0.1:5000 → container port 5000.
- [x] Add GET /healthz and same-origin POST /api/audio.
- [x] Start the real container on port 5000; pass both-channel format smoke tests and browser import.
- [ ] Validate cold build/start/stop on a second clean machine.
- [ ] Test linux/amd64 and linux/arm64 images.
- [ ] Pin release base-image digests and record FFmpeg/build versions.
- [ ] Publish versioned image only after Bob supplies registry/release destination.

Gate: Docker startup requires no host Go/Node/FFmpeg installation, serves the desk on port 5000, imports every required format, exports WAV, and deletes temporary uploads. Stopping the container stops all application work.

Do not enable host networking for runtime to solve a build DNS problem. Do not expose the Docker socket or grant privileged mode.

### Phase 2 — define byte and terminal behavior

Status: prototype subset only.

Tasks:
- [ ] Define CP437 mapping, UTF-8 behavior, CR/LF policy, raw .ans import, and export semantics.
- [ ] Separate raw imported bytes from the editable display representation. Do not turn literal \e[ sequences into escapes in byte-preserving imports.
- [ ] Define supported ANSI operations: 16 colors, foreground/background, reset/bold, cursor movement, positioning, erase, save/restore, wrapping, scrolling, tabs/backspace, and visibility.
- [ ] Handle escape sequences split across received chunks. Skip unsupported sequences safely and predictably.
- [ ] Define how malformed UTF-8, wide glyphs, combining characters, and CP437 control positions occupy cells.
- [ ] Separate source state, imported recording state, recovered bytes, and playback state so workspace switching cannot mix them.
- [ ] Make Decode character encoding selectable and retain audio replay state across navigation.
- [ ] Add terminal snapshots/checkpoints for seeking; avoid reparsing the entire message every animation frame.
- [ ] Keep downloads byte-preserving; offer a separate readable transcript export.

Gate: approved ANSI fixtures render the expected 80×24 cell/color grid. Raw .ans import/export is byte-identical. Seeking, pausing, and replay produce the same terminal state at the same audio position.

### Phase 3 — production Bell 103 transmitter

Status: basic browser implementation present.

Tasks:
- [ ] Establish a documented physical-layer reference and an independently generated Bell 103 fixture.
- [ ] Define both profiles: originate mark/space 1270/1070 Hz; answer mark/space 2225/2025 Hz.
- [ ] Keep 300 bits/s, one start bit, eight LSB-first data bits, no parity, one stop bit.
- [ ] Specify carrier phase continuity, output level/headroom, lead-in, tail, silence, and WAV metadata.
- [ ] Keep decorative dial/ring effects separate from the hardware waveform. Include only connection/carrier sequences justified by the selected profile and hardware test.
- [ ] Decide engine placement in a short architecture note. Preferred release direction: a small reusable Go DSP package used by jobs/CLI; retain JS as a reference while porting if useful.
- [ ] Preserve parity with reference fixtures when moving the encoder. Do not combine UI redesign and DSP migration.
- [ ] Verify using a receiver that does not share encoder code.

Gate: the independent receiver recovers every byte exactly on both channels, including long runs, control bytes, NUL, FF, and ANSI data. WAV timings and tone frequencies match the declared profile.

### Phase 4 — robust file receiver and import pipeline

Status: clean synthetic recordings pass; robustness is unfinished.

Tasks:
- [ ] Build a receiver corpus: independent clean signals, resampled recordings, real captures, lossy encodes, silence, speech, and wrong modem rates.
- [ ] Add carrier acquisition/loss, timing recovery, sample-clock drift tracking, level normalization, and measured confidence criteria.
- [ ] Define channel auto-detection and a manual override. Do not choose the winner solely by whichever candidate emits the most bytes.
- [ ] Track framing errors and uncertainty. Raw 8N1 has no CRC; do not label it checksum verified.
- [ ] Preserve sample-derived byte timestamps through normalization and codec delay for synchronized replay.
- [ ] Offer stereo left/right/mono selection where averaging would destroy a channel.
- [ ] Define sample-rate, channel-count, bit-depth, duration, size, and codec-profile support.
- [ ] Test corrupt/truncated media, excess duration, output bounds, cancellation, duplicate requests, worker failures, and FFmpeg absence.
- [ ] Add cancellation through browser fetch, Go request context, conversion process, and receiver worker.
- [ ] Allow partial recovery with clear diagnostics; never show the example transcript as decoded output.

Gate: publish measured byte error/recovery rates across the corpus, exact recovery for clean reference fixtures, bounded CPU/memory for malformed inputs, and no plausible-looking output for the negative corpus. Report the limits of lossy and acoustic recovery.

### Phase 5 — real-modem playback milestone

Status: not started; requires physical equipment.

Tasks:
- [ ] Record modem model, firmware, supported Bell 103 modes, serial settings, and AT/configuration commands.
- [ ] Identify the acoustic coupler/handset arrangement and whether the modem can receive a one-way prerecorded stream after forced/manual connection setup.
- [ ] Match transmit channel to the hardware receive role. Disable error control and compression.
- [ ] First establish the signal path with a simple known message; then send a byte fixture and representative ANSI art.
- [ ] Record playback sample rate, device volume, coupling geometry, noise conditions, and modem output bytes.
- [ ] Repeat each acceptance fixture at least three times after a fresh setup and compare bytes, not just screenshots.
- [ ] Determine whether a complete startup requires two-way interaction. If so, implement and test live audio as a separately scoped milestone; do not manufacture successful handshakes in a static file.
- [ ] Keep any recording of both directions distinct from the one-sided transmit WAV intended for hardware.

Gate: a documented real modem receives an exported Demmod WAV through the specified acoustic setup with exact fixture recovery. Compatibility claims name the tested setup. If only manual/forced receive works, state it explicitly.

### Phase 6 — release and operating contract

Status: future.

Tasks:
- [ ] Resolve Phase 0 feedback and finish all release-critical gates above.
- [ ] Run container integration tests on supported architectures and a clean host.
- [ ] Measure active and idle CPU/memory; inspect background activity with the tab hidden, closed, and container stopped.
- [ ] Review bundled code/font/media licensing and FFmpeg redistribution requirements.
- [ ] Document install, start, stop, update/rollback, import formats, exact terminal support, modem profiles, and hardware evidence.
- [ ] Keep LAN/reverse proxy hosting opt-in. Current import origin checks accept localhost:5000 and 127.0.0.1:5000 only; design explicit trusted-origin configuration before advertising remote hosting.
- [ ] Publish a changelog and explicit compatibility matrix. Label experimental features accordingly.

Gate: a user can launch one container, open port 5000, encode an ANSI file, recover it from a supported recording, and understand the tested hardware limits without reading source code.

## 5. Development and operation commands

Start the container:

    cd /home/bobp/Code/demmod
    docker compose up -d --build
    docker compose ps

Open http://localhost:5000.

Stop everything:

    docker compose down

Inspect health and logs:

    curl -fsS http://localhost:5000/healthz
    docker compose logs --tail=100 demmod

Native development (FFmpeg installed on the host):

    go run .

The Go binary embeds assets at compile time. Restart it after editing web files; rebuilding the container is also required for container-hosted edits.

Validation (Node is development-only):

    go test ./...
    node --test tests/*.mjs
    node scripts/smoke-formats.mjs

The format smoke test requires a running Demmod service, FFmpeg, and Node on the test machine. It generates temporary fixtures and removes them afterward.

This machine had a host-wide DNS failure while resolving the Alpine package mirror; host-network builds failed too. A temporary, freshly verified mirror mapping combined with host build networking allowed package downloads:

    docker build --network=host --add-host dl-cdn.alpinelinux.org:VERIFIED_MIRROR_IP -t demmod:local .
    docker compose up -d --no-build

Replace VERIFIED_MIRROR_IP with a current trusted DNS result. Do not hardcode a CDN IP into the Dockerfile or runtime. Normal builds should use the standard command after DNS works. Runtime uses the normal Compose network and loopback port publication.

## 6. Validation log

2026-10-05, initial native prototype:
- Both Bell 103 channels: all 256 byte values survived WAV generation, parsing, and demodulation.
- CP437/ANSI round trip and 80×24 cursor-position tests passed.
- Chromium: real export → upload → recovered bytes/terminal; playback/pause/seek; help dialog; mobile width; no console errors.
- Multi-format browser import: WAV, MP3 192 kbit/s, FLAC, Vorbis OGG quality 5, AAC 192 kbit/s, AAC/M4A, and Opus OGG 128 kbit/s recovered the same 54-byte fixture exactly.
- HTTP format smoke test: all 256 bytes recovered on both channels for each of those seven encodings.
- Corrupt AAC produced an actionable import error.
- Existing receiver tests and Go request-origin/method tests passed.
- No hardware-modem interoperability claim is supported by these tests.
- Container image demmod:local built successfully on linux/amd64. Image ID: sha256:8afc94b9755499de80fc37271d5179979f05716f78e36fd2585b16a7930225cc.
- docker compose up -d --no-build --wait: healthy; loopback port mapping 127.0.0.1:5000 → container 5000.
- Container format smoke test passed all 14 combinations (seven encodings × two channels), comparing all 256 byte values.
- Initial container API rejected corrupt audio (422), empty input (400), foreign origins (403), and 121-second recordings (413). The original two-minute duration cap was later raised to five minutes after the real-recording investigation below.
- Chromium against the container: AAC/M4A import recovered all 54 expected bytes and rendered the expected terminal with no JavaScript errors.
- Runtime identity: uid/gid 10001; FFmpeg 8.0.1; temporary directory empty after conversions.
- Build required host networking plus a temporary verified Alpine mirror host mapping due to local DNS/download problems. No system DNS or runtime host-network configuration was changed.
- The container remains running for review on http://localhost:5000. Stop with docker compose down.

## 7. Completion evidence template

For each phase append:

    Phase:
    Date / source version:
    Behavior changed:
    Commands and fixtures:
    Expected bytes / hash:
    Actual bytes / hash:
    Browser / OS / architecture / FFmpeg version:
    CPU / memory / duration where relevant:
    Hardware and settings where relevant:
    Known limitations:
    Acceptance gate: passed / failed / blocked
    Next concrete action:

## 8. Technical references

Use primary references when implementing modem behavior. Local code is evidence of implementation, not a standard.
- FFmpeg CLI: https://ffmpeg.org/ffmpeg.html
- FFmpeg demuxers/formats: https://ffmpeg.org/ffmpeg-formats.html
- USR modem handshake/error-control context: https://support.usr.com/support/3453c/3453c-ug/handshaking.html
- Existing Bell 212A/MNP3 project's sources: /home/bobp/weazl-modem/README.txt

The independent Bell 103 reference/fixture is an explicit Phase 3 deliverable; do not confuse Bell 202's 1,200 bps FSK, V.21, or the earlier Bell 212A signal with Bell 103.

## 9. Real recording investigation — 2026-10-05

Input supplied by Bob:
    /home/bobp/aac_out/Information Society/Peace And Love, Inc. (30th Anniversary)/17 300BPS N, 8, 1, (Terminal Mode or ASCII Download).m4a

Finding: the 178.9125625-second stereo AAC recording exceeded the prototype's 120-second import cap, so conversion rejected it before demodulation. The existing Bell 103 receiver could already recover readable text from the full recording; no DSP change was necessary for this fixture.

Change: raise normalized recording duration to 300 seconds in the local API and WAV reader; update input hints and duration-limit smoke checks. The 50 MiB upload and 3,500-byte source-message limits are unchanged.

Verified through Chromium against the rebuilt Docker service:
- 5,056 bytes recovered on the Bell 103 answer channel at 300 bit/s, 8N1.
- All recovered bytes are printable ASCII or whitespace controls.
- Three rejected start candidates were reported. This is not a count of known corrupt output bytes.
- Saved browser bytes equal direct decoding of the normalized full recording.
- SHA-256 of recovered output: b4b199e3428fd8475f2c0a45bd442e6cba9086a25056f5f4a7c4ef43982cc8a6.
- Audio seeking reconstructs the terminal from sample-derived receive times.
- Local artifacts: output/information-society-300bps.txt and output/information-society-300bps.report.json.
- No source-byte reference or checksum exists here to independently prove every recovered character. This is evidence for one real recording, not universal modem/audio compatibility.
- The commercial source audio was not copied into the repository or container.

Follow-up: retain this as an optional local regression fixture (the path may not exist on Sol's machine). Do not embed the commercial recording in distributed images.

## 10. Pasted ASCII art regression — 2026-10-05

Bob's 44-line Weazl ASCII art produced about 3.6 KiB after CRLF normalization. The old 3,500-byte encoder cap disabled Encode. An input handler immediately overwrote the limit warning with “Message changed,” obscuring the cause.

Fix:
- Derive MAX_MESSAGE_BYTES from the shared five-minute audio duration and 300 bit/s 8N1 framing, accounting for carrier lead-in/release: 8,964 bytes.
- Enforce the same bound inside the encoder, text import, preview, and generated-example path.
- Show persistent inline size/character errors beside the editor. Valid input clears the error and re-enables Encode.
- Preserve spaces and content; do not trim art to make it fit.
- Fixture: tests/fixtures/weazl-ascii.txt. It is 3,617 bytes with normalized CRLF and a final newline.
- Node regression verifies byte-for-byte WAV round trip of that fixture and that the maximum message yields exactly 300 seconds.
- Chromium on the rebuilt container: pasted fixture → Export WAV → Decode → Save text recovered all 3,617 expected bytes. Oversized/unsupported-character validation and recovery also passed.
- Local review outputs: output/weazl-ascii-300.wav and output/weazl-ascii-recovered.txt.

The terminal viewport remains 80×24: a 44-line image scrolls, and lines wider than 80 columns wrap. This does not truncate the encoded message. Scrollback/full-art inspection remains a separate terminal feature.


## 2026-10-06 — expanded implementation and remaining gates

### Phase A: playback and transmission remediation (implemented)

Receive import indexes the signal locally, leaves the terminal blank and exposes Play. Playback and seeking reveal received bytes against the audio clock; Save text exports that prefix. Native live encode streams paced PCM into scheduled Web Audio buffers; Stop aborts the helper request. Completed transmissions export the same samples. No pre-generated audio is presented as real-time generation.

### Phase B: experimental V.22/V.22bis (implemented)

native/modem.c dynamically links SpanDSP. 1200 is differential QPSK at 600 symbols/s; 2400 is 16-QAM at 600 symbols/s. A simulated peer performs training; data begins after four seconds. Export includes only the chosen transmitting side. modem.go provides bounded native encode/decode endpoints. web/profiles.js, receive.js and live.js handle rates, receiver selection and live audio. Bell 103's JavaScript receiver remains independent of the native transmitter.

All profiles use raw asynchronous 8N1 without MNP/compression. Internal-peer and passive-receiver byte comparisons establish software operation only. Automatic selection uses framing quality and can misidentify noise; explicit rate selection is available. Two native receiver instances try opposite channels. The startup and carrier must be present for reliable acquisition.

### Phase C: hardware acceptance (open; required before compatibility claims)

1. Record modem manufacturer, model, firmware, supported modulation and exact configuration. Use the manual to force the selected modulation and disable error control/compression. Do not assume generic AT commands work on every modem.
2. Start with Bell 103, opposite channel, 8N1, a known byte payload and clean WAV. Connect through the chosen acoustic interface; measure input level without clipping.
3. Capture the hardware's received bytes and compare length and SHA-256 with the original payload. Repeat both channels and ASCII/ANSI/all-byte fixtures.
4. Repeat at V.22 and V.22bis. A fixed simulated-peer startup may fail against a real peer's timing. If it does, implement microphone/line-input feedback and actual duplex negotiation; do not hide failure with decorative connection audio.
5. Measure drift, noise, gain and lossy-codec tolerance with held-out hardware recordings. Keep failed fixtures and confidence/error evidence.

### Phase D: deployment

Docker includes the Go service, native helper, SpanDSP and FFmpeg; remains non-root and publishes only 127.0.0.1:5000. Rebuild and recreate the container after changes. Check health, encode/export, Play-driven receive and live transmission against the running image. Native dependencies are documented in THIRD_PARTY.md. The original 300 bps fixture and approved Weazl icon must continue to pass regression checks.


### Validation record — 2026-10-06 deployment

- Go tests passed; 11 JavaScript/native tests passed, including all 256 bytes at 1200/2400 in both channels through a fresh passive SpanDSP receiver (same library, not independent hardware).
- Running-container browser/API round trips recovered all 256 bytes at 300/1200/2400 on both channels with correct automatic rate/channel detection.
- Browser acceptance passed offline and real-time generation at all rates, export gating, blank receive terminal before Play, timed text reveal, cancellation and no page errors. Script: scripts/smoke-browser.mjs.
- WAV/MP3/FLAC/Vorbis/AAC/M4A/Opus imports passed all-byte Bell 103 tests on both channels. Corrupt/empty audio, foreign origin and duration limits also passed.
- The user's Information Society M4A still yields 5,056 bytes with SHA-256 b4b199e3428fd8475f2c0a45bd442e6cba9086a25056f5f4a7c4ef43982cc8a6 via automatic receive. The terminal stays blank until playback/seeking.
- Docker image rebuilt and container recreated healthy on localhost:5000. Hardware/acoustic tests remain open; lossy-codec tolerance at higher rates has not been established by the Bell 103 format suite.
