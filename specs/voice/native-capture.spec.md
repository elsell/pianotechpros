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
