# Verification matrix

| Boundary | Required evidence |
|---|---|
| Contract syntax | Python compile and GenVM AST lint |
| Contract semantics | Pinned SDK semantic validation and direct-mode tests |
| Consensus | Independent-refetch projection test plus live agreement and disagreement transactions |
| Provenance | Platform/archive/user-host matrix and changed-byte rejection |
| Frontend boundary | Lossless integers, untrusted JSON, terminal receipt classification |
| Wallet | Explicit provider chooser; no account request during discovery |
| Writes | Finalized status, successful execution, exact readback, retained hash on uncertainty |
| Responsive | 320, 375, 414, 768, and desktop; no horizontal scroll; ≥44 px mobile targets |
| Studionet | Source, address, schema, deploy receipt, every write journey, and readback parity |

## Current local results

- Contract policy tests: 7 pass.
- GenLayer Direct Mode tests: 4 pass (create/freeze authorization, upgrader authorization/replacement call, validator agreement/disagreement, and unavailable-artifact safe failure).
- Frontend boundary tests: 7 pass.
- Production build: pass.
- Python bytecode compilation: pass.
- GenVM AST lint: 3 pass.
- GenVM semantic validation: pass; contract `CampaignAdSponsorTrace`, 11 methods, 6 views, 5 writes.
- UI browser QA: pass at 320×800 and 1280×800; no horizontal overflow, undersized effective targets, unlabeled controls, multiline action labels, or placeholder zero address.
- Studionet deployment and live tests: intentionally pending PRE_DEPLOY approval.

The semantic validator reports informational warning `I200`: a newer `py-genlayer` runner exists. The source intentionally retains the current documentation-pinned dependency hash reviewed for this revision.

No local-only result is represented as live-network evidence.
