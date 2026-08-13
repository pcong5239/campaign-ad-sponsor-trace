# Verification matrix

Contract source commit: `a9317075b465cf1f4bb40db829fcd04bbce3d747`
Approved PRE_DEPLOY package commit: `56e41216764071835b657c3ff5a7c337ec7689c6`
Contract SHA-256: `121edd14667527f1b062448883f0cc6a4aadf312658bf5fdcaecfa6c7e3be611`

`docs/PREDEPLOY_MANIFEST.sha256` is retained as the immutable manifest of the approved PRE_DEPLOY package. The refreshed POST_DEPLOY_TEST package is bound separately to its exact Git commit and `docs/POSTDEPLOY_MANIFEST.sha256`; neither manifest is represented as covering the other checkpoint.

| Boundary | Required evidence |
|---|---|
| Contract syntax | Python compile and GenVM AST lint |
| Contract semantics | Pinned SDK semantic validation and direct-mode tests |
| Consensus | Independent-refetch projection test plus live agreement and disagreement transactions |
| Provenance | Platform/archive/user-host matrix and changed-byte rejection |
| Frontend boundary | Lossless integers, untrusted JSON, terminal receipt classification |
| Wallet | Explicit provider chooser; no account request during discovery |
| Writes | Durable pre-submit reservation, persisted full intent, duplicate-write lock, finalized status, successful execution, exact readback, and restart-safe reconciliation |
| Responsive | 320, 375, 414, 768, and desktop; no horizontal scroll; ≥44 px mobile targets |
| Studionet | Source, address, schema, deploy receipt, every write journey, and readback parity |

## Current local results

- Contract policy tests: 7 pass.
- GenLayer Direct Mode tests: 5 pass (create/freeze authorization, upgrader authorization/replacement call, validator agreement/disagreement, unavailable-artifact safe failure, and truncated-FEC-result safe failure).
- Frontend boundary tests: 16 pass, including strict 32-byte transaction-hash validation, pre-submit persistence failure, hash-binding failure and recovery, wallet rejection, ambiguous submission, timeout/reload lock, duplicate prevention, successful reconciliation, finalized-error retry, unresolved receipt retention, and readback mismatch retention.
- Production build: pass.
- Python bytecode compilation: pass.
- GenVM AST lint: 3 pass.
- GenVM semantic validation: pass; contract `CampaignAdSponsorTrace`, 11 methods, 6 views, 5 writes.
- UI browser QA: pass at 320×800 and 1280×800; no horizontal overflow, undersized effective targets, unlabeled controls, multiline action labels, or placeholder zero address. A post-deployment local-browser check displays release address `0xb19F…626e` and opens an explicit provider chooser before any connection request.
- Studionet release deployment: pass at `0xb19F0F29bb3B15a80Cda21C69C060a207Ed2626e`; deployed source readback matches the approved 21,152 bytes and SHA-256.
- Existing Studionet transactions and authoritative readbacks cover create, freeze, assess, reassess, and a finalized duplicate-freeze negative control. Under the user's explicit Task-local 2026-08-14 instruction, the primary AI executed and verified this Task's Studio contract matrix; see `docs/POST_DEPLOY_EVIDENCE.md`.
- Upgrade recovery rehearsal: pass on the disposable deployment. Authorized transaction `0xa0b984...40680` finalized with leader `SUCCESS` and exact 21,152-byte source parity; unauthorized transaction `0x77b7de...7404b` finalized with leader `ERROR`; exact code and storage readback proved no negative-path drift. The release instance was not modified.

The semantic validator reports informational warning `I200`: a newer `py-genlayer` runner exists. The source intentionally retains the current documentation-pinned dependency hash reviewed for this revision.

Local-only and live-network evidence remain explicitly separated.
