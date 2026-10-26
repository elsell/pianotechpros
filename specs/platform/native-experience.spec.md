# Native experience specification

## Android runtime build handoff

### Android mounting-listener race backport

The API 36 x86_64 development APK reproduced two cold-start SIGSEGVs at
`MountingCoordinator::pullTransaction+706`; disassembly of its matching BuildId
places the fault at the first override-delegate virtual dispatch. Installed
react-native-screens 4.23.0 contains the unsynchronized lazy listener assignment
described and fixed by upstream PR 4413, merged 2026-08-13 as
`b3badd012f83679b12f4e29f2e28eceaa4830efd` (older than fourteen days).

Backport those four C++ file changes with pnpm's hash-bound patch mechanism,
retaining the Expo-compatible 4.23.0 pin. Only translate upstream's
`cpp/legacy/` paths to this version's `cpp/` paths; document any additional
adaptation. Record MIT provenance and inspect the patch for unrelated data.
The process-lifetime listener, synchronized callback replacement and ownership
token must remain intact. Do not disable Fabric, navigation, crash observation,
or the native compatibility gate to work around the failure.

Validate frozen installation, dependency age, Expo compatibility, repository
checks and native Android compilation. Runtime acceptance must use the newly
built APK, verify artifact identity, and count cold launches that actually reach
the app, recording crashes separately from timeouts. Repeat authenticated stack
navigation and draft recovery. Zero observed crashes is bounded evidence, not a
proof of absence; iOS compilation and physical-device acceptance remain separate.

Every selected, successful Android native CI build retains only the generated
`app-debug.apk` as a commit-labelled artifact for seven days. A missing APK fails
the job. Artifact upload uses a reviewed immutable action commit; v7.0.2 was
published 2026-10-07, satisfying the fourteen-day age policy on 2026-10-23.
No signing material, environment files, source tree or Gradle cache is uploaded.
This is a development client requiring Metro and an isolated development backend,
not a signed store release or proof of native interaction acceptance. Runtime
evidence must identify the source commit and the actual journeys exercised.

Status: required design and acceptance standard for product slices. Dealer and
inventory text workflows are implemented; native photo presentation and device
interaction acceptance remain incomplete.

Use React Native/Expo for shared application plumbing while preserving platform
interaction vocabulary. iOS follows Apple's HIG; Android follows Android/Material
guidance. A web layout inside a native container does not meet this contract.
Choose the user's task and native pattern before choosing a component.

## Interaction decisions

| Task | Starting pattern | Required behavior |
| --- | --- | --- |
| Browse inventory and inspect a piano | Native stack/navigation, platform search | Normal Back, preserved search/scroll, meaningful empty/error states |
| Capture/edit a piano | Coherent full-screen editor | Photos first, keyboard-aware layout, recoverable draft, clear close/return |
| Choose a short flat value | Native labeled picker/menu | Visible current value; no extra navigation unless descriptions/search need it |
| Player system or price visibility | Native switch | Label, value and accessible state; private draft semantics |
| Take/import photos | System camera/photo picker | Permission at use, cancel/denial recovery, retained draft |
| Inspect a photo | Native full-screen presentation | Zoom/dismiss and return to editor |
| Publish/unpublish/sell | Explicit native confirmation or bounded task sheet | State consequence, cancel, retained draft, no accidental public update |

Use platform fonts and semantic colors, restrained branding and real instrument
photography. Avoid nested cards, ornamental dashboards and decorative AI motifs.
Do not copy Stuff Stash's household domain or palette as the piano brand. The
piano product should feel calm, precise and appropriate to valuable instruments.

## Adaptation and evidence

Provide Dynamic Type/font scaling, VoiceOver/TalkBack names and order, sufficient
contrast, light/dark appearance, reduced motion, suitable keyboard types and
reachable actions. No fixed height may clip scaled text. Test narrow phones,
large text, rotation and iPad/window resizing before claiming tablet support.
Use browser semantics and keyboard/focus behavior for web; do not impose mobile
controls on desktop. Shared domain orchestration does not require shared markup.

