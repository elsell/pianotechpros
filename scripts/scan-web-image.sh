#!/usr/bin/env bash
# Retain raw findings; reconcile only the reviewed fixed runtime after execution.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
image="${1:?local web image required}"
evidence="${2:-build/production-image-evidence}"
mkdir -p "$evidence"
image_id="$(docker image inspect --format '{{.Id}}' "$image")"
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || { echo 'Invalid web image identity' >&2; exit 1; }
tag="pianotechpros-web:sha256-${image_id#sha256:}"
docker tag "$image_id" "$tag"
trap 'docker image rm "$tag" >/dev/null 2>&1 || true' EXIT
assert_identity() { test "$(docker image inspect --format '{{.Id}}' "$tag")" = "$image_id"; }
assert_identity
docker run --rm -i --network none --entrypoint node "$image_id" --input-type=module - --require-no-build-tools < scripts/check-node-runtime-security.mjs > "$evidence/runtime.json"
./.bin/grype "docker:$tag" -o json > "$evidence/web-raw.json"
assert_identity
python3 scripts/node-runtime-vex.py "$evidence/web-raw.json" "$evidence/runtime.json" "$image_id" "$tag" > "$evidence/web-fixed.vex.json"
result=0
./.bin/grype "docker:$tag" --vex "$evidence/web-fixed.vex.json" --fail-on high -o json > "$evidence/web-reconciled.json" || result=$?
assert_identity
if [[ "$result" -eq 0 ]]; then python3 scripts/node-runtime-vex.py --verify-result "$evidence/web-reconciled.json" "$image_id"; fi
exit "$result"
