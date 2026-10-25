# Shared technician editor

Framework-independent forms in client-core preserve incomplete radius/driving
text, local times and effective dates. Contact, origin, optional biography,
searchability, work selections and weekly rules follow profile.spec.md. Defaults
leave required contact/origin/radius empty; optional driving limit is blank.
Validation returns ordered machine field paths/codes with no presentation copy.
Count Unicode code points, reject controls/unpaired surrogates, validate exact
mailboxes and injected timezone membership. Validate integer bounds without
rounding or accepting exponents, local times without UTC conversion, real dates,
unique rule keys/weekdays and supported unique work selections. Searchable
profiles need services/forms and any rule or explicit request acceptance.

Wire conversion is allowed only after validation. Trim contact/origin/biography
text; blank driving input becomes null. Copy origin, selections and rules at every
boundary. Keep stable rule identity and independent rule timezone when origin
changes. Converting stored attributes restores editable numeric strings.

Adding a rule uses an injected unique opaque key once and chooses the first
unused weekday, with visible editable 09:00–17:00, available/weekly defaults and
the current origin timezone. No implicit rule is added by changing preferences.
Refuse more than seven rules or invalid/colliding keys. Moving a rule to another
unused weekday preserves its key. Removal requires explicit confirmation; UI
confirmation names the affected weekday and clears on loss of private scope.
Form-shape recovery validates exact fields and bounded strings/arrays while
allowing incomplete input; invalid draft values must not be silently discarded.

The forthcoming controller and protected journal must durably snapshot commands
before dispatch, preserve newer edits across exact uncertain retries, enforce
revision conflict review and exclusive API/user ownership, and hide/clear private
state on denial. Native and web adapters own validation focus, platform dialogs,
localized presentation and keyboard/Back behavior. Form tests alone do not prove
protected recovery or native interaction acceptance.