For each interaction, record task, selected pattern, commit/cancel semantics,
loading/empty/error/denied states, implementation adapter, and acceptance evidence.
Custom substitutes need a concrete platform limitation and a revisit condition.
A build, export or prop test is not native runtime evidence. Required device QA
covers keyboard, scrolling, navigation return, dismissal, permissions, interruption,
large text and screen readers. Physical capture/audio remain a separate gate.

Guidance reviewed for the scaffold on 2026-10-22:
- https://developer.apple.com/design/human-interface-guidelines/designing-for-ios
- https://developer.apple.com/design/human-interface-guidelines/pickers
- https://developer.android.com/design/ui/mobile

The owner's existing inventory workflow informs the acceptance contract. The
Stuff Stash UI design skill informed the task-first review method; no Stuff Stash
UI source or native modules are copied into this scaffold.

## Dealer directory slice

Use a native stack for shop list -> profile, with the platform Back action and
preserved list scroll position. The list is a FlatList with a native refresh
control, accessible shop rows and explicit pagination. Profiles use a scroll view
with grouped contact/address/service information. Text scales without fixed-height
rows; colors follow the device light/dark setting. Route parameters contain only
the shop identifier, never credentials or invitation codes.

Session state lives above navigation. Account changes remount private screen
state; credential rotation preserves it. Temporary outages retain the current
screen while the local credential is valid. Sign-out must immediately hide private
screens while secure-storage removal runs, and storage failure must retain an
explicit retry path. Every dealer operation captures a credential and an old-token
401 must not clear a newer credential. Access denial never renders stale profile
content. Native runtime navigation, large-text and screen-reader acceptance remain
required separately from TypeScript checks or Metro exports.

Layout and safe-area reference reviewed for this slice:
https://developer.apple.com/design/human-interface-guidelines/layout

## Native invitation consumption

The shop list offers Join shop as a separate native stack screen. Users paste a
private invitation code into a labelled multiline field with spelling correction
and capitalization disabled. No clipboard auto-read, URL parameter, storage or
analytics contains the code. Editing the field invalidates the preview. Preview
shows the shop, assigned role and localized expiry before a distinct Accept
action; acceptance is never triggered by navigation or preview.

Use the shared join controller through the credential-bound dealer adapter.
Clear entered code on successful acceptance/access and discard screen state on
back/dismissal or account change. Keep uncertain acceptance recoverable through
an explicit ordinary-access check; pending authorization must not open the shop.
Replace the join route with the profile only after that check succeeds. The
keyboard must not hide actions, content must scroll with large text, and busy,
failure and pending states must use localized accessible feedback. Runtime
keyboard, back navigation and screen-reader evidence remain separate gates.

## Native dealer profile forms

Create and edit use dedicated stack screens with grouped contact, address,
showroom and service-note fields. Use native text inputs with appropriate email,
phone and URL keyboards, a native showroom switch, keyboard-aware scrolling and
scalable text. All profile fields available on the web remain editable on mobile.
Cancel/back requires explicit discard confirmation after changes. Disable swipe
dismissal on these forms; during save or uncertain creation, back/cancel cannot
discard the original idempotent intent. Sign-out/account teardown still clears
private presentation. Uncertain creation retries its exact snapshot/key.

Edits send the loaded revision. A conflict blocks saving until the user fetches
and reviews current values and explicitly keeps their edits against that revision.
Fetching current values never silently overwrites the draft. Late save/review
results after disposal cannot restore state or navigate. Successful saves replace
the form with the saved shop profile. Shared orchestration must have controlled
fake coverage for conflicts, failures, uncertain creation and disposal; runtime
keyboard, discard dialog, large text and navigation acceptance remain required.

## Native staff administration

