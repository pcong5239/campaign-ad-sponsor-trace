# Studionet post-deployment evidence

## Deployment identity

- Network: GenLayer Studionet, chain ID `61999`
- Contract: `0xb19F0F29bb3B15a80Cda21C69C060a207Ed2626e`
- Deployment transaction: `0xd86fc8402a6c7828885dab581262e4be55b8b04e16823697d2cd3c84dff5de35`
- Deployer/upgrader: `0x2e53bb6ED175A7F827590D9D3a353FC51Eb8996a`
- Constructor arguments: none
- Receipt: `FINALIZED`, `MAJORITY_AGREE`, execution mode `NORMAL`, with a successful leader receipt
- Approved source commit: `a9317075b465cf1f4bb40db829fcd04bbce3d747`
- Approved/deployed SHA-256: `121edd14667527f1b062448883f0cc6a4aadf312658bf5fdcaecfa6c7e3be611`
- Source parity: `gen_getContractCode` Base64-decoded to 21,152 bytes, byte-for-byte equal to the approved local file
- `get_upgrader()` readback: `0x2e53bb6ed175a7f827590d9d3a353fc51eb8996a`

An unrelated concurrent deployment from the same Studio account was excluded because its recipient and deployed-source hash did not match this project. No address, transaction, source, or state from that Task is used here.

## Live fixture

- Trace ID: `1`
- Artifact: `https://example.com/`
- Artifact SHA-256 at registration: `ff67a9d764d6a2367a187734e697f6a53217db9a21c101d410a113ca871a299d`
- Candidate: `P80001571`
- Committee: `C00828541`
- Cycle: `2024`
- Support/oppose: `S`
- Observation/cutoff: `1704067200` / `1704153600`

The fixture is intentionally a user-submitted URL. It proves bounded provenance handling; it is not presented as a platform-library ad or evidence that a filing paid for a particular creative.

## Existing Studionet transaction and readback matrix

| Operation | Transaction | Final result | State hash | Authoritative readback |
|---|---|---|---|---|
| `create_trace` | `0x033090a979054d6ec243eb98fbcf8c1288b4a0d099f778506f6b74d4c82633ae` | `FINALIZED`, `MAJORITY_AGREE`, successful leader | `84d51e735f86c6d101cfac6f906feceb2074c0e3fad897cbf4c89839f1552306` | Trace `1`, owner matches deployer, state `DRAFT`, digest and all bound fields match |
| `freeze_trace(1)` | `0x77532cc35702ee9927809af67e136647a374119f214a84ee71bc6964367bcf9d` | `FINALIZED`, `MAJORITY_AGREE`, successful leader | `7a2f28b9d3cdb59d58f88cde38d555ef34cc6ec13b8774e5da78e6a55f72aa6e` | Trace `1` state `FROZEN`; `frozen_at` populated |
| `assess_trace(1)` | `0xb45bbfaf040587e41d5dded22615a6efa14f6524657a34455c6251fc06f09d08` | `FINALIZED`, `MAJORITY_AGREE`, successful leader | `9d3a955d42886be2e360d82fb2fa40f03930a2419a727cbd4606ea4accfecf95` | Revision `1`; `NOT_COMPARABLE / ARTIFACT_PROVENANCE_INSUFFICIENT`; artifact, committee, and Schedule E status `200`; bound artifact digest matches |
| `reassess_trace(1)` | `0x70b5d877248232fcb6360e27eba0a2c3d984fc1d7cb2650f4a6e471ad9d90c6d` | `FINALIZED`, `MAJORITY_AGREE`, successful leader | `878afd38023d26027fac4ac17eeb4b7fe30d514d3771f4fd43fbd9d51f463915` | Revision `2`; `UNRESOLVED / FEC_EVIDENCE_UNAVAILABLE`; artifact `200`, FEC endpoints `429`; no false sponsor conclusion |
| Duplicate `freeze_trace(1)` negative control | `0x6a5b518da3b4d4e611c0b59a20783b00c1c702a2a178ede2992d68ebf5843af6` | `FINALIZED`, `MAJORITY_AGREE`, leader execution `ERROR` as expected | `878afd38023d26027fac4ac17eeb4b7fe30d514d3771f4fd43fbd9d51f463915` | State hash unchanged; trace remains `FROZEN`; revision remains `2`; latest assessment unchanged |

The negative transaction is diagnostic no-write evidence, not a successful write. Success claims above rely only on a successful leader receipt plus authoritative readback.

## Task-local Studio execution authority

On 2026-08-14 the user explicitly instructed that this existing Task continues under its prior Studio rule: the primary AI directly executes and verifies the Studio contract matrix, while the user will directly execute the later Vercel end-to-end matrix. This explicit current Task instruction is recorded as a Task-local override; it does not amend shared governance or apply to another Task. All Studio actions below were performed by the primary AI in the isolated project session and are reported as such.

