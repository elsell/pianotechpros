#!/usr/bin/env bash
set -euo pipefail

readonly root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly build_log_dir="$(mktemp -d "${TMPDIR:-/tmp}/pianotechpros-build-logs.XXXXXX")"
trap 'rm -rf "$build_log_dir"' EXIT

cd "$root"
./scripts/install-docker-buildx.sh
export BUILDX_BUILDER="${BUILDX_BUILDER:-default}"
export COMPOSE_BAKE=true
./scripts/require-docker-buildkit.sh

# Populate the selected builder's cache through the same Compose path used by
# local development and acceptance, then require standalone release-style builds
# to reuse the expensive application layers.
docker compose build api web

readonly api_build_log="$build_log_dir/api-build.log"
readonly web_build_log="$build_log_dir/web-build.log"
docker buildx build --builder "$BUILDX_BUILDER" --load --progress plain --file apps/api/Dockerfile --tag pianotechpros-api:verification . 2>&1 | tee "$api_build_log"
docker buildx build --builder "$BUILDX_BUILDER" --load --progress plain --file apps/web/Dockerfile --tag pianotechpros-web:verification . 2>&1 | tee "$web_build_log"
./scripts/assert-buildkit-cache-hit.sh "$api_build_log" 'CGO_ENABLED=0 go build'
./scripts/assert-buildkit-cache-hit.sh "$web_build_log" 'pnpm --dir apps/web build'
docker image inspect pianotechpros-api:verification pianotechpros-web:verification >/dev/null

./scripts/install-grype.sh
scan_status=0
for image in pianotechpros-api:verification pianotechpros-web:verification; do
  ./.bin/grype "docker:$image" --fail-on high || scan_status=1
done
if [[ "$scan_status" -ne 0 ]]; then
  echo "Production image vulnerability verification failed" >&2
  exit "$scan_status"
fi
echo "BuildKit cache reuse and scanned production images verified"