The profile opens staff administration in a native stack screen. Use grouped
member and invitation sections with independent pagination, native pull refresh,
localized pending/removed/expired states and scalable text. Owner rows expose no
mutation controls; editor/viewer changes send the displayed revision. Native
destructive confirmation dialogs identify the selected member/invitation and
must not act after dismissal or account teardown. Conflict requires refresh.

Invitation creation offers explicit viewer/editor choices and an integer expiry
from 1 through 168 hours. The returned one-time code is selectable in memory;
never auto-copy, auto-share or persist it. Clear it on dismissal, confirmed
revocation, explicit access rejection or screen teardown. Transient refresh
failure retains it for recovery. No automatic retry of invitation creation.
Acceptance still requires the separate join workflow. Device confirmation,
selection/copy, keyboard, screen-reader and large-text checks remain mandatory.

## Navigation compatibility correction

Expo Router 55 compares declared ranges in its doctor check: its required range
must be a subset of the app declaration, so any exact direct pin is rejected.
Declare `^7.1.33` in the mobile manifest solely for that metadata check; an exact
workspace override and frozen lockfile continue to pin native 7.1.34. The gate
requires the override to be exact and the installed version to equal it.
Pin bottom-tabs 7.15.5,
elements 2.9.10 and native-stack 7.14.5 as one compatible graph. Retain core 7.18.0
and routers 7.5.5 only while satisfying the installed packages' declared ranges.
These releases predate the fourteen-day age gate. The direct native dependency
supplies route/removal hooks; all navigators must resolve the same native module
instance to preserve context identity. Do not suppress Expo Doctor or add an
install exclusion for navigation.

The native compatibility gate must inspect original installed manifests, not just
lockfile peer ranges rewritten by pnpm overrides. Check navigation-family dependency
and peer ranges, Expo Router requirements, and shared native module resolution.
A version outside any declared range or a second native context fails the gate.
Run doctor, compatibility, age, type/tests, clean prebuild and both platform Metro
exports after the graph correction; hosted compilation and device interactions
remain separate required evidence.

## Native photo preparation boundary

Use the installed SDK 55 system photo picker and camera, then its native image
manipulator for bounded JPEG preparation. Exact picker, manipulator and filesystem
pins must match the SDK manifest and installed versions. Photo selection must not
request audio permission; the Android manifest explicitly blocks RECORD_AUDIO
until the separately specified voice feature needs it. Camera and photo usage
copy and platform permission localization must be installed before picker UI is
enabled. Preparation and temporary-file tests are not native camera, HEIC,
permission, process-restoration or photo-inspection acceptance evidence.

SDK references reviewed for the preparation adapter:
- https://docs.expo.dev/versions/v55.0.0/sdk/imagepicker/
- https://docs.expo.dev/versions/v55.0.0/sdk/imagemanipulator/

Native permission configuration now reads camera/library usage strings directly
from the complete English/Spanish shared catalogs. The picker plugin disables
microphone permission, and prebuild checks actual iOS Info.plist/InfoPlist.strings
and Android manifest output. Android/iOS supported locales are explicit. System
camera authorization is requested only for the camera action; library selection
uses the system picker without requesting broad library access. A denied camera
request is distinct from a cancelled selection and leaves the draft intact.

Picker restoration uses the protected intent and device-only opaque global launch
nonce described in photos.spec.md; it never attaches an unlabelled result based
on the visible screen alone. Its controlled-fake evidence does not replace actual
activity-destruction, account-switch, permission or camera acceptance.

## Inventory photo inspection

Opening a gallery photo starts a full-screen, safe-area-aware inspection view.
Keep Close and Photo details explicit and reachable without a gesture. Details
opens the description/order/removal controls for the same photo; returning to
inspection and closing preserves the editor/gallery position.

