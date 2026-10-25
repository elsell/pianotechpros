# Native microphone capture

Native voice entry uses the Expo SDK 55 audio module at exact version 55.0.18,
matching the installed Expo native module manifest. Its package has no new runtime
dependencies. The fourteen-day dependency gate and native compatibility checks
remain required. This is a new native module: exports and an older development
client cannot establish native recording acceptance; fresh Android/iOS builds and
device interaction checks remain required.

Microphone permission is requested only after Record, with shared EN/ES purpose
strings. Photo selection never requests microphone permission. Enable the native
record permission explicitly, but neither background recording nor background
playback, foreground audio service, or lock-screen controls. A focused recording
view offers a clear recording state, Stop and Cancel. Denied permission allows a
typed transcript instead. Interruption/background/navigation loss cancels capture;
an OS permission prompt itself must not be mistaken for app abandonment.

Capture uses mono AAC in an M4A container, a sixty-second native duration bound and
a six-MiB read bound. Raw audio is transient and is never put in draft recovery,
audit, logs or public data. The adapter accepts only the URI returned by its own
fresh recorder, validates that it is inside the SDK's app-private audio cache,
reads it with a bounded file handle, and deletes it after reading or cancellation.
Recorder resources and the recording audio session are released on every path.
Cleanup failure is surfaced as a fixed failure and prevents processing audio.

A framework-independent controller coordinates asynchronous permission, preparation,
recording, stop, cancellation and disposal through typed ports. It suppresses late
permission/preparation results, serializes resource ownership through cleanup,
returns a recording at most once, and exposes only stable failure codes. Controlled
port tests exercise denied permission, late work, stop failure, cleanup failure,
size limits, interruption, observer cancellation and repeated start/stop.

References: Expo SDK 55 audio documentation and Apple HIG privacy guidance.
The platform adapter and permission configuration are foundations; native review
presentation and real-device acceptance remain part of the full voice milestone.

## Shared editor coordination

Web and native presentation use a shared workspace coordinator for voice
processing. It protects a new draft before obtaining an inventory identity,
acquires the existing media mutation queue before processing, and holds that
queue until explicit Apply, Cancel or transcript correction. The paused indicator
means the queue is actually held, never merely that recording or preparation
started. Manual changes remain journaled while review is open.

Account, dealer and record scope are checked throughout processing. Cancellation,
scope loss and disposal abort provider work, release review and suppress late
results. They do not permit another operation to overlap a still-settling queue.
Audio is zeroed after processing, including failed preparation and cancellation.
Denied access clears private review state. Apply requires explicit selection;
conditional Undo remains available after the queue releases and preserves later
manual corrections. Presentation owns field selection and transcript entry;
the shared coordinator owns queue lifetime and workflow orchestration.

## Native review presentation

The editor opens a dedicated native modal for voice entry. The first screen
explains the one-minute limit and offers Record or an editable transcript;
permission is requested only by the Record action. Recording has visible Stop
and Cancel controls. Keyboard avoidance, safe areas, Dynamic Type, theme colors,
accessible labels and at least 44-point touch targets apply throughout.

After processing, review shows each field's current and proposed values, evidence
and confidence, with no field selected automatically. Native switches select
fields; Apply remains disabled until at least one selection is made. Transcript
correction releases the old review before another extraction. Apply returns to
the editor with an explicit Undo action; conflicts require renewed review and
clear the selection. Back, accessibility escape and Cancel discard transient
voice work without discarding the protected inventory draft. Backgrounding or
leaving the editor cancels capture and processing and clears private transcript
and review state. An OS permission prompt does not close the entry screen.

Photo and publication actions cannot overlap an open voice flow. The save banner
reports a pause only while the shared coordinator owns the mutation queue.
Native compilation and export do not establish interaction acceptance: fresh
build tests must cover typed transcript and actual microphone paths, permission
denial, background cancellation, selected Apply and conditional Undo.

Cleanup failure must retain a visible retry action even after the sheet closes;
an inaccessible busy state cannot trap the editor. Explicit missing/expired
application credentials are denied access, including rejection before transport,
and clear transient transcript/review state.

Unmount does not relinquish ownership of failed cleanup. A process-scoped retired
capture registry retains failed disposal and retries it before another microphone
permission/acquisition attempt. Active captures are never reclaimed by that
registry. A failed retry reports cleanup failure; successful retry removes the
retired owner. This registry holds resource handles, never transcript or audio.

The native modal owns a SafeAreaProvider so its insets reflect its own window,
not the underlying navigation screen. The Apply footer must remain completely
above Android gesture navigation and iOS home-indicator areas.

Switching between transcript entry and review resets the keyboard-avoidance layout.
Review has no keyboard avoidance and must size its scroll area around the Apply
footer, without carrying the transcript editor's measured height.

Android permission requests may briefly report the app as backgrounded. Query an
existing grant before opening a prompt. While the controller is requesting
permission, defer background cleanup until the request resolves and the activity
returns active (at most 1.5 seconds after resolution). No recording may start
while backgrounded. If foreground does not resume, clear the sheet and cancel the
request; cancellation or unmount must still suppress a late grant. Denial after
normal prompt dismissal remains visible in the sheet. Genuine backgrounding at
all other phases cancels immediately.
