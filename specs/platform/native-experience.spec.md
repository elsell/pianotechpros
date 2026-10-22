# Native experience specification

Status: required design and acceptance standard for product slices. The scaffold
currently provides platform authentication, not the inventory experience.

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
