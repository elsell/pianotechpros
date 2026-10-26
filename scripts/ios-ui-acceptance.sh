#!/usr/bin/env bash
set -euo pipefail
# Creates and deletes only its own simulator; all data and endpoints are synthetic.
[[ "$(uname -s)" == Darwin ]] || { echo 'iOS UI acceptance requires macOS' >&2; exit 1; }
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
evidence="$root/build/ios-ui-evidence"
mkdir -p "$evidence"
fixture_pid='' metro_pid='' simulator=''
cleanup() {
  if [[ -n "$metro_pid" ]]; then kill -TERM -- "-$metro_pid" 2>/dev/null || true; fi
  if [[ -n "$fixture_pid" ]]; then kill "$fixture_pid" 2>/dev/null || true; fi
  if [[ -n "$simulator" ]]; then xcrun simctl shutdown "$simulator" >/dev/null 2>&1 || true; xcrun simctl delete "$simulator"; fi
}
trap cleanup EXIT
node --test scripts/native-ui-fixture.test.mjs
python3 scripts/test_ios_simulator_entitlements.py
node scripts/run-native-ui-fixture.mjs 18082 > "$evidence/fixture.log" 2>&1 &
fixture_pid=$!
export PIANOTECHPROS_APP_ENV=development PIANOTECHPROS_API_URL=http://127.0.0.1:18082
export PIANOTECHPROS_OIDC_ISSUER=http://127.0.0.1:18082/oidc PIANOTECHPROS_MOBILE_OIDC_CLIENT_ID=pianotechpros-mobile
export CI=1
NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--dns-result-order=ipv4first" python3 -c 'import os; os.setsid(); os.execvp("pnpm", ["pnpm", "--dir", "apps/mobile", "start", "--port", "18081", "--localhost"])' > "$evidence/metro.log" 2>&1 &
metro_pid=$!
for endpoint in http://127.0.0.1:18082/oidc/.well-known/openid-configuration http://127.0.0.1:18081/status; do
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
args=(-workspace "$workspace" -scheme PianoInteractionTests -configuration Debug -sdk iphonesimulator -destination "platform=iOS Simulator,id=$simulator" -derivedDataPath build/ios-simulator CODE_SIGNING_ALLOWED=YES CODE_SIGNING_REQUIRED=YES CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM=)
xcodebuild "${args[@]}" build-for-testing > "$evidence/build.log" 2>&1
application="$(find build/ios-simulator/Build/Products/Debug-iphonesimulator -maxdepth 1 -name '*.app' ! -name '*Runner.app' -print -quit)"
test -n "$application"
codesign --force --sign - --entitlements "$evidence/simulator.entitlements" "$application"
codesign --display --entitlements :- "$application" > "$evidence/signed-entitlements.plist" 2> "$evidence/signing.log"
python3 scripts/check-ios-simulator-entitlements.py "$evidence/signed-entitlements.plist"
xcrun simctl install "$simulator" "$application"
run_journey() {
  local name="$1" method="$2" result=0
  xcodebuild "${args[@]}" test-without-building -parallel-testing-enabled NO "-only-testing:PianoInteractionTests/ProfileInteractionTests/$method" -resultBundlePath "$evidence/$name.xcresult" > "$evidence/$name.log" 2>&1 || result=$?
  if [[ -d "$evidence/$name.xcresult" ]]; then
    xcrun xcresulttool export attachments --path "$evidence/$name.xcresult" --output-path "$evidence/$name-screenshots"
  fi
  return "$result"
}
run_journey create testCreateProfilesAndProtectPartialDraft
xcrun simctl terminate "$simulator" com.pianotechpros.pianotechpros || true
run_journey restore testRestorePartialDraftAfterProcessRestart
