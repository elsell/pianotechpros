# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e
FROM registry.access.redhat.com/hi/go:1.25.12-builder-1784449036@sha256:2c7403868c5bae2b988136003a228b0e1be01d1696dca579a8fef3586cbd10e4 AS build
WORKDIR /src
COPY apps/api/go.mod apps/api/go.sum* ./
RUN go mod download
COPY apps/api .
RUN CGO_ENABLED=0 go build -o /out/ ./cmd/server ./cmd/schema ./cmd/migrate ./cmd/spicedb-runtime-proxy ./cmd/audit-retention
FROM registry.access.redhat.com/hi/static:latest-1792647314@sha256:c51e17de4a96e3bd68361830ec54f3c43ffcf398b82765a1ce250bd4a0d99d1f
COPY --from=build /out/server /app
COPY --from=build /out/schema /schema
COPY --from=build /out/migrate /migrate
COPY --from=build /out/spicedb-runtime-proxy /spicedb-runtime-proxy
COPY --from=build /out/audit-retention /audit-retention
ENTRYPOINT ["/app"]
