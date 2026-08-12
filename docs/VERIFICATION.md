# Verification matrix

Contract source commit: `a9317075b465cf1f4bb40db829fcd04bbce3d747`
Previous PRE_DEPLOY package commit: `51003617afea21a1974397cd1738764b5099cd06`
Contract SHA-256: `121edd14667527f1b062448883f0cc6a4aadf312658bf5fdcaecfa6c7e3be611`

The current remediation package is bound by the exact Git commit in its review envelope. Its canonical manifest is `docs/PREDEPLOY_MANIFEST.sha256`: SHA-256 of every Git-tracked file except the manifest itself, one lowercase digest plus two spaces plus a forward-slash path, sorted by path. The manifest file's own SHA-256 is supplied in that envelope, avoiding a self-referential digest.

| Boundary | Required evidence |
|---|---|
| Contract syntax | Python compile and GenVM AST lint |
| Contract semantics | Pinned SDK semantic validation and direct-mode tests |
| Consensus | Independent-refetch projection test plus live agreement and disagreement transactions |
| Provenance | Platform/archive/user-host matrix and changed-byte rejection |
| Frontend boundary | Lossless integers, untrusted JSON, terminal receipt classification |
| Wallet | Explicit provider chooser; no account request during discovery |
| Writes | Persisted full intent, duplicate-write lock, finalized status, successful execution, exact readback, and restart-safe reconciliation |
| Responsive | 320, 375, 414, 768, and desktop; no horizontal scroll; ≥44 px mobile targets |
| Studionet | Source, address, schema, deploy receipt, every write journey, and readback parity |

## Current local results

- Contract policy tests: 7 pass.
- GenLayer Direct Mode tests: 5 pass (create/freeze authorization, upgrader authorization/replacement call, validator agreement/disagreement, unavailable-artifact safe failure, and truncated-FEC-result safe failure).
- Frontend boundary tests: 10 pass, including timeout/reload lock, duplicate prevention, successful reconciliation, finalized-error retry, unresolved receipt retention, and readback mismatch retention.
- Production build: pass.
- Python bytecode compilation: pass.
- GenVM AST lint: 3 pass.
- GenVM semantic validation: pass; contract `CampaignAdSponsorTrace`, 11 methods, 6 views, 5 writes.
- UI browser QA: pass at 320×800 and 1280×800; no horizontal overflow, undersized effective targets, unlabeled controls, multiline action labels, or placeholder zero address.
- Studionet deployment and live tests: intentionally pending PRE_DEPLOY approval.

The semantic validator reports informational warning `I200`: a newer `py-genlayer` runner exists. The source intentionally retains the current documentation-pinned dependency hash reviewed for this revision.

No local-only result is represented as live-network evidence.
