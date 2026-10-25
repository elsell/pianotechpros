# Customer location timezone catalog

Location timezone choices come from one immutable public IANA name catalog,
shared by validation and the authenticated customer metadata response. Preserve
supported compatibility aliases, including unprefixed IANA names such as CET and
GMT, rather than silently replacing a saved identifier. UTC is always present.
Reject Local, paths with empty/traversal segments, arbitrary offsets, unknown
names and invalid characters. Names are external reference data, not translated
user-interface copy; the field label, search, errors and help remain localized.

The adapter embeds a sorted unique name list extracted from the pinned Go
1.26.10 zoneinfo archive. Source and resulting SHA-256 digests and extraction
rules are recorded in provenance. No host timezone files, local timezone,
environment variables or network calls affect membership. Bootstrap injects the
same catalog into the customer domain policy and persistence adapter. The adapter
returns defensive copies for picker choices and fails construction on malformed
or mismatched embedded data. This name catalog validates identifiers only; it
must not be used as an offset calculator for scheduling.

Tests cover UTC, regional names, aliases, unknown and unsafe identifiers,
immutable returned lists, sorted uniqueness, bounded catalog integrity, and
customer domain validation using an allowed single-component alias. No customer
route may bypass authentication or the principal audit budget to obtain metadata.
