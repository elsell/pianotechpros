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

The hosted iOS inventory journey must open an incomplete saved draft through
normal navigation and verify publication readiness before any confirmation.
Missing form/condition guidance opens the corresponding native choice sheet;
dismissing it preserves the saved value. Missing-photo guidance returns to the
photo controls. No confirmation action is offered for the incomplete record.
The controlled HTTP fixture exposes scoped, read-only record/photo/publication
state for this presentation test and rejects unknown records and mutations.
This does not prove real publication persistence, capture, or provider behavior.

The hosted iOS interaction gate must also run XCTest accessibility audits of
stable home, public directory/catalog/listing, empty-showroom visit information,
and both upper/lower native buyer-form viewports. Run all audit categories without
an issue-suppression handler. Retain a named screenshot and accessibility tree
for every audited viewport, including failures. Require an audit-capable iOS
runtime instead of silently skipping on older simulators. An audit failure fails
the job. These automated checks do not establish VoiceOver spoken order,
physical-device usability, all scroll positions or full application conformance.
The audit contract follows Apple's
[XCUIAccessibilityAuditType documentation](https://developer.apple.com/documentation/xcuiautomation/xcuiaccessibilityaudittype).

The hosted journey scheduler must retain independent failure evidence in one
build. A failed public journey must not prevent profile or accessibility checks;
a failed profile setup blocks its restoration and authenticated inventory chain.
Inventory browsing and readiness remain independent after successful profile
setup. Inventory restart verification requires both successful editing and the
independent persisted-state check. Record passed, failed and blocked results;
any failed or blocked required journey fails the overall gate. Restart the app
between journeys and preserve result attachments even on failures. This changes
execution scheduling, never assertion strength or acceptance scope.

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

## Android button state repaint

A 2026-10-26 photo-inspection runtime check exposed stale button fills after
zoom state changed: at 400%, Zoom out/Reset were enabled in the native tree but
retained their initial pale disabled backgrounds; Zoom in was disabled but
retained its initial green fill. The screenshot is
`android-photo-inspect-pan.png`, with matching native trees under the local
2026-10-25 evidence root. Zoom limits, Reset, details/inspection return and
Close preview passed, but this visual regression prevents acceptance.

A button's fill, label color and accessibility enabled state must update together
in both directions. Keep Android native ripple feedback separate from the
state-dependent fill by using foreground feedback on supported Android versions.
The minimum supported Android version permits that native capability. Preserve
iOS opacity feedback, touch targets and state semantics. Verify the actual
100% -> 400% -> 100% photo controls in the emulator and inspect retained screenshots;
a component-prop assertion alone cannot prove native repaint.

Reference: https://reactnative.dev/docs/touchablenativefeedback#useforeground

With foreground ripple enabled, the same Android development client passed
100% -> 400% -> Reset to 100%, with enabled/disabled native-tree states at both
limits. Inspected `android-photo-foreground-maximum.png` and
`android-photo-foreground-reset.png` show matching green enabled and pale disabled
fills in both directions. Matching XML, initial-state and post-pan screenshots
are retained under the same evidence root. This is runtime source-module evidence,
not a rebuilt APK or iOS execution; pinch, rotation, spoken accessibility and
physical-device acceptance remain open. Mobile TypeScript checking passed.
The corrected-runtime run also returned through Photo details -> Inspect photo,
then Close preview to the original gallery position. The app was force-stopped
and the temporary source overlay was restored after execution.

## Android publication review cancellation — 2026-10-26

The existing Android development client reopened the isolated synthetic
CameraCancelAcceptance record with its saved text and photos. Review publication
presented the saved Make/stock details, private-price indication, snapshot
explanation, and separate Cancel/Confirm change actions. Android Back dismissed
the sheet; reopening and using Cancel also returned to the editor displaying
Draft · Not published yet. Neither path activated Confirm change.

Retained native trees are `android-publication-before-review.xml`,
`android-publication-review.xml`, `android-publication-back-cancel.xml`, and
`android-publication-explicit-cancel.xml` under the local 2026-10-25 evidence
root. This checks the existing development-client presentation with current
source modules, not a newly installed exact-commit APK, public publication,
physical-device, spoken accessibility, or iOS acceptance.

At 2x system text size, the review action remained reachable by scrolling.
The review sheet's Cancel and Confirm change controls were both within the
viewport, with readable unclipped labels in the inspected screenshot. Cancel
returned to the editor; system text size was restored to 1.0. Evidence:
`android-publication-large-review.xml` and `.png`. This checks the visible
review header/actions and initial content, not every field or photo at 2x text.

After cancellation, Refresh publication status again returned Draft · Not
published yet (`android-publication-refreshed-after-cancel.xml`). The app was
force-stopped after the check. No Confirm change action was invoked.

## iOS choice-control acceptance selectors

Run `40403194496` at source `7ae6c7d` passed iOS compilation and loopback sign-in,
then entered customer contact/location fields and opened Timezone. The create
journey failed at `app.buttons["UTC"]`; it did not reach profile save or restart.
The status-bar transition error from the earlier run no longer prevented entry.
The pinned React Native iOS implementation gives radio/checkbox controls no button
trait and exposes their role plus checked state in the accessibility value.
Customer and technician choices intentionally use those roles.

The XCTest journey must locate exact option labels together with the expected
radio/checkbox value, require reachability, and activate that element. Checkbox
selection must additionally assert the resulting checked value. Do not change
product roles to satisfy a button-only selector, use coordinates, silently skip
missing options, or omit selection. Retain the synthetic picker accessibility
tree to diagnose role/value disagreements in hosted runs. A new successful hosted
journey is required; source inspection and local checks do not prove execution.

## Android short-display photo inspection — 2026-10-26

The existing Android development client, using current Metro source and the
isolated synthetic API, opened photo inspection with a 1080x1600 display override
and 2x font scale. The inspected `android-photo-large-short.png` shows the photo,
full control labels and explanatory text within the viewport. A separate runtime
interaction reached 400% through six Zoom in activations, checked disabled Zoom in,
reset to 100%, and closed to the original gallery. Native trees are retained as
`android-photo-short-interaction-{maximum,reset,dismissed}.xml` under the local
2026-10-25 evidence root. The check restored normal display size/font scale and
force-stopped the app. This establishes the named layout and button interactions,
not pinch, rotation, spoken accessibility, physical-device or iOS acceptance.

## Android customer linked-location protection — 2026-10-26

Through the native customer editor, a synthetic Grand piano named
LocationGuardAcceptance was saved against the existing Home location. Home then
showed the explanation to move linked pianos before removal, without a Remove
action. The unlinked Studio location offered Remove, required confirmation, and
remained after Cancel. After force-stop and relaunch, the profile reported its
saved state and displayed both locations and the piano linked to Home.

Native trees `android-customer-location-{linked-guard,unlinked-confirm,cancelled,
piano-linked,restarted-saved,restarted-linked}.xml` are retained under the same
local evidence root. This used the existing development client and Metro with
isolated real services. Actual deletion, reassignment, iOS, physical-device and
spoken-accessibility acceptance are separate; no full CU-01 completion is claimed.

## Android current-build acceptance — 2026-10-26

Run `40403194496` built the Android development APK for PR #66 source
`7ae6c7d0380939bb97b17c483fd70d684472e08f`. Artifact `12691560692` is named
`android-development-8326c49935b9af999dff2f64b8414b0062c1052e` (the tested PR merge
revision). Its archive passed ZIP integrity checking. The extracted and installed
APK share SHA-256
`0ccb80f19fa7d5fb3979117575d4224b95519fd9641eee7565637c89016f0c28`.
An in-place install retained the synthetic app data. Metro served the unchanged
source head above; this is a development build, not a signed store release.

The fresh build reopened the saved customer profile with both locations and the
piano assigned to Studio. At 1080x1600 and 2x text, photo inspection reached 400%,
disabled further Zoom in, reset to 100% and closed back to the gallery. Native
trees use `android-fresh-apk-customer-location-*` and
`android-fresh-apk-photo-short-*` under the local 2026-10-25 evidence root;
`android-fresh-apk-provenance.json` records build/install identity. Display size
and text scale were restored and the app stopped afterward.

Before that install, the native editor reassigned LocationGuardAcceptance from
Home to Studio and saved it through the isolated real API. Studio then prevented
removal while Home offered Remove. A process restart retained the saved Studio
assignment and both locations. No location was deleted. Trees
`android-customer-location-{reassigned-row,reassigned-guard,former-location-removable,
reassigned-restarted-saved,reassigned-restarted-linked}.xml` retain these checks.

On the fresh APK, Android's per-app locale override `es` produced Spanish home
navigation and the saved customer profile. The inspected
`android-fresh-apk-spanish-customer.png` shows translated privacy/status text and
contact labels without clipping at normal text size. Matching home/customer trees
are retained. The original empty locale override was restored and verified before
stopping the app. External synthetic profile values remained unchanged.

These named checks strengthen Android build and interaction evidence only. They
do not establish every screen/locale, actual deletion, physical camera/audio,
spoken TalkBack, iOS interaction or complete CU-01/PH acceptance. The same run
passed browser/API acceptance; its verification job reported only the previously
reviewed node-forge advisory and passed all 21 mitigation tests. Its iOS
interaction result was still pending when these Android results were recorded.

## iOS simulator-side launch readiness

Run `40409134653` compiled successfully but failed before sign-in: the retained
accessibility hierarchy shows the development launcher reporting a timeout for
`http://127.0.0.1:18081`. Host-side manifest/bundle priming passed, so it does
not establish connectivity from the simulator process. The choice-selector
correction was not exercised in this run.

Before opening the development URL, the XCTest runner must check Metro's status
from inside the simulator with a bounded request, validate the HTTP response and
exact readiness body, and launch the app to the foreground before delivering
the URL. This separates simulator connectivity failure from application loading
and avoids delivering the URL during a cold application launch. The cold-launch
race is a hypothesis, not a proven diagnosis. Keep every existing sign-in, save
and process-restart assertion; do not retry product mutations or accept the
launcher as a successful application start. Hosted execution remains required.

## iOS launcher request-path diagnostics

Run `40413380865` at `9b9498b` passed simulator-side `/status` readiness,
Android compilation and the broader acceptance job, but failed before sign-in.
Its retained hierarchy shows the development launcher reporting a request timeout;
this is not profile interaction acceptance. The pinned Expo launcher first probes
the development URL with HEAD before fetching its manifest. Host readiness must
exercise HEAD followed by manifest/bundle GET, and the simulator diagnostic must
probe HEAD with the same iOS platform/Accept headers before launching the app.
A HEAD failure must stop readiness and preserve a stage-specific diagnostic;
never hide it by retrying sign-in or increasing product waits. This expands
observability, not a claim that HEAD caused the observed failure or fixes it.

## Native control boundary contrast

A fresh Android dark-mode customer-screen inspection on 2026-10-26 exposed faint
input outlines. The palette border contrast is approximately 1.37:1 against the
light page and 1.98:1 against the dark surface. Empty fields cannot rely on their
entered text to identify the editable region. The shared native border color must
provide at least 3:1 contrast against both the page background and surface in each
theme. Preserve existing text/button contrast and the native interaction behavior.
Keep disabled Android button fills independent from control boundaries, retaining
their existing palette colors and at least 4:1 secondary-label contrast as an
application readability target (inactive controls are exempt from WCAG 1.4.11).
Use unrounded luminance-ratio regressions and inspect light/dark runtime screens;
this bounded correction is not a claim of complete accessibility conformance.

Reference: https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html

The correction passes all 12 native palette tests. Light boundary contrast is
3.75:1 against the page and 4.07:1 against the surface; dark contrast is 5.50:1
and 4.71:1 respectively. Android emulator screenshots on 2026-10-26, using
the development APK from run `40403194496` with these two source modules served
by a freshly started Metro, show the corrected customer input outlines in both
themes and retain the original disabled photo-control fills. Saved synthetic
customer data remains visible. Evidence uses the local
`android-control-contrast-final-*` screenshot/UI-tree set. This is development
client runtime evidence, not a newly compiled release or iOS interaction result.
Both themes also passed the photo preview transition from 100% with Reset
disabled to 150% with Reset enabled, followed by reset and dismissal. The runtime
helper restored the original source modules and light-mode device setting.

## Native orientation adaptation

The application must allow system-selected portrait and landscape orientation.
The scaffold's portrait lock prevents required rotation acceptance and must be
removed. Verify the actual generated Android activity orientation and iOS
supported-orientation list using the pinned Expo config adapters. Runtime
acceptance must assert landscape window dimensions, reachable photo controls,
reset/dismissal and retained editor data; changing a device setting alone is
not proof that the application rotated. Photo viewport resize may reset zoom
to fit; it must not discard the draft or trap the user in the preview. A new
native binary is required before runtime acceptance of this config change.
Full-screen photo, publication and scan-action modals must explicitly support
portrait and both landscape directions on iOS; the application orientation list
alone does not override React Native's portrait default for these modals.

On 2026-10-26, the existing Android APK remained 1080x2400 after landscape was
requested, confirming the baseline lock. The helper's zoom/reset/dismiss checks
passed but are not landscape acceptance; its captures are marked
`android-fresh-apk-photo-rotation-locked-baseline-*`. Both pinned Expo adapter
regressions failed before the configuration change and pass afterward. Mobile
TypeScript and configuration validation pass. Actual rotated-window acceptance
remains pending a rebuilt binary.

## Android confirmed customer location removal

On 2026-10-26, the development APK from run `40403194496`, served primary
source `c12ce7f0e2293cf1ba8dc0a3b4fb4455667b494d` through Metro, passed the
confirmed-removal path against the isolated real API. After the prior reassignment
of the synthetic piano to Studio, the now-unlinked Home location was removed
through the native confirmation and explicit Save profile action. Process restart
showed the saved status, Studio and its linked piano, with Home absent. Opening
Studio retained the last/linked-location protection and exposed no Remove action.

The local `android-customer-remove-confirm-*` UI trees retain confirmation,
restarted status/locations/piano and remaining-location guard evidence. The helper
exited successfully and stopped the app. The synthetic account now has one
location; later tests must not assume the removed Home location exists. This
complements cancellation/reassignment evidence without claiming iOS, spoken
accessibility, physical-device or complete customer parity.

## Android confirmed publication visibility

On 2026-10-26, the same isolated development-client setup completed native
review/confirmation for a synthetic piano with a processed photo. Anonymous
HTTP access returned 200 after publication, 404 after explicitly confirmed
unpublishing, and 200 after explicitly confirmed republishing. The restored
public title, stock number, make, model, description, price and photo collection
matched the first confirmed snapshot, with a newer publication revision.

Evidence uses `android-publication-confirm-*` UI trees, the inspected review
screenshot and anonymous responses. An initial helper failed parsing curl's
status suffix after a successful publication; the resumed helper verified that
state and did not repeat that command. The final helper exited successfully and
stopped the app. These assertions concern the Android emulator and real isolated
API; they do not establish iOS or complete publication acceptance.

## Android orientation build interaction evidence

The Android APK from run `40411305890`, source `109dde6`, artifact
`12693887803`, was installed in place on 2026-10-26. Its installed SHA-256 matched
`228a1a163f935b2d3e2c80ae36dd84c6b3df3eb50c7cda24fc8138dc3e409f89`.
Metro served primary source `9b9498b` with the six app-config, palette/button and
full-screen modal changes from that orientation source temporarily overlaid; the
local provenance file records each overlay checksum. This is development-client
evidence, not a signed release.

Photo inspection started zoomed in portrait. Rotation produced a 2400x1080
screenshot and a landscape application window, reset the viewport to 100% fit,
and retained reachable controls. Zoom to 150%, reset to 100%, dismissal back to
the photo gallery and portrait reopening at 100% all passed. The landscape
screenshot was inspected for visible photo and unclipped controls. Local evidence
uses `android-orientation-apk-photo-*` plus `android-orientation-apk-provenance.json`.
The helper restored original rotation settings and source files, stopped the app,
and Metro was restarted against the restored source. Large-text landscape, other
forms/modals, iOS rotation and physical-device acceptance remain unproven.

## Android large-text landscape photo interaction

On 2026-10-26, the same orientation APK and six-module Metro overlay described
above passed photo inspection with Android system font scale set to 1.5. The
helper verified both the 2400x1080 display and a landscape application window.
Rotation reset the zoomed viewport to 100%; zoom to 150%, reset, dismissal to
the gallery and portrait reopening at 100% passed. The landscape screenshot
was inspected: controls and instructions remained visible without clipped text.

Local evidence uses `android-large-text-landscape-photo-*`, including runtime
provenance, UI trees and the screenshot. The helper exited successfully, restored
the original source and rotation/font settings, and stopped the app. The restored
font scale was independently checked as 1.0 and Metro restarted on original source.
This closes this photo-flow check at that text size only. Other forms/modals,
iOS rotation, spoken accessibility and physical-device acceptance remain open.

## Android large-text landscape unpublish review

The same orientation APK and six-module Metro overlay passed a second 1.5-font-scale
check on 2026-10-26. A published synthetic record was opened through the normal
Android inventory flow and its unpublish review rotated to landscape. Both the
2400x1080 display and landscape application bounds were checked. The consequence
text, Cancel and Confirm change remained visible in the inspected screenshot.
Cancel dismissed the review; anonymous real-API reads before and after returned
200 with identical public piano snapshots, including publication revision.

Evidence uses `android-publication-landscape-*` UI trees, public responses and
the screenshot. The helper exited successfully and restored font/rotation and
source settings, stopped the app, and Metro restarted on original source. This
checks cancellation, not confirmation, in this landscape configuration. Longer
publication reviews, sale-entry keyboard behavior, other forms, iOS and physical
devices remain separate acceptance work.

## Landscape sale-entry keyboard context

Observed on Android at font scale 1.5: focusing the sale amount and rotating to
landscape entered the keyboard's full-screen extracted editor, hiding the sale
form and its context. Editing and rotation recovery worked, but that alone does
not satisfy contextual sale-entry acceptance.

Both inventory-editor and scan-action sale amount inputs must opt out of Android
full-screen extracted editing. Keep the existing decimal keyboard, keyboard-aware
scrolling, explicit review/cancel and iOS accessory behavior. Verify on the native
runtime that the focused amount remains an application input with the keyboard
open, that its value can be edited and survives rotation, and that cancellation
does not change the public snapshot. Enlarged-text layout and action reachability
require visual inspection; a prop check alone does not establish acceptance.

The focused correction passed the inventory-editor Android check on 2026-10-26
using the installed orientation APK and six temporarily overlaid current modules.
The retained input-method dump reports `mInputShown=true` and
`mIsFullscreen=false`; the inspected screenshot shows the application heading,
Cancel and focused amount above the numeric keyboard. The amount label/currency
are outside this small visible viewport, so broader contextual layout remains a
follow-up rather than complete acceptance. Editing, rotation retention and
cancellation with an unchanged anonymous public snapshot passed. Evidence uses
`android-sale-context-*`; source/device settings were restored. The scan-action
input has the same correction but has not yet received this runtime check.
Mobile TypeScript and structural checks pass; read-only review found no code/spec
blockers. This result does not establish iOS or physical-device acceptance.

When editing a sold transition, keep the localized sale-amount label and selected
currency in the fixed modal heading as well as in the scrollable form. This task
context must remain visible when the keyboard scrolls the focused input into
view. Use the existing catalog label and current currency value, allow wrapping
for enlarged text, and preserve the ordinary availability and review headings
for other states. Apply the same presentation to editor and scan sale flows.

The fixed-heading inventory-editor rerun passed on 2026-10-26 at Android font
scale 1.5 in landscape: the inspected screenshot shows the amount label, USD,
focused input and Cancel above the keyboard. Editing, portrait rotation retention
and cancellation preserving the anonymous public snapshot all passed. Evidence
uses `android-sale-heading-*` and the six-module overlay manifest retained with
its helper. An earlier attempt stopped on local disk exhaustion while saving
portrait evidence; only the subsequent successful rerun counts for these results.
The original source and device settings were restored. Scan-specific runtime,
other locales/device sizes and iOS remain separate checks.

The scan-screen check reached the saved synthetic piano through its QR link and
passed amount editing, rotation retention and cancellation without success
feedback at font scale 1.5. Its screenshot exposed a distinct layout failure:
the scan modal's taller header left the amount field partially behind the numeric
keyboard. This is not complete scan layout acceptance. Match the inventory
editor's compact header vertical padding while preserving horizontal padding,
wrapping, scaled text and Cancel's touch target, then repeat visual/input checks.

The compact scan-header rerun passed on 2026-10-26. The inspected post-edit
landscape screenshot shows the entire amount field and entered value, amount
label, USD and Cancel above the keyboard at font scale 1.5. Rotation retained the
edit, and Cancel returned without success feedback. Evidence uses
`android-scan-sale-spacing-*`, with two presentation-module overlays on primary
`679afd1` and the previously verified orientation APK. Both overlays and original
device settings were restored; the helper exited successfully. This scan check
does not assert an anonymous snapshot comparison or replace other locale,
physical-device and iOS acceptance. Mobile TypeScript and code review pass.


## Visible profile choice indicators

Profile radio and checkbox options must communicate selection with a visible
shape or mark as well as native checked semantics. A small background-color
change alone is insufficient. Keep the entire row actionable, localized label
wrapping, existing radio/checkbox behavior and screen-reader checked state.
Decorative selection marks must not become separate accessible controls.

Android Spanish technician acceptance at 2x text on 2026-10-26 verified readable
profile navigation, work preferences, `Servicios ofrecidos, Afinación` native
accessibility value, and a checked service option. The inspected choice screenshot
exposed a visual gap: the selected service has only a background change and no
checkbox/checkmark. This is an open visual acceptance finding, despite the passing
native checked-state assertion. No choices were changed or saved. Locale and
font scale were restored and the app stopped. Evidence is retained as
`android-technician-spanish-large-{profile,work,choices}.png` and matching native
trees, using the orientation development APK from source `109dde6` and Metro
source `679afd1` without source overlays. This does not establish spoken TalkBack
quality, iOS acceptance or complete technician parity.


The follow-up shared indicator now draws an outlined checkbox with a checkmark
or an outlined radio circle with a filled selected center. Android emulator
reruns at Spanish locale and 2x text passed: the inspected service sheet shows
checked Afinación and empty alternatives; filtered timezone choices show filled
UTC and empty Etc/UTC. Native trees retain checked state, and Back dismisses the
sheets. These checks made no profile edits. Evidence is
`android-technician-visible-choice-{choices,radio}.png` with native trees and
provenance. TypeScript, structure and locale gates pass; read-only code review
found no blocker. This verifies the shared marks on the technician surface;
customer-specific runtime, iOS, dark-mode and spoken-screen-reader acceptance
remain separate. Original source overlays, locale and font scale were restored.


Customer-specific Android follow-up on 2026-10-26 passed in Spanish, dark mode
and 2x text. Normal navigation opened saved Studio, then its timezone choice.
Filtering for New_York retained the checked America/New_York row; the inspected
screenshot shows its filled radio mark and full label without clipping. Back
dismissed the sheet without changing or saving the profile. The first helper
attempt incorrectly expected UTC and was stopped; the corrected run used the
existing saved timezone. Evidence is `android-customer-dark-choice-radio.png`
and matching filtered/dismissed native trees. This uses the same development APK
and the three source overlays recorded for the visible-choice checks, not a new
APK. Source, night mode, locale and font scale were restored and verified. This
closes the named customer dark-mode rendering check only; iOS and spoken
screen-reader acceptance remain open.

## Fresh Android choice and sale artifact check

The checksum-verified Android artifact `12697995811` from run `40420290621`,
source `ee8f9b3`, was installed over the existing synthetic development client.
Its installed APK SHA-256 is
`326ba220c98eff74ae606069e87ad1dedca47ea97b553270af9c41c447db4cb5`.
Using merged product source at `a23baf2` through Metro without source overlays,
the customer Spanish dark-mode 2x-text timezone check passed, including the
visible checked America/New_York row and Back dismissal. The initial helper
inspected the underlying form before the sheet appeared and was excluded; the
corrected helper waits for the named timezone search field.

The same artifact passed sale entry at 1.5x text in landscape: label, currency,
full input and Cancel remained visible with the keyboard. Typing changed the
amount; rotating back retained it; cancelling left the anonymous published
snapshot identical. Evidence is retained as `android-pr102-customer-dark-*`,
`android-pr102-sale-*` and `android-pr102-apk-provenance.json`. Locale, text scale,
night mode and rotation were restored and the app stopped. These bounded checks
verify the installed development artifact with the recorded Metro source, not
an embedded production Android bundle, physical-device or iOS acceptance.

## Consistent native single-choice indicators

Staff invitation role, inventory status filters and inventory field choices must
show the same explicit selected/unselected radio mark as profile choices. Border
weight and color alone are insufficient selection cues. Keep the containing row
as the sole accessible radio with its existing checked/disabled state and action;
the mark is decorative. Labels must wrap beside the fixed-size mark at large text.

Android baseline inspection found the staff Viewer selection represented only by
a thicker colored border (`android-staff-baseline.png` and matching native tree).
Runtime checks must verify switching Viewer/Editor without creating an invitation,
large-text reachability, and inventory filter/field choice state. These checks do
not prove invitation creation, membership changes, or spoken accessibility.

The Android staff check passed on 2026-10-27 using the checksum-verified PR #102
development APK (source `ee8f9b3`) and Metro source `fa2898e` with only the three
choice-view files from this change overlaid. After restarting Metro and the app,
Viewer → Editor → Viewer preserved exact checked states at 2x font scale. The
inspected `android-staff-choice-editor.png` shows the explicit selected dot and
empty circle beside readable labels; expiry and creation controls remain visible.
Matching native trees and the expiry screenshot are retained in the local
2026-10-25 evidence directory. Font scale and source overlays were restored.
Earlier attempts using a stale bundle or failing screenshot storage are excluded.
TypeScript, structure and locale gates passed. Inventory field/filter runtime
checks, iOS execution and spoken accessibility remain pending for this change.

The follow-up inventory check passed on 2026-10-27 with the same APK and primary
Metro source, overlaying the three choice views at `eacce91`. At 2x font scale,
Active → Sold → reopened Sold retained the correct checked state and visible
radio mark; Active was restored afterward. At ordinary font scale, the existing
CameraCancelAcceptance draft's Piano type sheet showed exactly one checked
Not set option, with all other explicit radio marks empty; Back dismissed it
without editing the draft. Inspected screenshots and matching native trees are
`android-inventory-choice-active`, `-sold` and `-type` in the same local evidence
directory. This validates filter interaction and field rendering/dismissal, not
field-value persistence, screen-reader speech or iOS. Source and font overrides
were restored after the check.

## Android invitation creation and code dismissal — 2026-10-27

The checksum-verified PR #102 development APK with restored primary Metro source
`fa2898e` (no choice overlays) created a Viewer invitation through Manage staff
with expiry changed from 72 to 1 hour. The resulting one-time code was displayed
exactly once. Explicit I have saved the code dismissal removed it; leaving and
reopening the screen did not restore it. A read-only query of the isolated
runtime database confirmed the created invitation's Viewer role, exact 3600-second
lifetime and unused/unrevoked state. The one-hour synthetic invitation remains
unconsumed; no real account was invited.

Evidence consists of redacted `android-invitation-created`, `-dismissed`,
`-reopened` native trees, an inspected reopened-screen screenshot and token-free
result/persistence JSON in the local 2026-10-25 evidence directory. No screenshot
was captured while the code was displayed. The temporary raw tree was overwritten
after execution. This proves native creation and explicit dismissal/teardown, not
copy/share, another-user acceptance, revocation, clipboard policy, spoken
accessibility or iOS.

A subsequent native revocation check targeted that exact synthetic invitation ID
in the confirmation dialog. Cancel preserved the database row's unrevoked and
unconsumed state. Reopening the same confirmation and choosing Confirm revocation
persisted revoked=true without consumption; the inspected list screenshot then
showed the matching expiry card as Revoked without its revoke action. Thus the
invitation is now revoked, superseding its earlier unrevoked observation. Retained
`android-invitation-revoke-{dialog,cancelled,confirmed}` trees, dialog/confirmed
screenshots and token-free result JSON support this separate confirmation check.
This does not establish another-user acceptance/rejection or member-role changes.

## Android persisted buyer-inquiry journey — 2026-10-27

A fresh synthetic buyer inquiry submitted through the isolated public HTTP API
appeared as Unread in the native inbox. Normal list/detail navigation displayed
its message and submitted piano title. At 2x font scale, Mark as read persisted
the first-read timestamp; returning to the list showed Read, and force-stopping
and reopening the application retained that state. Read-only database checks
confirmed the stored publication snapshot was identical before and after marking
read and restart. This run did not edit or republish the source piano.

The inspected detail and snapshot screenshots show readable wrapped message,
contact information, first-read timestamp, piano title, exact price and description.
Evidence is `android-inquiry-{unread,detail-large,snapshot-large,read-list,restart}`
native trees, large-text screenshots and submission/persistence JSON in the local
2026-10-25 evidence directory. Runtime provenance is the PR #102 development APK
with primary Metro `fa2898e`, no overlays. Font scale was restored. Contact apps
were not launched. This closes the named Android inbox path, not live CAPTCHA,
public form interaction, pagination, spoken accessibility or iOS acceptance.

PR #104 merged the shared choice-view corrections at `626c658` after both actual
native builds passed run `40424324959`, exact source `eacce91`. The verification
log reported only the authorized node-forge advisory, with all 21 mitigation
tests passing. Acceptance routing skipped the real-service suite for this native
UI-only change; it is not fresh backend acceptance evidence.

## Bundled iOS simulator interaction gate

Run `40418370993` at `679afd1` passed host HEAD/manifest/bundle readiness and
simulator status/HEAD probes, then failed before Sign in with the development
launcher's request timeout. Broader browser/API acceptance and Android compilation
passed. The HEAD diagnostic does not fix launcher startup.

The product interaction gate must launch a simulator Release configuration with
its JavaScript bundle and synthetic configuration embedded, independently of
Metro and the development launcher. Retain the separate Debug native-build gate.
Require a nonempty bundled entrypoint and exact loopback fixture API/identity
configuration before installation. Preserve normal sign-in, profile editing,
secure-storage restart and recovery assertions; do not inject authenticated state.
Simulator-only identity and Keychain entitlements remain required. Any HTTP
transport allowance belongs only to the generated acceptance project and must
never alter source app configuration or distribution artifacts. This gate is
unsigned-for-distribution simulator acceptance, not a signed store release or
proof of real-provider/backend integration. Successful hosted execution remains
required before this change can be called a working startup correction.

## iOS inventory browse presentation journey

After profile and process-restart recovery acceptance, the simulator must open a
synthetic shop through normal home navigation, browse inventory, search stock,
switch availability filters, and return to the shop and home. A controlled
loopback fixture may seed six synthetic records spanning the lifecycle states;
it must preserve normal sign-in and opaque-session checks, dealer scope, search,
active/inactive filtering and bounded pagination. Fixture records must never be
mistaken for real API/domain authorization evidence. Retain screenshots and
assert actual native rows and empty states; source/tests alone do not establish
an executed iOS interaction or complete inventory parity.

Run `40422404970` at `d4bfc01` subsequently passed the Release test build but
stopped before installation: its universal arm64/x86_64 executable was rejected
by the thin-only entitlement parser. The exact log reports Invalid simulator
executable; no create/restore journey or screenshot was produced. The follow-up
parser validates all FAT32/FAT64 slices and requires matching XML entitlements,
retaining each slice's XML/DER checks and exact synthetic identity validation.
The new valid-universal regressions failed first; six parser, two identity and
three bundle checks now pass locally. Hosted launch and interaction remain open.
## Fresh Android staff/inventory choice artifact — 2026-10-27

Installed artifact `12698674244` from run `40424324959`, source `eacce91`, and
verified its installed APK SHA-256 matches
`fdc9a01179b0245c265c70fe5e461d21c8a8a8c15d79c54f702b23017ae4cb66`. With merged
Metro source `5b73605` and no overlays, native staff Editor → Viewer switching
and inventory Active selection/Back dismissal passed at 2x text. Inspected
screenshots show explicit radio marks and readable labels. No invitation was
created and no inventory value was changed by this check. Source provenance,
matching native trees and screenshots are retained as `android-pr104-*` in the
local 2026-10-25 evidence directory. Font scale was restored and the app stopped.
This is a development APK plus Metro check, not an embedded production bundle,
iOS, physical-device or spoken accessibility acceptance.

## iOS exact text-entry regression — 2026-10-27

Run `40427405957` at `a88012b` passed simulator identity/bundle validation and
the create-profile test, but failed the restart test: customer name read back
as `istomer` instead of the entered `iOS Customer`. The retained saved-location
screenshot also shows region `M` after the test entered `MA`. This is not a
passing profile round trip; neither the typing boundary nor persisted exact
values were asserted by the creation helper. The cause remains under diagnosis.
Native input acceptance must assert the exact entered/replaced value immediately
after keyboard entry and after dismissal, retaining a screenshot and full UI
tree on mismatch. Do not slow typing, retry replacement, disable correction, or
relax expected values to conceal lost characters. Restart assertions remain
required, and the later recovery/inventory journeys are not yet accepted.

Run `40433093231` at `b981b5c` now fails the new immediate entry assertion:
XCTest types `iOS Customer` into Name, then reads `istomer` before Done, Save
or restart. This reproduces character loss at the text-entry boundary; it does
not establish a persistence defect. The create test stopped there, so restore
and inventory interaction remain unexecuted. Artifact `12703673474` contains
`create.log` and the `incorrect-entry-Name` screenshot/tree. On 2026-10-29 the
small create log was read using explicit byte ranges without downloading the
full artifact. Android build and real-service browser acceptance passed this
run; iOS interaction remains failed.

Customer native text entry must retain native ownership while editing rather than
echoing each React snapshot into the input. Every change still synchronously
updates the recovery editor. Non-editing synchronization and blur must read the
current editor snapshot, not a potentially stale render closure; deliberate
external replacements remain visible after editing ends. Explicitly choosing “Use saved version” must end native text editing before applying the replacement, even when Android Back hid the keyboard without blurring the input. Preserve accessibility,
keyboard behavior, validation focus and exact restart assertions. The immediate
XCTest failure is the regression gate; no typing delay or autocorrection change
is an acceptable substitute.

## Native lifecycle review choice marks

Inventory-editor and QR-scan availability review must display an explicit radio
mark for each status and sale-currency option, including an empty mark for
unselected options. Retain the containing row's checked/disabled semantics and
existing review-before-mutation behavior. Labels must wrap beside the mark.
Android interaction acceptance must inspect current selection, change and reopen
status/currency choices, and cancel without changing the published snapshot.
This check does not establish iOS or spoken screen-reader acceptance.

The Android editor baseline showed plain-text availability options with no
visible current-selection mark. After reusing the decorative indicator, the
1.5x-text interaction passed Available → Sold selection/reopen, USD → EUR
selection/reopen, and cancellation with the public snapshot unchanged. Inspected
screenshots and matching native trees are retained as
`android-lifecycle-choice-editor-*` in the local 2026-10-25 evidence directory;
`android-sale-choice-baseline.png` records the prior appearance. Runtime used the
checksum-verified PR #104 development APK and primary Metro source `a88012b` with
only the two lifecycle view files overlaid. Font scale and rotation were restored.
Mobile type checking and structural/i18n checks pass, and the project critic
found no confirmed blocker. Both fresh native builds remain pending for this
correction; subsequent QR-scan evidence follows.

The same 1.5x-text check passed through normal manual QR-link entry: Draft →
Sold selection/reopen, USD → EUR selection/reopen, then cancellation. The label
resolves to a different synthetic Draft record than the editor publication; the
initial Available expectation was a test-fixture error and was corrected before
recording the passing run. A read-only query scoped to the exact label confirmed
identical saved-record values after cancellation. Screenshots
and native trees are retained as `android-lifecycle-choice-scan-*`; its persisted
record evidence excludes the label token. The inspected images show clear marks
and readable labels. Provenance matches the editor check, with the two view files
from `7d085df` overlaid on Metro `a88012b`. Temporary overlays, font scale and
rotation were restored, and the app stopped. This does not establish an actual
sale submission, signed release, iOS interaction or spoken accessibility.

## Native persisted sale and correction acceptance

For an isolated synthetic available piano with an exact USD asking price, open
native availability review, choose Sold and verify the sale amount defaults to
the asking price. Enter a different amount, review and explicitly confirm; verify
the persisted sale event contains the exact minor-unit amount. Correct the sale
back to Available with an explicit reason through the native UI and verify a new
event, preserving the original sale event unchanged. This private fixture does
not prove published snapshot behavior or all lifecycle transitions.

Partial Android execution (2026-10-27), PR #104 development APK with unmodified
Metro `b981b5c`: sale review defaulted to USD 1234.56; an explicit USD 1100.25
sale persisted as 110025 minor units with unchanged inventory attributes.
That attempt did not establish correction: entering `NativeSaleCorrection` returned the app to
home before confirmation. A focused retry asserted the multiline input had focus
and reproduced home navigation before any Back key. No JavaScript/runtime error
was captured; development-client keyboard handling versus product behavior is
still under investigation. Retained `android-native-sale-*` evidence includes
the exact saved sale, inspected review screenshot and failed reason-entry state.
That attempt alone does not establish a completed sale/correction journey.

Follow-up source inspection (2026-10-29) found a plausible development-runtime
cause for reason-entry navigation: React Native Modal forwards non-Back key-up
events to the activity, whose development reload recognizer treats two R keys
within 200 ms as reload unless the activity currentFocus is an EditText. Modal
focus is separate, and the synthetic reason contains adjacent R characters.
This matches the observed bundle reloads; source inspection alone does not
establish the cause or a passing correction.


Android software-keyboard follow-up (2026-10-29): the same PR #104 development
APK, with Metro restarted on unmodified `fef96ea`, reopened the existing Sold
fixture after normal owner browser sign-in. Tapping Gboard keys entered the exact
`NativeSaleCorrection` reason; the visible field and review screen retained it.
Native confirmation persisted Available with a new Sold-to-Available event and
that exact reason. The original sale event and inventory attributes remained
identical parsed API values. Retained `android-native-sale-ime-*`
evidence includes keyboard/review screenshots, native trees and sanitized API
history. The earlier USD 1100.25 sale and this correction occurred on different
recorded Metro revisions; this is development-runtime evidence, not one embedded
release run, physical-device acceptance, iOS interaction or public snapshot proof.
The software-keyboard path passes; it does not independently prove that the
hardware-keyboard development reload shortcut caused the earlier failure.

## Native public-link sharing acceptance

From a saved published piano, invoke the system share sheet through the ordinary
public-link resolver. Verify the payload identifies the public showroom listing
and contains no private label fragment, application credential or draft data.
Dismiss without selecting a recipient or external application; the editor must
remain usable without an error or persisted mutation. Repeat to prove the control
is re-enabled. Record the platform and runtime source; this does not establish
iOS, destination-application delivery or spoken accessibility acceptance.

Android emulator execution passed at 1.5x text using the checksum-verified PR #104
development APK with Metro `a88012b`, without overlays. The system
`com.android.intentresolver` chooser displayed exactly the synthetic listing's
canonical public URL, including its title slug, with no query, fragment or
credentials. Back dismissed it without the localized sharing error; the same
control reopened the chooser and returned cleanly again. Read-only comparison
confirmed identical saved inventory values, and anonymous API reads confirmed
the publication was unchanged. No recipient, external application or clipboard
action was selected. Evidence is retained as `android-public-share-*` in the
local 2026-10-25 directory; the chooser screenshot was inspected. The initial
test assumptions of an ID-only URL and generic Android chooser package were
corrected before the passing run; no application change was needed. Font scale
and rotation were restored and the app stopped. This proves chooser payload and
cancellation only, not delivery to another app or iOS sharing.

## Native staff role administration acceptance

As the owner of an isolated synthetic shop, change an existing synthetic member
from Viewer to Editor and back through the native staff screen. Verify the exact
member's persisted role/revision and completed authorization grant after each
change; the owner must remain unchanged. Open removal, verify the dialog names
the intended member, and cancel without mutation. This bounded check does not
replace another-user interaction, confirmed removal or iOS acceptance.

Android execution with the PR #104 development APK and unmodified Metro
`a88012b` changed the synthetic member from Viewer revision 4 to Editor revision
5. The database grant reached revision 5, but the screen retained its earlier
pending snapshot and correctly disabled another role change. Reopening staff
loaded the ready Editor state; the native action then restored Viewer revision 6
and grant revision 6. Explicit Refresh staff refreshed the pending presentation.
The removal dialog named the exact member; Cancel preserved all membership
values, and the owner row remained unchanged. Evidence is retained as
`android-staff-role-*`, including ready-Editor and removal-dialog screenshots,
native trees and persisted before/after values for the restoration. The initial
round trip did not complete without refresh and is not represented as such.
The app stopped afterward. This establishes role administration with explicit
refresh and removal cancellation, not confirmed removal or a second user's
access after the role changes.

## Native inventory date and exact-money recovery acceptance

Create a synthetic private piano through native New without requiring photos or
publication fields. Save identity and a year/month manufacture date, then enter
an invalid day. Confirm the invalid text remains local while the persisted date
remains valid. Force-stop and reopen through inventory search; require recovery
of the exact invalid text, correct it, and explicitly save. Exercise asking-price
JPY and acquisition-cost EUR values through native currency choices, and verify
exact minor units plus saved internal fields in the isolated database. Reopen
and compare displayed values. This does not establish the complete field matrix,
iOS, physical-device or screen-reader acceptance.

Android execution passed with the checksum-verified PR #104 development APK and
Metro `a88012b`, without source overlays. Native New created a private Kawai K300
draft with its synthetic title and saved manufacture year/month 1998/2. Invalid
day 31 displayed field feedback without changing the saved record. Force-stop
and ordinary inventory search restored day 31 and the paused-recovery notice.
After correction and explicit Save now, the database contained 1998-02-28, JPY
123456 minor units, EUR 10001 minor units, and the entered stock number, serial,
location and private notes. A second restart/reopen displayed the saved date and
JPY price without changing the persisted record. Anonymous lookup returned 404.
Evidence is retained as `android-native-fields-*` in the local 2026-10-25
directory, including native trees, partial/corrected database rows and inspected
invalid-date/reopened-price screenshots. The initial attempt hit Expo's floating
Tools overlay before entering fields; that development-only preference was
temporarily disabled for the passing run and its exact original XML restored
afterward. The app was stopped. This verifies the named fields and recovery path,
not the complete native inventory matrix, iOS or a signed production artifact.

## Native inventory identity and offering field acceptance

Extend the isolated draft field journey to size, finish, piano type, condition,
player system, public description, price visibility and featured placement.
Use normal native controls, verify the persisted attributes, and reopen after
process termination. The final verification must only read displayed fields and
switch states; it must not correct a value while checking it. Existing date,
money and internal attributes must remain unchanged, and the draft must remain
unpublished. This verifies representative field persistence and presentation,
not every option, validation boundary, publication effect or physical device.

Android execution used the checksum-verified PR #104 development APK with Metro
`b981b5c`, without overlays. The same synthetic draft advanced from revision 7
to 15 with size `180cm`, finish `PolishedEbony`, Grand type, Restored condition,
player system enabled, `SyntheticGrandDescription`, and price-visible/featured
switches enabled. The earlier date, exact JPY/EUR amounts and internal attributes
were unchanged. After the initial save/reopen check, a separate force-stop and
read-only reopen asserted every named value and switch without invoking changes;
the full persisted row remained identical. Anonymous public lookup returned 404.
Evidence is retained as `android-native-fields-remaining-*` in the local
2026-10-25 directory, including before/saved rows, read-only verification trees
and inspected identity/offering screenshots. The development floating-button
preference was temporarily disabled and its exact original XML restored after
acceptance; the app was stopped. This complements the earlier date/money/internal
field journey, not a claim of complete validation, iOS, publication or release
acceptance.

## Native confirmed staff removal acceptance

Using an isolated synthetic shop, restore the synthetic member through fixture
setup, then remove that member through the native owner staff screen. Verify the
confirmation identifies the intended member, confirm removal, refresh/reopen,
and check persisted inactive membership and completed authorization revocation.
The owner and inventory must remain unchanged. This complements same-session
member denial evidence; fixture setup does not prove native invitation acceptance.

Android execution (2026-10-27) passed with the checksum-verified PR #104
development APK and unmodified Metro `b981b5c`. The native confirmation displayed
the intended synthetic member identifier; confirming advanced membership from
active Editor revision 10 to inactive revision 11 with authorization revocation
complete. The full inventory response was identical before and after. Reopened
staff displayed Removed without member action controls, alongside the active
Owner. Inspected confirmation/saved screenshots, reopened UI tree and sanitized
API snapshots are retained as `android-owner-removal-*` in the local 2026-10-25
evidence directory. The original synthetic owner was signed in through the
normal browser flow; the development floating-button preference was restored
and the app stopped. This establishes native confirmed removal for this fixture,
not native invitation acceptance, iOS or physical-device acceptance.

## Native invitation acceptance execution contract

A signed-in synthetic member must enter a valid invitation code through native
Join shop, preview the exact shop and offered role, explicitly accept, and use
Check access before entering the shop. Verify membership/grant persistence and
code removal after acceptance. Reopen the app and reach the newly joined shop
through normal navigation. Invitation provisioning may use the isolated owner
API fixture and must be identified as such; never inject the member session or
accept the invitation through a fixture API in this journey. Retain no reusable
invitation code in screenshots, logs or committed evidence.

Android execution (2026-10-27) passed using the checksum-verified PR #104
development APK and unmodified Metro `b981b5c`. A synthetic Viewer invitation
was provisioned through the owner API, then the member signed in through the
normal native browser flow, entered the code, reviewed the exact shop/Viewer
role and explicitly accepted in the app. The code input disappeared after
acceptance; the screen showed pending access and Check shop access. That action
entered the shop through the ordinary authorization check. The real API showed
active Viewer membership with grant processing complete. Force-stop/relaunch
then reached the joined shop through the home directory. No fixture session or
API acceptance was used. Evidence is retained as `android-native-join-*` in the
local 2026-10-25 directory: the preview tree redacts the token, and screenshots
were captured only after the code disappeared. The accepted screenshot was
inspected; the app stopped after the successful restart journey. An initial
helper expected an uppercase navigation label and stopped before entering a
code; correcting that helper matched the actual Join a shop navigation row.
This proves the named Android development-runtime path, not iOS, physical-device
or every invitation failure/expiry journey.


Focused customer replacement regression (2026-10-29): Android PR #104 development
APK with Metro `fef96ea` retained exact rapid entry and applied a conflict's saved
version after Name was blurred. With Name still focused after hiding the keyboard,
the same native Save / Review latest version / Use saved version journey instead
left `NativeLocalEdit` visible while reporting the profile up to date. The real
API held `Native Saved Replacement`. Retained
`android-customer-focused-replacement-*` evidence records the failing visible
state. Explicit saved-version selection must dismiss editing before replacement;
verify that exact focused journey again without weakening the value assertion.

The focused journey then passed with the same APK and Metro `fef96ea` plus the
single `Keyboard.dismiss()` change on Use saved version. Name remained focused
after Android Back hid the keyboard; the fixture API advanced the saved profile,
and native Save / Review latest version / Use saved version displayed exactly
`Native Saved Replacement` in the existing Name input. Evidence is retained as
`android-customer-focused-fixed-*`. The synthetic fixture was restored through
the concurrency-guarded API helper at revision 20. Mobile type checking, the full
mobile test suite, structural checks and i18n checks passed. This is Android
development-runtime interaction evidence; the changed code still requires hosted
native builds and iOS interaction acceptance.

iOS run `40944776765` at `fef96ea` subsequently failed the unchanged immediate
Name assertion: `iOS Customer` became `iomer`, confirmed by the retained native
tree and screenshot. Save/restart and inventory journeys did not execute.
The native-owned JavaScript wrapper alone therefore does not resolve the iOS
failure. Diagnostics are retained under `pr66-ios-fef96ea`; only selected logs
and attachments were fetched, not the complete build artifact.

Investigate the native attributed-text round trip described in React Native
issue [58904](https://github.com/react/react-native/issues/58904) and proposed
PR [59197](https://github.com/react/react-native/pull/59197), pinned investigation
head `a91468ffe62122bc49d964a08b493374f0af4775`. That proposal remains unmerged.
Any backport must record provenance and source integrity, preserve real text and
style changes, preserve multiline paragraph semantics and IME behavior, and be
compiled into the actual native binary. Patching source while consuming an
unmodified prebuilt core is insufficient. Keep rapid-entry exact-value assertions;
do not mask loss with slower typing, repeated correction or clipboard insertion.
Require native build and interaction evidence before accepting the mitigation.

The candidate backport pins the three native implementation files from that PR
in `patches/react-native@0.83.10.patch`; its manifest records original/patched
SHA-256 values, license identity and the unmerged upstream revision. Only header
context is adapted to the pinned 0.83.10 event-emitter alias. The prebuild plugin
requires those patched sources and selects source compilation, overriding an
inherited prebuilt-core default and clearing the test-only local core tarball
override. Local build-guard tests reject original, tampered and wrong-version
sources and conflicting generated Podfile assignments. Upstream unit tests have
not been imported or run; this candidate is not accepted until the unchanged
native journey passes.

Source-build execution budget (2026-10-29): run `40951901793` at `5cc917d`
passed the initial native iOS build, Android compilation and browser/API
acceptance. Its interaction step was cancelled near the 60-minute job limit
while the separate Release test application was still compiling React native
sources. The retained artifact contains `build.log` but no test execution logs;
no typing, save/restart or inventory result is claimed. Allow a bounded
120-minute iOS job budget for both source builds and the full unchanged journey.
Keep source-integrity enforcement, Release bundling and exact rapid-entry
assertions intact. The larger budget is not acceptance evidence.

iOS source-backport run `40960703462` at `4f9300c` completed both source builds.
The create-profile journey passed exact rapid entry, customer/technician saves
and protection of the incomplete `09:` availability draft. The restart journey
verified the saved customer name, then failed its exact `Monday` button query.
The inspected recording shows the restored-draft notice and a visible Monday
row containing `Available · 09:–17:00 · UTC`; the row combines weekday and
schedule text in its accessibility label. Query that unique composite row
without removing its useful spoken summary. Preserve the exact reopened `09:`
assertion and invalid-save keyboard/focus assertions. This recording proves the
visible restored summary, not successful row activation or the remaining journey.


Run `40973187094` at `8637ceb` passed native builds and browser/API acceptance,
but the create-profile test queried Location name before the protected Add
location transition completed. Its recording at 60 seconds shows the new
location editor at the top with Location name visible and the keyboard dismissed;
the subsequent unconditional upward swipes move past that field. The harness
must wait for a target to exist before scrolling. After Add location, explicitly
wait for the first field to be hittable without scrolling, asserting the product
requirement that a new section opens at the top. Retain exact text-value checks
and capture the accessibility tree and screenshot on reach failures. This
correction still requires a full native CI journey; it is not acceptance evidence.


Run `40982410120` at `7c96772` passed native compilation, browser/API acceptance,
and both iOS profile journeys: exact rapid entry, saves, restart restoration of
`09:`, and invalid-time keyboard/focus assertions. Inventory navigation and Sold
selection passed, but typing `UI-002` and Return did not yield the empty result.
The failure accessibility tree retains exact `UI-002` in the search field with
Status: Sold and the old UI Sold Piano row visible. Submission currently reads
render-captured React search state; use the native submit event text and retain
the unchanged keyboard-submission journey to verify the correction. This does
not establish inventory acceptance. Verification still fails only on the visible
deepmerge advisory; no remaining gate is waived.


Run `40990491199` at `bde7ccdc1b6de63886c5ae56e8d6b68730619afb`
is terminal with iOS native compilation and the configured create, restore and
inventory journeys passing. Exact profile typing, saved/partial draft reopening,
invalid-time focus and submitted native-event search remain asserted. Android
native compilation and browser/API acceptance also passed. Verify still fails
on the single deepmerge advisory; no skipped verification step is evidence.
This supersedes the prior search failure for that specific journey, not broader
iOS/public/inquiry/voice/accessibility acceptance.


## Android public visits and buyer submission — 2026-10-30

Paul’s API 36 emulator ran JavaScript `403e20e` on the APK built from
`39424dd014ad966da84dd584f7f712c0030a32d6`, run `41002451234`, artifact
`12953719670` (SHA-256
`03f632237fae03ff294a747b948db9a49d1f9dac917beee1dc558df006380287`).
The signed-out client used an isolated real API and synthetic public records.
No local emulator or production service was used.

An empty showroom exposed About this showroom, its address, appointment and
delivery/warranty/service notes, with working back navigation. Initial small
catalog controls stayed hidden; sold discovery exposed recovery controls. A
no-match search followed by clearing the input before submission retained the
search controls; submitting the cleared input restored the real catalog.

Buyer submission exercised empty-field validation, native contact entry, a
connection dropped before forwarding the inquiry, retained fields and explicit
retry. The actual owner inbox contained no matching inquiry after the dropped
request, then exactly one after retry, with exact contact/preference/message and
the expected entire public piano snapshot. Confirmed delivery cleared the form;
reopening also showed cleared contact fields. The relay supplied no substitute
API responses and rejected credential-bearing inquiry requests.

Evidence is retained under `~/.cache/pianotechpros-evidence/2026-10-30/` in
`native-showroom-visit/` and `native-inquiries/`: screenshots, accessibility XML,
APK provenance and a synthetic persistence receipt. Visit, failure and confirmation
screenshots were visually inspected. Turnstile was explicitly disabled for this
isolated native journey. Enabled-provider acceptance, iOS execution, spoken
screen-reader testing and physical-device acceptance remain open. Displayed
contact actions were not used to place calls or send email.


## Native public fixture contract — 2026-10-30

Run `41000713809` compiled the native applications but failed its first iOS public
catalog assertion. The retained accessibility tree shows the unavailable state.
The controlled fixture supplied publication revision 1; the production anonymous
client correctly requires a published revision of at least 2. A real-client HTTP
contract regression reproduces `protocol_error` before correction. Give synthetic
publications valid revision 2 and run the contract regression before the expensive
iOS build: directory, catalog, detail, sold search and empty-shop profile must
pass the production adapter. Preserve strict client validation. This diagnosis
and fixture correction are not a successful iOS interaction result.

## iOS inventory editing and restart acceptance

The iOS interaction gate must edit a private inventory record through ordinary
navigation, including identity, piano type and condition, manufacture date,
public description and price, and internal stock/location/cost/notes. It must
save, terminate the application, reopen the record and assert exact persisted
values and selected choices. Independently read and compare the complete saved
fixture record before restart so local draft recovery cannot impersonate a
server save. Capture accessibility trees and screenshots.

The controlled HTTP fixture may retain revision-checked inventory edits across
application restarts, but never manufacture publication or upload success.
Conflicting revisions and malformed commands must not alter saved data. Fixture
interaction evidence establishes native control behavior only; real API
persistence, ownership, audit and publication acceptance remain separate gates.

## Read-only iOS visit text acceptance — 2026-10-30

Run 41005082780 failed on the delivery note's `isHittable` assertion even though
its retained screenshot and accessibility tree show all visit notes fully visible
inside the scroll view. Read-only selectable text can expose nested static text
nodes and is not an interactive control. Assert the exact note exists and its
nonempty frame fits inside the visible scroll viewport, scrolling only when
needed; retain screenshots and diagnostics. Buttons, inputs and choice controls
still require hit testing before interaction. This corrects test semantics and
does not waive accessibility audits or establish a successful native journey.

## Native inventory access-denied presentation

When a scoped inventory read confirms access denial, clear record rows and hide
New piano, search, refresh and filter controls, including an open filter sheet.
Retain the localized denial notice, explicit retry and normal back navigation.
The API remains the authorization boundary; hidden controls are presentation,
not a replacement for denial checks. A subsequent authorized retry must restore
the ordinary inventory controls. Preserve confirmed denial while retrying and
through transient retry failures until a current successful response revalidates
access. A transient failure alone must not infer denial; stale successful
responses must not clear a newer denial.

Android baseline evidence `android-staff-access-removed.png` shows the denied
notice and cleared rows alongside New piano and filters. This is a presentation
gap despite correct API denial. The synthetic same-session journey confirmed
editor creation, rejected writes after downgrade with continued viewer reads,
and revoked inventory reads after removal. Fixture provisioning and owner role
changes used ordinary API calls; the member signed in through the native browser
flow. This does not prove native invitation acceptance or owner-side removal UI.

Corrected Android execution (2026-10-27) passed denial, authorized retry and a
second revocation against the real API in the same native member session.
Inspected screenshots and UI trees show only feedback/retry/back when denied;
authorized retry restores controls and the persisted draft. Evidence is retained
as `android-inventory-denied-*` in the local 2026-10-25 directory. Execution
used the checksum-verified PR #104 development APK with Metro `b981b5c` and
exact working-source overlays of the inventory screen and shared inventory
browser controller. This is development-runtime evidence, not an embedded release
or iOS interaction result. Six controller regressions pass, including denial
retention through pending/transient retries and suppression of stale success;
the existing 475-test client-core suite, mobile TypeScript, structural and
two-locale i18n gates also pass.

## Exact currency formatting on native engines

Public catalog, listing, inquiry and private review prices must render on iOS
Hermes without `Intl.NumberFormat.prototype.formatToParts`, which is unavailable
on that platform. Shared formatting must preserve every safe integer minor unit,
including zero-, two- and three-decimal currencies, for both supported locales.
Use the runtime's currency layout and grouping; never round the minor-unit value
through floating-point division. A capability-limited regression must exercise
both locales and maximum safe values. The existing priced iOS catalog journey
remains required; a Node regression alone does not prove native acceptance.

## Bidirectional native control reachability

Native interaction helpers must scroll toward the target control, including
controls above the viewport after keyboard dismissal or returning from a sheet.
They must retain bounded attempts, existence/hit-testing checks and failure
screenshots/hierarchy evidence. Never replace a failed interaction with a direct
state mutation. Run `41017531680` reached inventory editing but its upward-only
helper scrolled the Model field to y=-1335 while continuing toward the bottom.
The same run passed profile creation, draft restoration, inventory browsing and
publication readiness; this is controlled-fixture iOS evidence, not real-API
parity. Full editing and restart persistence remain unproven.

Allow 180 minutes for the combined clean Debug build, Release interaction build,
independent journey execution and artifact retention. The previous 120-minute
job limit interrupted evidence retention after the complete schedule ran; the
Release interaction build alone took about 69 minutes. This job budget changes
no individual assertion deadline, required journey, failure propagation or retry
policy, and does not convert a failing result into a pass.

## Public photo accessibility semantics

A successfully loaded public photo must expose one labeled native image element,
not an unlabeled picture or a generic accessibility element. Keep its preview
button separate and actionable. A semantic container may own the image role and
label while its rendering child stays hidden from accessibility to prevent
repeated announcements. Loading/error states and retry behavior remain unchanged.
Run `41022035854` rendered the priced catalog/listing after the currency fix, but
the visible photo appeared in the retained iOS hierarchy as Other with its alt
label; the required image query failed in both public and accessibility journeys.
Preserve the image-role assertion and verify the correction on the hosted device.


## Android public photo semantics and inspection — 2026-10-30

JavaScript `e33a3e6bbf89fa29f12035e5507943e34566ce02` ran on a remote API 36
emulator using the development APK from source
`3acc88d74aec27b272c80c741e058665058e3b43`, SHA-256
`86a245ec6668151b3cab45e6ba99b052df3be8b5bc96a66dddfba28525aadb7a`.
The signed-out client loaded a synthetic publication through the isolated real
API; no HTTP responses were substituted.

The loaded primary photo exposed exactly one labeled `android.widget.ImageView`.
Preview remained a separate actionable control. Inspection opened at 100%, zoomed
to 150%, reset to 100%, and closed while preserving the listing and selected
photo. Backgrounding closed inspection without reopening it on foregrounding.
Screenshots and accessibility trees were retained and inspected under
`~/.cache/pianotechpros-evidence/2026-10-30/public-photo-semantics/`, alongside
`result.json`, APK identity and the runtime check script. The synthetic color-block
image establishes processing/layout, not photographic detail. The temporary
emulator, Metro server and tunnel were stopped after execution.

This is Android development-runtime evidence with the stated JavaScript/native
build combination. It does not establish embedded release behavior, iOS image
semantics, spoken TalkBack/VoiceOver order or physical-device usability. Hosted
iOS assertions remain unchanged and must pass separately.


## Android public journey at 200% text — 2026-10-30

Using the same JavaScript and native APK combination as the preceding public
photo check, the remote API 36 emulator ran at system `font_scale=2.0` against
the isolated real API. Home, showroom directory, catalog and listing navigation
remained usable. Photo inspection exposed reachable close, zoom and reset actions;
the captured zoom state was 150%. The inquiry form scrolled to its contact choices
and Send inquiry action. Submitting empty fields returned focus to Your name,
opened the keyboard and displayed readable name/email validation. Screenshots
of the enlarged preview, bottom of the form and focused validation were inspected.

Evidence is retained under
`~/.cache/pianotechpros-evidence/2026-10-30/public-large-text/`, including XML,
screenshots, the runtime script and build/scale receipt. No valid inquiry was
submitted. Font scale was restored to 1.0, and the temporary emulator, Metro and
tunnel were stopped. This establishes only the named Android large-text journey;
spoken screen-reader order, iOS Dynamic Type, physical devices, all other product
screens and enabled-provider acceptance remain separate requirements.

## iOS keyboard-obscured control navigation

Run `41031001582` failed profile creation while reaching City. The retained
hierarchy places that field at y=615 below a keyboard beginning at y=583, with
its accessory strip at y=539. Full-window swipes alternated directions without
making the field hittable; dependent editing/restart journeys were blocked.
The test helper must drag inside the visible scroll viewport, excluding the
keyboard and its accessory area. Bound each movement toward the target and
recompute geometry after every gesture. Preserve the ten-attempt limit,
existence/hittability requirements and failure screenshot/tree attachments.
Do not substitute coordinate taps for control hit testing. Actual hosted
execution must establish that creation and subsequent editing both pass.

## Contextual native price labels

Run `41032889517` passes the complete controlled-fixture iOS public journey,
including photo role, zoom/reset, background recovery and buyer inquiry behavior.
Its accessibility audit then rejects the standalone `$1,250.00` price element as
not human-readable. Native public price text must expose a localized asking-price
label containing the same exact formatted amount while preserving its visible
currency formatting. Apply the same presentation to public cards, listing detail
and historical inquiry snapshots; hidden prices retain Price on request.
Keep the full native accessibility audit enabled and require hosted execution;
this correction alone does not establish spoken screen-reader acceptance.

## iOS multiline editing completion

Hosted run 41042187883 passed creation, restoration, inventory and readiness,
but inventory editing stopped after entering Public description because no Done
button existed. The retained recording confirms the keyboard obscures the lower
form without a completion action. React Native documents that InputAccessoryView
does not support multiline TextInput. Preserve multiline/newline entry and expose
a localized Done action in the navigation bar while either description or private
notes has focus on iOS. Done dismisses editing without saving or discarding text;
single-line decimal fields retain their accessory. The existing controlled-fixture XCTest
journey must verify keyboard dismissal and exact retained text for both multiline
fields before continuing through persistence and reopening. Hosted runtime
acceptance remains pending; a type check is not interaction evidence.

## Integrated iOS acceptance — 2026-10-30

PR #138, source `80adf0254e8d5ebc286cdf80e528b5799d36e226`, passed run
`41054344257` and merged at `eb885669cf98c8cbb8f13c661d1d917d45ceb78d`.
Artifact `ios-interaction-9d7e7a2bc30a709cae0c0075eaf4bdd799c4b2ba`
(ID 12983686000) retains the journey table, logs, screenshots and xcresults.
Every scheduled outcome passed: public, create, restore, inventory, readiness,
edit, persisted, reopen and accessibility. The edit test verifies Done dismisses
both multiline keyboards without losing exact text; the reopened app verifies
the complete inventory field values. The public automated audit passes with the
contextual price label; its assertions were not filtered or weakened.

These are simulator journeys against controlled HTTP fixtures. The persisted
check reads fixture state. They are not production database, provider, spoken
screen-reader, physical-device or complete native parity acceptance. The broader
real-service/device requirements above remain in force.
