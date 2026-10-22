# Delivery boundaries

CI validates this application without access to the existing deployment. It runs
Go/client tests, contract drift and security checks, browser/API acceptance,
container builds and native compilation. iOS uses a macOS runner and simulator
build without signing. Android uses a Linux runner and debug build.

The Release workflow is manual-only and requires successful push CI for the
current main commit. It scans images before publication and produces release
artifacts. It has no GitOps write, cluster credentials, DNS action or store upload.
Do not confuse publishing an image with deploying it.

Before store delivery, configure final app identities, reviewed artwork and
permission disclosures, production HTTPS endpoints, store records and signing
outside Git. Run simulator interaction and physical-device acceptance. Apple
credentials are not needed to work on or compile the scaffold in CI.

Future hosting must use a separately chosen hostname, isolated data and secrets,
and an explicit promotion/rollback plan. The existing application's pipeline and
live version remain independent. No cutover or data migration is included here.
