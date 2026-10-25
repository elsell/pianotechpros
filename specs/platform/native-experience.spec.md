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
