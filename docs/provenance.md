# Source provenance

This repository was generated from `elsell/make-app` at commit
`005eb2e3f5e6fd16cfaa08a980b25e3b10d3ddfb`, with no example product slice:

```sh
make-app new PianoTechPros --module github.com/elsell/pianotechpros \
  --bundle-prefix com.pianotechpros --without-example
```

The generated code is Apache-2.0 licensed. `.make-app.json` records template
compatibility. No old application Git history, source code, tests, customer data
or deployment configuration was imported.

The owner's existing product workflow informed the new capture specification.
Stuff Stash's task-first native interaction review method informed the experience
standard. This is a fresh implementation, not a formal clean-room legal process.
Future selective imports must record their source revision, license and review
for credentials, private data, internal infrastructure references and suitability.

Inventory domain registration was generated with the same pinned Make App binary
using `domain add inventory --plural inventory --fields stock_number:string` in
an isolated checkout, preserving existing inventory domain/application work.
The generated composition and manifest were retained; service, persistence and
HTTP boundaries were adapted to the specified dealer-scoped record policy. No
legacy source, configuration or data was imported for this slice.

The Android mounting-listener backport in
`patches/react-native-screens@4.23.0.patch` comes from Software Mansion's MIT
licensed react-native-screens PR 4413, merge commit
`b3badd012f83679b12f4e29f2e28eceaa4830efd` (2026-08-13):
https://github.com/software-mansion/react-native-screens/pull/4413.
Only the two `cpp/legacy/` paths were translated to 4.23.0's `cpp/` layout;
the four source diffs apply without other changes. The installed package retains
its upstream MIT license; a copy accompanies the patch in
`patches/react-native-screens.LICENSE`. The patch was reviewed for credentials, personal data,
internal hosts and deployment references; it contains only upstream C++ code,
comments and the public upstream PR URL. Reviewed patch and installed-source
SHA-256 values are recorded in `patches/react-native-screens.json` and checked by
the native compatibility gate. Retire the patch when the Expo-compatible release
includes the fix, after repeat native acceptance.

The decode-uri-component 0.5.0 packaging patch retains callable CommonJS for
React Navigation's query-string consumer. Its source is the npm 0.5.0 release
(2026-06-29), verified against the registry tarball's SHA-512 integrity. Only
`package.json` module type and `index.js` export syntax change; the upstream
bounded decoder is unchanged. The original MIT license is retained and copied
to `patches/decode-uri-component.LICENSE`. Patch/source hashes are recorded in
`patches/decode-uri-component.json` and checked by the installed-consumer test.
The patch contains no credentials, private data or deployment configuration.
Retire it when navigation's query-string consumer supports the fixed ESM decoder.

The customer timezone name catalog in
`apps/api/internal/adapters/timezones/zones.txt` is extracted from the existing
pinned Go 1.26.10 distribution's `lib/time/zoneinfo.zip`. That archive's README
identifies its source as the public-domain IANA Time Zone Database. Extraction
retains every non-directory archive entry name, deduplicates and sorts ASCII
names, then writes one UTF-8 name per line with a final newline (598 names).
No timezone implementation, private data or host configuration is imported.
The name catalog does not calculate timezone offsets.

- Source archive SHA-256: `8f55634d05f8bca1f7bc7c69c5933428c69357e0bdf565e5ba224e3f88ff12e8`.
- Name catalog SHA-256: `8725722643bf1f4ff4fc4b22268ade98b6fae047a86897219c3a13d4c4ced93d`.

Catalog initialization verifies the name digest, sorted uniqueness, allowed
identifier syntax and UTC membership. Updates require regenerating from an
explicitly reviewed toolchain archive and reviewing the names/provenance diff.
