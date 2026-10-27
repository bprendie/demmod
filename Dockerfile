FROM golang:1.26-alpine AS build
WORKDIR /src
COPY go.mod ./
COPY *.go ./
COPY web ./web
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /demmod .

FROM alpine:3.23 AS modem-build
RUN apk add --no-cache build-base spandsp-dev tiff-dev
COPY native/modem.c /src/modem.c
RUN cc -O2 -Wall -Wextra /src/modem.c -lspandsp -lm -o /demmod-modem

FROM alpine:3.23
RUN apk add --no-cache ffmpeg spandsp \
    && addgroup -g 10001 demmod \
    && adduser -D -H -u 10001 -G demmod demmod
COPY --from=build /demmod /usr/local/bin/demmod
COPY --from=modem-build /demmod-modem /usr/local/bin/demmod-modem
USER 10001:10001
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:5000/healthz || exit 1
ENTRYPOINT ["/usr/local/bin/demmod"]
CMD ["-listen", "0.0.0.0:5000"]
