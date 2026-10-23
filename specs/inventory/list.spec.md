# Private inventory browsing

Confirmed dealer members with the inventory read permission may browse their
dealer's inventory. Each page requires fresh session, membership, SpiceDB and
coordinated rate-limit checks, plus transactional local authority revalidation and
a collection-level audit. Audit failure returns no records. No query is unscoped.

Default browsing includes draft, available, reserved and in_service records.
Include-inactive deliberately adds sold and archived; an explicit status filter
selects exactly that status, including sold or archived. Search is a trimmed,
case-insensitive literal substring of stock number, title, make or model. Percent,
underscore and backslash are literal characters, never SQL wildcard syntax.
Search is limited to 120 Unicode code points and must be valid UTF-8 without
control characters. Search never includes serial, cost or private notes.

Pages contain at most 100 records (default 30 at the API boundary). Ordering is
featured first, then creation time descending, then record ID ascending. A cursor
captures the last ordering tuple and the first page's creation-time ceiling. The
cursor must be opaque and integrity-protected, bound to actor, dealer and exact
normalized filters. Changing filters starts a fresh page. Newly created records
after the ceiling do not appear during pagination. This is not snapshot isolation:
editing featured flags or searchable values may move records between pages;
refresh starts a new traversal. Do not claim a stable total count.

The repository accepts validated pagination tuples and returns at most limit
records plus a has-more flag. It validates stored attributes using the same mapper
as individual reads. A malformed row fails the entire page. An empty page still
records the authorized list audit. No private values or search text enter audits.
Public showroom browsing is a separate projection and permission boundary.
