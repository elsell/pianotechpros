#!/usr/bin/env bash
set -euo pipefail
# Creates and deletes only its own simulator; all data and endpoints are synthetic.
[[ "$(uname -s)" == Darwin ]] || { echo 'iOS UI acceptance requires macOS' >&2; exit 1; }
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
evidence="$root/build/ios-ui-evidence"
mode="${1:-fixtures}"
[[ "$mode" == fixtures || "$mode" == --real-profiles ]] || exit 1
if [[ "$mode" == --real-profiles ]]; then evidence="$evidence/real-profiles"; fi
mkdir -p "$evidence"
fixture_pid='' simulator='' services_dir=''
cleanup() {
  if [[ -n "$fixture_pid" ]]; then kill "$fixture_pid" 2>/dev/null || true; wait "$fixture_pid" 2>/dev/null || true; fixture_pid=''; fi
  if [[ -n "$simulator" ]]; then xcrun simctl shutdown "$simulator" >/dev/null 2>&1 || true; xcrun simctl delete "$simulator"; fi
  simulator=''
  if [[ -n "$services_dir" ]]; then rm -rf "$services_dir"; services_dir=''; fi
}
trap cleanup EXIT
node --test scripts/native-ui-fixture.test.mjs scripts/ios-metro-ready.test.mjs scripts/ios-journey-schedule.test.mjs
pnpm --dir packages/api-client exec tsx --test ../../scripts/native-public-contract.test.mjs ../../scripts/native-inventory-contract.test.mjs
python3 scripts/test_ios_simulator_entitlements.py
python3 scripts/test_ios_ui_bundle.py
python3 scripts/test_simulator_macho.py
if [[ "$mode" == fixtures ]]; then
  node scripts/run-native-ui-fixture.mjs 18082 > "$evidence/fixture.log" 2>&1 &
  fixture_pid=$!
else
  node scripts/check-native-real-profiles.mjs --empty > "$evidence/fresh-profiles.log"
  node scripts/seed-native-real-inventory.mjs > "$evidence/inventory-seed.json"
fi
export PIANOTECHPROS_APP_ENV=development PIANOTECHPROS_API_URL=http://127.0.0.1:18082
export PIANOTECHPROS_OIDC_ISSUER=http://127.0.0.1:18082/oidc PIANOTECHPROS_MOBILE_OIDC_CLIENT_ID=pianotechpros-mobile
export PIANOTECHPROS_INQUIRY_CHALLENGE_POLICY=disabled
export CI=1
for endpoint in http://127.0.0.1:18082/oidc/.well-known/openid-configuration; do
  ready=false
  for _ in {1..90}; do if curl --fail --silent --connect-timeout 2 --max-time 3 "$endpoint" >/dev/null; then ready=true; break; fi; sleep 1; done
  [[ "$ready" == true ]] || { echo "Native UI dependency failed to become ready: $endpoint" >&2; exit 1; }
done
(cd apps/mobile && bundle exec ruby ../../scripts/prepare-ios-ui-tests.rb)
xcrun simctl list devices available --json > "$evidence/devices.json"
selection="$(python3 - "$evidence/devices.json" <<'PY'
import json,sys
for runtime,devices in json.load(open(sys.argv[1]))['devices'].items():
    for device in devices:
        if '.iOS-' in runtime and device.get('isAvailable') and device['name'].startswith('iPhone') and device.get('deviceTypeIdentifier'):
            print(device['deviceTypeIdentifier'],runtime);sys.exit(0)
raise SystemExit('No available iPhone simulator runtime')
PY
)"
read -r device_type runtime <<< "$selection"
simulator="$(xcrun simctl create PianoInteractionAcceptance "$device_type" "$runtime")"
xcrun simctl boot "$simulator"
xcrun simctl bootstatus "$simulator" -b
xcrun simctl spawn "$simulator" defaults write NSGlobalDomain AppleLanguages -array en
workspace="$(find apps/mobile/ios -maxdepth 1 -name '*.xcworkspace' -print -quit)"
test -n "$workspace"
args=(-workspace "$workspace" -scheme PianoInteractionTests -configuration Release -sdk iphonesimulator -destination "platform=iOS Simulator,id=$simulator" -derivedDataPath build/ios-simulator CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=YES CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=)
if [[ "$mode" == fixtures ]]; then xcodebuild "${args[@]}" build-for-testing > "$evidence/build.log" 2>&1; fi
application="$(find build/ios-simulator/Build/Products/Release-iphonesimulator -maxdepth 1 -name '*.app' ! -name '*Runner.app' -print -quit)"
test -n "$application"
# Simulator entitlements live in Mach-O sections, not the host code signature.
codesign --verify --strict "$application" 2> "$evidence/signing.log"
executable="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$application/Info.plist")"
python3 scripts/simulator_macho.py "$application/$executable" "$evidence/embedded-entitlements.plist"
python3 scripts/check-ios-simulator-entitlements.py "$evidence/embedded-entitlements.plist"
python3 scripts/check-ios-ui-bundle.py "$application" > "$evidence/bundle-readiness.log" 2>&1
xcrun simctl install "$simulator" "$application"
run_journey() {
  local name="${journey_prefix:-}$1" method="$2" result=0
  xcodebuild "${args[@]}" test-without-building -parallel-testing-enabled NO "-only-testing:PianoInteractionTests/ProfileInteractionTests/$method" -resultBundlePath "$evidence/$name.xcresult" > "$evidence/$name.log" 2>&1 || result=$?
  if [[ -d "$evidence/$name.xcresult" ]]; then
    xcrun xcresulttool export attachments --path "$evidence/$name.xcresult" --output-path "$evidence/$name-screenshots" || result=1
  fi
  return "$result"
}
restart_app() {
  # Terminating an already stopped app is harmless; launch readiness is asserted
  # by XCTest's setUpWithError for every journey.
  xcrun simctl terminate "$simulator" com.pianotechpros.pianotechpros >/dev/null 2>&1 || true
}
verify_inventory() {
  if [[ "$mode" == --real-profiles ]]; then
    node scripts/check-native-real-inventory.mjs "$evidence/inventory-seed.json" > "$evidence/inventory-persisted.json"
  else
    node scripts/check-native-inventory-edit.mjs > "$evidence/inventory-persisted.json"
  fi
}
verify_profiles() {
  node scripts/check-native-real-profiles.mjs > "$evidence/profiles-persisted.json"
}
record_journey() {
  printf '%s\t%s\n' "${journey_prefix:-}$1" "$2" >> "$evidence/journeys.tsv"
}
: > "$evidence/journeys.tsv"
source "$root/scripts/ios-journey-schedule.sh"
if [[ "$mode" == --real-profiles ]]; then
  run_ios_real_profile_schedule
  journey_prefix=inventory-
  run_ios_real_inventory_schedule
else
  status=0
  run_ios_journey_schedule || status=1
  cleanup
  services_dir="$(mktemp -d "${TMPDIR:-/tmp}/piano-native-tools.XXXXXX")"
  rmdir "$services_dir"
  ./scripts/install-native-acceptance-services.sh "$services_dir" > "$evidence/service-install.log" 2>&1
  ./scripts/with-native-acceptance-services.sh "$services_dir" ./scripts/ios-ui-acceptance.sh --real-profiles || status=1
  exit "$status"
fi