## Final authoritative state after the matrix

- Trace state: `FROZEN`
- Revision count: `2`
- Latest verdict: `UNRESOLVED`
- Latest reason: `FEC_EVIDENCE_UNAVAILABLE`
- Manual review required: `true`
- Latest source statuses: artifact `200`, committee `429`, Schedule E `429`

## Isolated upgrade rehearsal

- Disposable contract: `0x0b7026A051299b9B32cFd6EFD9f429B2C30B531F`
- Disposable deployment transaction: `0xb380601aeb5a764e20a7538c5a4ead9da5e94368132dd28de2f1b79be44db281`
- Disposable deployment result: `FINALIZED`, `MAJORITY_AGREE`, successful leader execution
- Disposable upgrader readback: `0x2e53bb6ed175a7f827590d9d3a353fc51eb8996a`
- Pre-upgrade `get_next_trace_id()` readback: `1`
- Pre-upgrade fixture transaction: `0xc606d8853c88cfdba1abfcdda1c328b24ab2e28cfd434f33e0a691d6da153b04`
- Fixture result: `FINALIZED`, consensus agreement, successful leader execution, state hash `6e489e708228e1ba93ca61575f047af4eea0f0c2cebfa0468a7249345fc67a92`; never resubmit it.
- Authoritative pre-upgrade readback: trace `1` is `DRAFT`, its owner and all bound fixture fields match, and `get_next_trace_id()` is `2`.
- The editor-created disposable source readback used CRLF and was 21,676 bytes; LF normalization reproduced the approved 21,152 bytes and SHA-256. It is not claimed as raw byte parity.
- Prepared public `upgrade(new_code: bytes)` payload: `b#` plus the hexadecimal encoding of the exact approved 21,152 source bytes. Reverse-decoding reproduces SHA-256 `121edd14667527f1b062448883f0cc6a4aadf312658bf5fdcaecfa6c7e3be611`, including the final LF.
- The prior `500 requests/hour` quota window cleared. A later transient refresh showed zero validators; after a single 30-second backoff and reload, Studio restored 20 validators. No write was replayed during recovery.
- Authorized upgrade transaction: `0xa0b984696fc9a712104d02e05a00eecd6138c65f361ca99ca287805fe2440680`, submitted from the recorded upgrader in Normal Full Consensus mode; `FINALIZED`, leader `SUCCESS`, 5 recorded validator votes (`3 agree`, `2 idle`), state hash `fe5ef01fafc8878c6835b03dbca58d14f80dbc928046d43778ba67121a7f9946`.
- Authorized post-readback: deployed code is exactly 21,152 UTF-8 bytes with SHA-256 `121edd14667527f1b062448883f0cc6a4aadf312658bf5fdcaecfa6c7e3be611`; trace `1`, `get_next_trace_id() == 2`, and `get_upgrader()` are unchanged.
- Unauthorized negative account: `0x2D4f85d9888b2499d1f9a9ca9FB2b83BFD8dBF71`.
- Unauthorized upgrade transaction: `0x77b7de923a03a42ae2cddcba74e1abb205fce9cf522b6220b6e913f11917404b`; `FINALIZED`, leader `ERROR`, 5 recorded validator votes (`3 agree`, `2 idle`), state hash unchanged at `fe5ef01fafc8878c6835b03dbca58d14f80dbc928046d43778ba67121a7f9946`.
- Unauthorized post-readback: code bytes/hash, trace `1`, counter `2`, and upgrader are unchanged, proving rollback with no code or storage drift.
- A click on Studio's separate top-level `Upgrade code` control produced no transaction and later logged `gen_getContractSchemaForCode ... invalid_contract absent_runner_comment`. Per the applicable experience rule, that deployer-provenance UI is not the contract-authorized path and is not counted as upgrade evidence. The public `upgrade(new_code: bytes)` path above finalized successfully and its deployed code plus callable views were independently read back through `genlayer-js`.

The release instance was never upgraded. The isolated authorized and unauthorized matrix is complete. Remaining checkpoint work is to bind the refreshed exact revision and submit it for anonymous `POST_DEPLOY_TEST` review.

## Refreshed local verification

- Python 3.13 policy tests: 7 pass.
- `genlayer-test==0.29.2` Direct Mode: 5 pass using a process-local Windows `WinError 32` unlink shield; no package or source was modified.
- Python compilation: pass.
- `genvm-linter==0.11.0`: 3 AST checks pass; semantic validation passes against the existing cached GenVM `v0.3.0-rc7` bundle.
- Frontend tests: 16 pass.
- Production build: pass; compiled bundle contains release address `0xb19F0F29bb3B15a80Cda21C69C060a207Ed2626e`.
- Local browser: release address is displayed and `Choose wallet` opens an explicit provider chooser before any connection request.