Use the iOS native zooming scroll view with a 1–4× range. Android recognizes pinch
and one-finger pan in the bounded image viewport, preserving the touched focal
point and clamping translation so a zoomed image cannot be lost offscreen. Fit the
actual image aspect ratio at 1×; no invented crop. A contact-count/identity change
reanchors the gesture without a jump. Reject nonfinite geometry; reset safely on
viewport/image size change and gesture interruption. Do not intercept outside the
image viewport. No network or persistence is involved in zoom/pan.

Both platforms expose localized Zoom in, Zoom out and Reset controls plus current
zoom, with disabled states at limits and screen-reader descriptions. The inspection
view cannot compete with an enclosing vertical details scroller. Pinch, pan,
rotation, large text, VoiceOver/TalkBack and dismissal require device acceptance;
geometry tests and exports alone cannot establish that acceptance.

## Publication and sale task

The inventory editor opens a single full-screen modal for public snapshot review
or sale/correction entry. A safe-area header exposes Cancel; Android Back and
accessibility escape use the same cancellation boundary. Review and entry occupy
one modal, never nested sheets. Inline labeled status/currency radio groups
collapse after selection; current values remain visible. Keyboard-aware scrolling,
a decimal-pad Done accessory on iOS, semantic colors and scaling text preserve
platform presentation. Confirmation sits below the scrollable review and becomes
unavailable during submission. Parent navigation remains protected while the task
is open or a command is pending.

Public review excludes private fields and loads at most six ordered image
previews. Commands use the shared single-use revision review; rejected sale input
remains in memory, and account teardown hides it. Numeric parsing and currency
review retain exact safe minor units. Restored or invalid private edits require
explicit resolution before publication.

Source checks and Metro exports provide implementation evidence only. Native
Back/cancel, keyboard, Dynamic Type, screen-reader focus, rotation, interruption
and real-backend journeys remain unverified until executed on native builds.

## System-bar contrast

The root native navigation stack explicitly selects dark status-bar content for
light surfaces and light content for dark surfaces, using the same system color
scheme as the app palette. Modal tasks inherit this policy. Theme changes must
keep the status bar readable both in the stack and while a modal is open. Check
actual device rendering; palette or compilation tests alone are insufficient.

Android React Native dialogs copy activity appearance at creation. A project-local
Expo prebuild plugin adds an activity configuration callback that updates status
icons on currently shown, app-owned React Native dialogs to match the system
palette. Traverse only this activity's view tree and owned dialog roots, guard
against duplicate views, and never remount modal content to change appearance.
Keep the generated hook idempotent and reject unknown activity formats or an
existing custom configuration callback instead of overwriting it. No framework
patch or new dependency is needed. Native compilation and an open-dialog theme
transition are required acceptance gates for this hook.

Native action buttons retain the platform Button behavior with a shared semantic
palette. Android uses the color as a filled background under white text; iOS
uses it as foreground text. Do not reuse a pale dark-mode foreground accent as
an Android fill. Enabled primary and destructive button labels require at least
4.5:1 contrast in light and dark modes. Test the actual palette values and inspect
device rendering. All application native Buttons use the shared adapter so
unconfigured default buttons cannot bypass this palette.

## Action touch targets

Shared native actions must expose at least 48 by 48 density-independent pixels
on Android and 44 by 44 points on iOS. Increasing surrounding layout whitespace
without increasing the actionable accessibility bounds is insufficient. Retain
platform-appropriate feedback, shared contrast-safe colors, localized labels,
font scaling, disabled/busy semantics and keyboard/accessibility activation.
Do not create overlapping expanded hit regions or nest accessible buttons.

Validate actual native accessibility bounds and edge activation at normal and
large text sizes. The Android customer profile currently exposes Timezone,
Remove and Save profile actions with 93px height at 420dpi (about 35.4dp), below
this contract. This is a confirmed native acceptance gap, not a completed row.
Reference guidance: Android accessibility Views recommends 48dp touch targets;
Apple button HIG recommends 44pt hit regions. These requirements do not make
build success equivalent to device or screen-reader acceptance.

