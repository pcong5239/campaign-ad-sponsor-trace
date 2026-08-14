# Verification and Studionet evidence

## Release identity

- Network: GenLayer Studionet, chain ID `61999`
- Contract: `0xb19F0F29bb3B15a80Cda21C69C060a207Ed2626e`
- Deployment transaction: `0xd86fc8402a6c7828885dab581262e4be55b8b04e16823697d2cd3c84dff5de35`
- Deployer/upgrader: `0x2e53bb6ED175A7F827590D9D3a353FC51Eb8996a`
- Contract source commit: `b893c0df8359f58b0ce8cfc74eeb4ee841a54510`
- Approved source SHA-256: `121edd14667527f1b062448883f0cc6a4aadf312658bf5fdcaecfa6c7e3be611`
- Post-deployment evidence commit: `43bf62927ef74770e05fab867bffafd1c6212de3`
- Deployment result: `FINALIZED`, `MAJORITY_AGREE`, `NORMAL`, leader execution `SUCCESS`
- Deployed-source parity: `gen_getContractCode` decoded to exactly 21,152 bytes and matched the approved source byte-for-byte
- `get_upgrader()` readback matched the deployer

[Open the contract in Studionet Explorer](https://explorer-studio.genlayer.com/address/0xb19F0F29bb3B15a80Cda21C69C060a207Ed2626e).

## Live fixture

- Trace ID: `1`
- Artifact: `https://example.com/`
- Artifact SHA-256 at registration: `ff67a9d764d6a2367a187734e697f6a53217db9a21c101d410a113ca871a299d`
- Candidate / committee / cycle: `P80001571` / `C00828541` / `2024`
- Support/oppose: `S`
- Observation/cutoff: `1704067200` / `1704153600`

The fixture proves bounded provenance handling for a user-submitted URL. It is not presented as a platform-library ad or proof that a filing paid for a particular creative.

## Live transaction matrix

| Operation | Transaction | Final result | Authoritative readback |
|---|---|---|---|
| `create_trace` | `0x033090a979054d6ec243eb98fbcf8c1288b4a0d099f778506f6b74d4c82633ae` | `FINALIZED`, leader `SUCCESS` | Trace 1 owner, fields, digest, and `DRAFT` state match |
| `freeze_trace(1)` | `0x77532cc35702ee9927809af67e136647a374119f214a84ee71bc6964367bcf9d` | `FINALIZED`, leader `SUCCESS` | Trace 1 is `FROZEN`; `frozen_at` populated |
| `assess_trace(1)` | `0xb45bbfaf040587e41d5dded22615a6efa14f6524657a34455c6251fc06f09d08` | `FINALIZED`, leader `SUCCESS` | Revision 1: `NOT_COMPARABLE / ARTIFACT_PROVENANCE_INSUFFICIENT`; artifact, committee, and Schedule E status `200` |
| `reassess_trace(1)` | `0x70b5d877248232fcb6360e27eba0a2c3d984fc1d7cb2650f4a6e471ad9d90c6d` | `FINALIZED`, leader `SUCCESS` | Revision 2: `UNRESOLVED / FEC_EVIDENCE_UNAVAILABLE`; source status `200/429/429` |
| Duplicate `freeze_trace(1)` negative | `0x6a5b518da3b4d4e611c0b59a20783b00c1c702a2a178ede2992d68ebf5843af6` | `FINALIZED`, leader `ERROR` | State hash and trace/revision/latest assessment remain unchanged |

The negative transaction is diagnostic no-write evidence, not a successful write. Success claims require both successful leader execution and authoritative readback.

Final release state: trace 1 `FROZEN`; revision count 2; latest verdict `UNRESOLVED`; reason `FEC_EVIDENCE_UNAVAILABLE`; `manual_review_required=true`; source statuses `200/429/429`.

## Upgrade recovery rehearsal

The release instance was never upgraded. The following matrix used an isolated disposable contract:

- Disposable contract: `0x0b7026A051299b9B32cFd6EFD9f429B2C30B531F`
- Deployment transaction: `0xb380601aeb5a764e20a7538c5a4ead9da5e94368132dd28de2f1b79be44db281`
- Fixture transaction: `0xc606d8853c88cfdba1abfcdda1c328b24ab2e28cfd434f33e0a691d6da153b04`
- Pre-upgrade readback: trace 1 `DRAFT`, next trace ID 2, and upgrader/owner/fields matched
- Authorized upgrade: `0xa0b984696fc9a712104d02e05a00eecd6138c65f361ca99ca287805fe2440680`; `FINALIZED`, leader `SUCCESS`, five recorded votes (`3 agree`, `2 idle`)
- Authorized post-readback: exact 21,152-byte approved code plus unchanged trace, counter, and upgrader
- Unauthorized account: `0x2D4f85d9888b2499d1f9a9ca9FB2b83BFD8dBF71`
- Unauthorized upgrade: `0x77b7de923a03a42ae2cddcba74e1abb205fce9cf522b6220b6e913f11917404b`; `FINALIZED`, leader `ERROR`, five recorded votes (`3 agree`, `2 idle`)
- Unauthorized post-readback: code, trace, counter, upgrader, and state hash unchanged

Both upgrade payloads decode to the exact approved 21,152-byte source. This proves authorized replacement with storage retention and unauthorized rollback without code or storage drift.

## Reproducible local verification

| Check | Result |
|---|---|
| Contract policy | 7 pass |
| GenLayer Direct Mode (`genlayer-test==0.29.2`) | 5 pass |
| Frontend/wallet | 47 pass, covering the mandatory injected-wallet provider gate, explicit-finality full-receipt classification, transaction-specific create readback, bounded raw transaction-by-hash reconciliation, async reconciliation UI cleanup and recovery-control refresh, and exact-provider write binding |
| Production build | pass |
| Python compilation | pass |
| GenVM AST lint | 3 pass |
| GenVM semantic validation | pass: 11 methods, 6 views, 5 writes |
| Browser boundary | chooser opens with zero account RPCs; validated EIP-6963 options replace the bounded ambiguous fallback; only an explicit option requests accounts and switches Studionet on that exact provider; wallet metadata remains display-only |

```powershell
python -m unittest discover -s tests -v
python -m pytest tests\direct -v
npm test
npm run build
python -m py_compile contracts\campaign_ad_sponsor_trace.py
genvm-lint check contracts\campaign_ad_sponsor_trace.py --json
```

The semantic validator's `I200` newer-runner notice is informational. Direct Mode used an ephemeral process-local Windows unlink workaround; no source, package, or dependency was modified.

## Known limitations

- OpenFEC is public and rate-limited; the live reassessment safely returned `UNRESOLVED` when FEC endpoints returned `429`.
- A transient zero-validator view recovered after one 30-second backoff and reload; no write was replayed.
- Vite reports a non-fatal bundle-size warning.
- GitHub rendering, Vercel deployment, and the user-run hosted E2E matrix belong to later release checkpoints.
