# PianoTechPros

A new foundation for piano dealers to photograph instruments, capture details,
and keep their inventory and public showroom in sync—on the web, iOS and Android.

**Status: platform scaffold.** Authentication, API contracts, audit infrastructure,
web/mobile entry points and CI are included. Piano inventory, photography,
dictation and showroom workflows are specified but not implemented yet.
The existing application continues running independently; this repository has no
deployment connection to it.

The delivery target is a **feature-complete web, iOS and Android rebuild**.
The foundation is complete; product implementation is in progress. The
[legacy parity matrix](specs/platform/product-parity.spec.md) tracks the required
features and the evidence needed before claiming completion.

## Start locally

Install Go 1.25.13, Node 22.17.0, pnpm 11.0.7, Python 3, Make, Git and Docker
Compose, then run:

```sh
make bootstrap
make dev
```

Open the web app at `http://localhost:5173`. The API is at
`http://localhost:8080` and development sign-in is at
`http://localhost:5556/dex`. The bundled local-only test account is
`developer@example.com`, password `password`. Never use those credentials in a
public environment. See [development](docs/development.md) for commands and
[mobile development](docs/mobile.md) for simulator and device networking.

## What's here

| Area | Foundation |
| --- | --- |
| API | Go, Huma/OpenAPI, PostgreSQL/GORM, explicit ports and adapters |
| Identity | OIDC exchange, rotating application sessions, secure native storage |
| Authorization | SpiceDB with constrained runtime capabilities |
| Audit | Append-only events and transactional mutation history |
| Web | SvelteKit, generated API client, English/Spanish catalog |
| iOS and Android | React Native/Expo, native navigation foundation, development client |
| CI | Tests, security, contracts, browser/API acceptance, images, native compilation |

`make verify` runs checks, race tests, dependency-age/security gates, contracts and
builds. `make acceptance` exercises the running platform. Hosted CI separately
builds Android debug and unsigned iOS simulator apps; neither needs store signing
credentials. Native builds do not establish interactive or physical-device QA.

## Product direction

The first product slice is a photo-first New Piano flow: capture photos, describe
the instrument, retain a private draft, and publish deliberately. Saving a draft
must never change the buyer-visible version. Voice proposals must be inspectable
and reversible. Native applications follow each platform's interaction patterns,
with keyboard, accessibility, dismissal and recovery tested as part of the work.

- [Capture and publication contract](specs/inventory/capture.spec.md)
- [Native experience standard](specs/platform/native-experience.spec.md)
- [Roadmap and verification evidence](specs/platform/roadmap.spec.md)
- [Architecture](specs/platform/architecture.spec.md)

## Delivery

GitHub Actions runs on pushes and pull requests. Release publication is manual
and requires successful CI; it can publish artifacts but does not deploy an app.
GitOps, DNS, production data and store publication are intentionally unconfigured.
Apple/Google account setup, signing, store artwork and a separate deployment
hostname come after product and native acceptance. See [delivery](docs/delivery.md).

Generated from [Make App](https://github.com/elsell/make-app), with fresh history
and no old application source or tests imported. See [provenance](docs/provenance.md),
[compatibility](docs/compatibility.md), [security](SECURITY.md) and [license](LICENSE).