The shared action adapter now retains React Native's platform touch primitives
(Android native feedback and iOS opacity feedback) with actionable minimum bounds.
The original three Android location actions passed at 48dp after the change;
home actions also passed, and an edge tap opened the customer profile. At 2x
font scale, Add location, Add piano and Save profile remained at least 48dp, with
readable labels in the inspected screenshot. Typechecking and eight palette
contrast tests passed. iOS runtime, disabled/busy activation and broader
screen-reader acceptance remain separate checks; this evidence does not close
those requirements.

## Choice control accessibility values

Profile choice controls must expose both the localized field label and current
selection in native accessibility data. A field-name override must not hide the
visible value. Use the same localized selection text for the visible title and
accessibility value, including the empty-selection prompt and multiple choices.
Verify the actual native accessibility tree; source attributes alone do not
establish runtime delivery or spoken VoiceOver/TalkBack acceptance.

Android acceptance captured a failing customer Timezone control (label only,
visible UTC child) before this correction. The same native-tree assertion passes
afterward with `Timezone, UTC`; technician work choices expose `Services offered,
Tuning` and `Piano types serviced, Grand`. No profile data was changed for these
checks. Typechecking and the two-locale structural gate pass. This verifies native
value delivery, not spoken announcement quality, iOS interaction or full profile
accessibility acceptance.

Single-choice profile sheets use radio semantics with an explicit checked state
for every option. Do not substitute the generic selected state for checked:
Android must expose radio options as checkable and mark the current option
checked, with other options unchecked. Multiple-choice sheets retain checkbox
semantics and checked states. Verify current and alternate options in the native
tree, including after searching, without saving changes to the synthetic profile.

The Android regression failed before the change: the selected radio option had
`selected=true` but `checkable=false` and `checked=false`. Afterward, a searched
customer timezone sheet exposes UTC as checkable/checked and Etc/UTC as
checkable/unchecked. The regression inspects native radio nodes, not visual
highlighting. Technician single-choice runtime validation subsequently passed on 2026-10-26:
normal home navigation to Service area exposed `Time zone, UTC`; searching the
sheet for UTC exposed UTC as checkable/checked and Etc/UTC as
checkable/unchecked. Done dismissed the sheet with UTC unchanged and the profile
still up to date. The first snapshot preceded filtered rendering; a fresh
snapshot verified the options. Retained native trees are
`android-technician-timezone-radio.xml` and
`android-technician-timezone-dismissed.xml`. This used the existing Android
development client and Metro with the merged PR #83 choice adapter, not a fresh
exact-head APK or spoken TalkBack/iOS acceptance.

## Home navigation hierarchy

The home screen must prioritize access to shops and use ordinary navigation rows
for customer/technician profiles and shop creation/joining, rather than presenting
every destination as a filled primary action. Account status and sign-out are
secondary to work navigation. Keep scan access explicit. Use one scrolling
surface for the complete signed-in home, including account controls and shops,
so large text on a short screen cannot reserve most of the viewport for controls.
Rows use platform press feedback, full localized names, at least 48dp/44pt hit
areas, wrapping text, and disabled semantics. Preserve refresh, pagination,
errors, session restoration and pending scan redirection. Validate normal and
2x text on the Android emulator, including navigation and return; iOS interaction
and spoken screen-reader acceptance remain separate. This follows Apple HIG
hierarchy guidance: https://developer.apple.com/design/human-interface-guidelines .

Android emulator execution on 2026-10-26 passed normal rendering and a
1080×1600 viewport at 2× font scale. A single swipe moved the account/profile
header out of view and exposed the complete shop row; opening it showed the
correct dealer and inventory action, and Back retained the scrolled directory.
Normal and large-text screenshots were inspected. Typechecking and both-locale
structural checks pass. Display overrides were restored. This is not spoken
TalkBack, iOS, or physical-device acceptance.

