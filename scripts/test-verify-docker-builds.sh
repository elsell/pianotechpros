#!/usr/bin/env bash
set -euo pipefail

readonly root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

readonly cache_subject="$root/scripts/assert-buildkit-cache-hit.sh"
readonly test_dir="$(mktemp -d)"
trap 'rm -rf "$test_dir"' EXIT

cat >"$test_dir/cache-hit.log" <<'LOG'
#22 [build 6/6] RUN CGO_ENABLED=0 go build -o /out/ ./cmd/server
#22 CACHED
LOG
"$cache_subject" "$test_dir/cache-hit.log" 'CGO_ENABLED=0 go build'
sed 's/CACHED/DONE 42.1s/' "$test_dir/cache-hit.log" >"$test_dir/cache-miss.log"
if "$cache_subject" "$test_dir/cache-miss.log" 'CGO_ENABLED=0 go build' >"$test_dir/cache-miss.out" 2>&1; then
  echo "an expensive uncached build step must fail verification" >&2
  exit 1
fi

mkdir -p "$test_dir/bin" "$test_dir/logs" "$test_dir/project/scripts" "$test_dir/project/.bin"
readonly subject="$test_dir/project/scripts/verify-docker-builds.sh"
for script in verify-docker-builds.sh install-docker-buildx.sh require-docker-buildkit.sh assert-buildkit-cache-hit.sh check-node-runtime-security.mjs; do
  cp "$root/scripts/$script" "$test_dir/project/scripts/$script"
done
cat >"$test_dir/project/scripts/install-grype.sh" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' install >>"$SCANNER_TEST_CALLS"
exit "${SCANNER_INSTALL_STATUS:-0}"
FAKE
cat >"$test_dir/project/.bin/grype" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$SCANNER_TEST_CALLS"
if [[ "$1" == "${SCANNER_FAIL_IMAGE:-}" ]]; then exit "${SCANNER_FAIL_STATUS:-1}"; fi
FAKE
cat >"$test_dir/project/scripts/scan-web-image.sh" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
exec ./.bin/grype "docker:$1" --fail-on high
FAKE
chmod +x "$test_dir/project/scripts/scan-web-image.sh"
chmod +x "$test_dir/project/scripts/install-grype.sh" "$test_dir/project/.bin/grype"
export SCANNER_TEST_CALLS="$test_dir/scanner.calls"
cat >"$test_dir/bin/docker" <<'FAKE'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >>"$DOCKER_TEST_CALLS"
case "$*" in
  "run --rm -i --network none --entrypoint node pianotechpros-web:verification --input-type=module - --require-no-build-tools") cat >/dev/null; exit "${RUNTIME_SECURITY_STATUS:-0}" ;;
  "buildx version") printf '%s\n' 'github.com/docker/buildx v0.35.0 fixture' ;;
  "buildx inspect default --bootstrap"|"compose build api web"|"image inspect "*-api:verification" "*-web:verification) ;;
  "buildx build --builder default --load --progress plain --file apps/api/Dockerfile"*)
    printf '%s\n' '#41 [build 7/7] RUN CGO_ENABLED=0 go build -o /out/ ./cmd/server' '#41 CACHED'
    ;;
  "buildx build --builder default --load --progress plain --file apps/web/Dockerfile"*)
    printf '%s\n' '#52 [build 8/8] RUN pnpm --dir apps/web build' '#52 CACHED'
    ;;
  *) echo "unexpected docker call: $*" >&2; exit 64 ;;
esac
FAKE
cat >"$test_dir/bin/gh" <<'FAKE'
#!/usr/bin/env bash
echo "gh must not run with the pinned Buildx fixture" >&2
exit 99
FAKE
chmod +x "$test_dir/bin/docker" "$test_dir/bin/gh"

DOCKER_TEST_CALLS="$test_dir/docker.calls" TMPDIR="$test_dir/logs" PATH="$test_dir/bin:$PATH" "$subject"
grep -qx 'compose build api web' "$test_dir/docker.calls"
test "$(grep -c '^buildx build --builder default --load --progress plain' "$test_dir/docker.calls")" -eq 2
grep -q '^image inspect .*api:verification .*web:verification$' "$test_dir/docker.calls"
test -z "$(find "$test_dir/logs" -mindepth 1 -print -quit)"
if grep -Eq '^build ' "$test_dir/docker.calls"; then
  echo "verification fell back to the legacy builder" >&2
  exit 1
fi

grep -qx 'install' "$SCANNER_TEST_CALLS"
grep -qx 'docker:pianotechpros-api:verification --fail-on high' "$SCANNER_TEST_CALLS"
grep -qx 'docker:pianotechpros-web:verification --fail-on high' "$SCANNER_TEST_CALLS"
for failed_image in api web; do
  for failure_status in 1 2; do
    : >"$SCANNER_TEST_CALLS"
    if SCANNER_FAIL_IMAGE="docker:pianotechpros-$failed_image:verification" SCANNER_FAIL_STATUS="$failure_status" DOCKER_TEST_CALLS="$test_dir/docker.calls" TMPDIR="$test_dir/logs" PATH="$test_dir/bin:$PATH" "$subject" >"$test_dir/failed.out" 2>&1; then
      echo "scanner findings/errors must fail image verification" >&2; exit 1
    fi
    test "$(grep -c '^docker:' "$SCANNER_TEST_CALLS")" -eq 2
    test -z "$(find "$test_dir/logs" -mindepth 1 -print -quit)"
  done
done
: >"$SCANNER_TEST_CALLS"
if SCANNER_INSTALL_STATUS=1 DOCKER_TEST_CALLS="$test_dir/docker.calls" TMPDIR="$test_dir/logs" PATH="$test_dir/bin:$PATH" "$subject" >"$test_dir/install-failed.out" 2>&1; then
  echo "scanner bootstrap failure must fail verification" >&2; exit 1
fi
test "$(cat "$SCANNER_TEST_CALLS")" = install
echo "Docker verification shares BuildKit cache, scans both images and fails closed"

: >"$SCANNER_TEST_CALLS"
if RUNTIME_SECURITY_STATUS=9 DOCKER_TEST_CALLS="$test_dir/docker.calls" TMPDIR="$test_dir/logs" PATH="$test_dir/bin:$PATH" "$subject" >"$test_dir/runtime-failed.out" 2>&1; then
  echo "Runtime security regression failure must fail verification" >&2; exit 1
fi
test ! -s "$SCANNER_TEST_CALLS"
