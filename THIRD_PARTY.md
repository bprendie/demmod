# Native dependencies

Demmod's original adapter in native/modem.c dynamically links the unmodified
SpanDSP library. The Alpine 3.23 image installs SpanDSP 0.0.6 (LGPL-2.1).
Library project/source: https://www.soft-switch.org/ and
https://github.com/freeswitch/spandsp . Alpine package build recipes, source
locations and patches: https://gitlab.alpinelinux.org/alpine/aports/-/tree/3.23-stable/main/spandsp .
The library remains separately replaceable inside a rebuilt image. The adapter
does not incorporate the project's GPL test program source.

FFmpeg is installed from Alpine packages for local audio conversion. Its build
includes GPL components; see https://ffmpeg.org/legal.html and the Alpine
ffmpeg package recipes for configuration and corresponding source. Distribution
of images must retain applicable notices and meet dependency source obligations.

No third-party JavaScript is downloaded at runtime. Playwright and Node are
optional development tools, not container runtime dependencies.