Theme switching must update navigation-row backgrounds and text together without
relaunch or interaction. Android runtime testing exposed white row backgrounds
after a light-to-dark transition while text already used the light-green dark
palette. Preserve screenshot evidence and verify both directions before merge.

Moving the background/border to the enclosing themed view with a foreground
ripple fixes the observed transition. Actual emulator screenshots now show
`#1c2721` on account, profile and shop-action rows after switching to dark,
and white after switching back, without relaunch. Customer navigation still
opens correctly. Typechecking and review pass; the original light setting was
restored. This evidence is specific to the tested Android runtime.

## Android photo interaction evidence — 2026-10-26

The existing Android emulator development client, using the isolated synthetic
API and the cached Metro source from `83e1f43` with the PR #85 home correction
(`7b7ffff`), exercised these normal UI paths. This is bounded runtime evidence,
not a new exact-head native build or a physical-device result.

- Inventory → New piano → Take a photo opened the system camera without required
  setup fields. Cancelling returned to the untouched editor and lazy-draft prompt.
- After entering a synthetic Make value and seeing Saved, camera cancellation
  preserved that value. Revoking camera permission restarted the process; normal
  inventory search reopened the saved draft. Denying the subsequent system prompt
  retained its text and displayed library/Settings guidance.
- Shutter → Done produced a pending selection. Add selected photo uploaded to the
  real isolated API and rendered the captured emulator scene as Photo 1/Cover.
  Subsequent captures retained the prior photos and text.
- A test-only loopback proxy rejected one upload before forwarding and recorded
  HTTP 503. The editor retained the selection and prior photos, displayed
  uncertainty guidance, and offered Retry upload. That action reused the selection
  without another capture, reached the real API, returned 201 and rendered Photo 4.
  The saved Make value remained intact. The direct API route and camera permission
  were restored; the fault proxy was stopped. No photo was published.

Retained evidence includes `android-new-photo-first.xml`,
`android-new-camera-cancel.xml`, `android-camera-denied-saved-draft.xml`,
`android-camera-upload.png`, `android-upload-confirmed-503.xml`,
`android-upload-pending-retry.xml`, `android-upload-retry-complete.xml`,
`android-upload-retry-retained-text.xml` and `android-upload-fault-events.jsonl`.
The first route-removal attempt did not interrupt the request, and the first proxy
matcher missed the revision query parameter; neither is counted as failure proof.
Only the recorded 503 followed by 201 supports the retry result.

This does not establish lost-success-response recovery, physical camera/library
coverage, spoken screen-reader quality, iOS interaction, or complete PH-01/PH-02
acceptance. Those gates remain open.

Follow-up reopen initially found a recovery-state defect: after the successful
503 retry and process restart, the editor still displayed the interrupted-picker
warning. Check interrupted selection did not clear it. The upload queue completed,
but the separate picker intent remained in processing state because its accept
call had failed during the first upload. The successful upload evidence above
stands; the handoff/reconciliation UX is not complete. Require a regression and
an ownership-safe durable handoff before clearing this finding. Never clear an
untransferred selection merely to hide the warning.

### Durable picker-to-upload transfer

Native selection consumption must acknowledge transfer once the capture journal or upload coordinator
has durably stored the selected bytes and intent, before record creation or upload
respectively. A new capture must not wait for record creation to acknowledge its
durable staging; failed creation remains owned by capture recovery. The
picker broker may clear its processing intent only at that acknowledgement (or
normal completed acceptance). Upload failure after transfer remains owned by the
upload queue and must not recreate an interrupted-picker warning on reopen.
Failed staging, failed picker cleanup, expired or inactive scope must not dispatch
an upload or discard an untransferred selection. Acknowledgement is valid only
while the accepting call is active; reject late callbacks to prevent clearing a
later selection. Existing ambiguous processing intents without a recorded transfer
remain recoverable by explicit review/discard; do not infer ownership from an
empty queue. Verify real durable ports, preserved retry identity and restart state.
After a failed consume, a successful protected restore to idle proves the picker
no longer owns recovery. Clear only that picker error; the upload workspace must
continue to display its failure and retry entry. Do not suppress initial picker,
selection, storage or unknown-target failures on the same basis.

