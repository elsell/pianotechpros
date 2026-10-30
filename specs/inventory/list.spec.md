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

## API and continuation binding

`GET /v1/dealers/{dealerID}/inventory` accepts `search`, `status`,
`includeInactive`, `limit` (1–100, default 30) and `cursor`. It returns the shared
`data` array and `meta.nextCursor` envelope; the terminal cursor is omitted.
Responses are no-store with no-referrer policy. Validation errors never echo
search text, cursor contents or credentials.

Application composition requires a listing port and at least 32 bytes of cursor
key material. Continuations are AES-256-GCM sealed using a context-derived key,
fresh cryptographic nonces and a versioned inventory-specific context. They bind
the actor, dealer, trimmed search, status, include-inactive flag, creation ceiling
and complete ordering tuple. Page size may change between requests. Reject
malformed, oversized, altered, foreign-scope or changed-filter cursors before
listing storage is called. Decoding never replaces fresh access checks. The
application constructs the ceiling from its injected clock; clients cannot supply
it. No continuation can authorize reads after membership or permission revocation.

## Browsing presentation

Web and native dealer profiles open an account/dealer-scoped inventory browser.
Search submits deliberately and filters reset pagination. Available status choices
are active (the default), all, and each lifecycle status. Show stock, display title,
featured status and lifecycle status in readable rows. Empty matches, loading,
failed refresh and failed pagination have distinct localized presentation. Refresh
and explicit load-more remain accessible without gestures. Native additionally
supports pull-to-refresh, system search keyboard submission, large text and dark
mode; all labels and accessibility copy use the shared English/Spanish catalog.

A shared controller owns filters and page sequencing. Changing filters clears old
results immediately, and late responses cannot restore an older query. Concurrent
load-more requests coalesce. Transient failures retain rows for the current filter
and retry the failed operation. Explicit access rejection removes all rows and
continuations. Disposal clears private state and suppresses late completion.
Platform components remain responsible for navigation and native interaction design.
Browsing alone does not complete capture, editing, photos or publication journeys.


Native keyboard search submission uses the text carried by the native submit
event, rather than a render-captured search value. Rapid typing and Return can
arrive before React commits the last change event; submitting stale state must
not leave the old unfiltered rows visible. Keep the displayed search synchronized
with the submitted value and preserve it through status changes. The native
acceptance journey types `UI-002` and Return while Sold is selected, requires an
empty result, then selects Available and requires the matching piano without
retyping. Exact text retention remains part of the assertion.
