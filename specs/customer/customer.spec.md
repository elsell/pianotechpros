# Customer domain boundary

The product contract is [profile.spec.md](profile.spec.md). Customers own private
profiles with stable nested locations and pianos; they are independent of dealer
inventory and technician capabilities. Generic delete is not a product operation.

Generated HTTP and application extension points remain authenticated and
fail-closed with policy-not-configured until the product policy, persistence and
adversarial tests are complete. Registration alone does not enable this feature.