## Android durable handoff and lost-response evidence

PR #89 merged the durable handoff and picker-presentation correction at
`8d3b695ce03156c5a7b06568ad778fe5b6052714`. Exact source
`cf60afbe9ab7175f6128957db09b6389e55561b1` passed real-service acceptance
and both native builds in run `40384588702`; verification reported only the
authorized node-forge advisory with all 21 mitigation regressions passing.

Android development-client runtime checks using the four corrected modules
confirmed that a rejected upload retained an explicit retry, successful retry
removed the upload error, and normal navigation after process restart showed
Photo 7 and the saved Make value without interrupted-picker controls. Existing
ambiguous pre-fix selections still require explicit review/discard.

A subsequent test forwarded a camera upload to the real isolated API, observed
201, and closed the proxy socket before sending any response to the client. The
app showed an unconfirmed-operation message, retained Retry upload and did not
show stale picker recovery controls. Explicit retry without recapture returned
201. The last photo page contained exactly Photo 7 and Photo 8 with Next photos
disabled; the saved Make value remained intact. This establishes the tested
lost-successful-response retry without an extra photo. The proxy logged only
event/status pairs, was stopped afterward, and direct API access was restored.

Retained evidence: `android-handoff-final-503-no-picker.xml`,
`android-handoff-final-reopened.xml`, `android-handoff-final-photo7-and-text.xml`,
`android-photo-lost-response.xml`, `android-photo-lost-response-pending.xml`,
`android-photo-lost-response-final-page.xml`,
`android-photo-lost-response-exact-last-two.xml`, and
`android-photo-lost-response-events.jsonl`. The runtime used an existing
development client and Metro, not a newly installed exact-head APK. Physical
camera/library, iOS, and spoken accessibility acceptance remain separate.

## Android shop editor interaction evidence

On 2026-10-26, the synthetic shop's native Edit profile form remained scrollable
at 2x font scale. The focused Email field was fully visible above its email
keyboard, and scrolling reached the bottom Save changes action with readable
text. Cancel without edits returned to the shop. Screenshots
`android-shop-large-email-keyboard.png` and `android-shop-large-bottom.png` were
inspected; corresponding native trees were retained. Normal font scale was restored.

At normal text size, entering an unsaved name change then pressing Cancel opened
Discard changes. Continue editing preserved the unsaved text. A second Cancel
and explicit Discard changes returned to the shop; reopening Edit profile showed
the exact original saved name. No save was performed. Native evidence:
`android-shop-dirty-discard-dialog.xml`, `android-shop-dirty-continued.xml`,
`android-shop-discard-reopened.xml`. This checks the named existing development
client interactions, not every field/keyboard, dirty process recovery, save
conflicts, spoken TalkBack, iOS or physical-device usability.

## Android voice permission and cancellation — 2026-10-26

The existing Android development client reopened the isolated synthetic
CameraCancelAcceptance draft. Record voice note requested microphone permission
at use; denying it displayed the localized Settings/manual-transcript recovery
message. Typing an unapplied transcript and choosing Cancel voice returned to
the editor without applying it. After restoring permission, Record voice note
showed recording state, an input meter and Stop and review. Cancel voice returned
to the existing draft with its saved Make unchanged. Android appops reported a
completed 14.143-second microphone use after cancellation, not active recording.

Native trees are retained as `android-voice-denied.xml`,
`android-voice-denied-cancel.xml`, `android-voice-recording.xml` and
`android-voice-recording-cancel.xml` in the local 2026-10-25 evidence root.
The original microphone grant and permission flags were restored and the app
force-stopped. Stop and review and Apply were not invoked. This verifies emulator
permission/cancellation behavior, not speech-provider integration, recording
quality, physical-device or iOS acceptance.
