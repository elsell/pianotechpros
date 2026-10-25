# Web inventory voice review

After photos, the private inventory editor offers recording or a typed transcript.
Recording requests microphone permission only on explicit action, shows permission,
recording and stopping states, and provides distinct Stop and Cancel actions.
The document permits same-origin microphone access while camera/geolocation remain
disabled. No provider secret or browser speech provider is used.

Processing first protects the draft and creates a private New record if needed.
It uses the workspace mutation queue to stabilize the baseline revision. Manual
typing remains possible and locally journaled; server autosave stays paused through
processing and proposal review. Apply, Cancel or closing the editor releases this
queue. Photo/publication work cannot start during this interval. Network errors
retain the transcript for explicit retry; cancellation, scope loss and disposal
clear transcript/proposal/audio. Hidden pages cancel voice work.

Edit transcript leaves review, retains its text for correction and requires a new
explicit extraction. Review displays transcript, current and proposed values, confidence and quoted
evidence. No candidate is selected initially. Apply requires explicit selection;
unchosen and incomplete manual fields remain intact. Intervening selected-field
edits require renewed review, not silent overwrite. Applying changes only the
recoverable draft and resumes its existing autosave; its success notice must not
claim a durable server save. Conditional Undo preserves later corrections. Voice
provenance in persistence is a separately required follow-up to this UI slice.

All copy, status, accessibility text and errors use both locale catalogs. Errors
are fixed localized messages. Controls meet existing keyboard/focus/44px targets;
the comparison stacks at narrow widths. Transcript content is rendered as text.
Controlled real HTTP/browser acceptance covers selection, manual edits, Undo,
failure/retry, cancellation and no inventory mutation before Apply.
