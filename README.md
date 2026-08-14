# Campaign Ad Sponsor Trace

Campaign Ad Sponsor Trace binds an exact federal political-ad artifact and records a validator-agreed comparison with official FEC committee and Schedule E evidence.

## Verified links

- Live app: pending the Vercel release checkpoint
- [Studionet contract](https://explorer-studio.genlayer.com/address/0xb19F0F29bb3B15a80Cda21C69C060a207Ed2626e)
- [Deployment transaction](https://explorer-studio.genlayer.com/tx/0xd86fc8402a6c7828885dab581262e4be55b8b04e16823697d2cd3c84dff5de35)
- Network: Studionet, chain ID `61999`

## Trust problem

A submitter, advertiser, or ordinary application server can select favorable evidence or change an artifact, disclaimer, committee claim, candidate relation, or observation window after publication. A useful trace therefore cannot rely on the submitter or a conventional backend as its source of truth.

The product is deliberately narrow. It does not decide legality, coordination, political truth, candidate quality, or whether a filing paid for the exact creative.

## Why GenLayer is essential

The Intelligent Contract freezes the submitted boundary, fetches the artifact and official OpenFEC sources, derives a bounded result, and asks validators to independently refetch and compare the consequential projection. Only the validator-agreed projection becomes an immutable assessment revision on Studionet.

Unavailable, malformed, conflicting, weak-provenance, or incomplete evidence fails safely as `UNRESOLVED` or `NOT_COMPARABLE`; it cannot become a positive compatibility result.

## How it works

1. A registrant submits an HTTPS artifact URL, exact artifact digest, disclaimer, candidate, committee, cycle, relation, observation time, and filing cutoff.
2. The owner freezes the trace, making that boundary immutable.
3. Anyone may assess it after the cutoff. Validators independently retrieve and compare the artifact, committee record, and Schedule E records.
4. Anyone may reassess later. Each result is appended as a new revision; earlier revisions remain readable.
5. Public reads require no wallet. Writes open an explicit wallet-provider chooser before requesting connection.

Supported verdicts are `COMPATIBLE_FEC_TRACE_FOUND`, `CLAIMED_COMMITTEE_MISMATCH`, `DISCLAIMER_PAYOR_MISMATCH`, `NO_COMPATIBLE_FILING_AS_OF_CUTOFF`, `NOT_COMPARABLE`, and `UNRESOLVED`.

## Architecture

```text
artifact URL + OpenFEC sources
             |
       leader derives
             |
    validator refetches
             |
 consequential projection -> immutable on-chain revision

browser -> genlayer-js -> Studionet -> CampaignAdSponsorTrace
```

The Vite frontend is static and has no authoritative backend. The contract owns the frozen inputs, revision history, verdict, evidence digests, and source statuses. The browser owns only presentation, wallet selection, transaction tracking, and authoritative readback.

## Intelligent Contract

- `create_trace(...)` creates a mutable `DRAFT` owned by its registrant.
- `freeze_trace(trace_id)` is owner-only and moves the trace to `FROZEN`.
- `assess_trace(trace_id)` is permissionless after cutoff and creates revision 1.
- `reassess_trace(trace_id)` is permissionless and appends another revision.
- Views expose the frozen trace, latest or exact revision, revision count, next trace ID, and upgrader.

The equivalence validator independently recreates the decision projection, including verdict, evidence identity, relationship bands, and any matched FEC transaction. Schema validation is defense in depth, not the consensus decision.

The contract has no token, payout, fee, staking, or other economic value path. It is `UPGRADABLE`; the recorded Studio account is the sole initial upgrader.

## Transaction lifecycle

Before signing, the frontend persists and read-verifies a complete `SUBMITTING` intent. It then submits exactly one write, validates the returned 32-byte transaction hash, waits for `FINALIZED`, requires leader execution `SUCCESS`, and performs method-specific contract readback before clearing the intent.

Timeouts, ambiguous provider errors, non-final receipts, and readback mismatches retain the intent and block blind retry. A conclusive `FINALIZED` execution error clears the intent and permits a safe retry. A user may bind a valid recovered hash and reconcile it after reload; explicit wallet rejection also clears the pre-submit reservation safely.

## Run locally

Prerequisites: Node.js 22+, Python 3.12+, `genvm-lint`, and `genlayer-test==0.29.2` for Direct Mode.

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

`.env.example` is already bound to the verified release contract:

```text
VITE_CONTRACT_ADDRESS=0xb19F0F29bb3B15a80Cda21C69C060a207Ed2626e
```

## Tests and verification

```powershell
python -m unittest discover -s tests -v
python -m pytest tests\direct -v
npm test
npm run build
genvm-lint check contracts\campaign_ad_sponsor_trace.py --json
```

Current verified results: policy `7/7`, Direct Mode `5/5`, frontend/wallet `19/19`, production build pass, Python compilation pass, GenVM AST lint `3/3`, and semantic validation pass. Wallet coverage binds OKX only to its dedicated `com.okex.wallet` EIP-6963 announcement; direct, legacy, and mismatched-identity routers fail closed. See [verification and Studionet evidence](docs/VERIFICATION.md).

## Deployment

- Contract: `0xb19F0F29bb3B15a80Cda21C69C060a207Ed2626e`
- Deployment transaction: `0xd86fc8402a6c7828885dab581262e4be55b8b04e16823697d2cd3c84dff5de35`
- Approved source SHA-256: `121edd14667527f1b062448883f0cc6a4aadf312658bf5fdcaecfa6c7e3be611`
- Deployed source readback: exact 21,152-byte parity
- Post-deployment evidence package: commit `43bf62927ef74770e05fab867bffafd1c6212de3`

Recovery and upgrade procedures are documented in [deployment](docs/DEPLOYMENT.md). The isolated rehearsal proves an authorized upgrade preserves storage and an unauthorized upgrade rolls back without code or state drift; the release instance was not upgraded.

## Security and trust boundaries

- Political content is delimited as untrusted evidence in model prompts.
- Artifact provenance is derived from the hostname; a registrant cannot self-label an arbitrary host as an official library.
- User-controlled URLs remain inspectable but cannot receive `COMPATIBLE_FEC_TRACE_FOUND`.
- OpenFEC uses its public rate-limited `DEMO_KEY`; no private API key is embedded.
- Incomplete pagination, source failures, and rate limits cannot produce a negative absence finding.
- Losing the upgrader account or a Studionet reset can remove the practical recovery path.
- Storage field order and types must remain unchanged across upgrades.

## Known limitations

- Federal candidate independent expenditures only; candidate-funded ads, state elections, audio/video extraction, legal compliance, coordination findings, truth scoring, and enforcement are out of scope.
- Platform and archive URLs can disappear, render differently, or block validator fetches.
- OpenFEC may be delayed or rate-limited; later reassessment can differ while preserving history.
- A compatible Schedule E record is evidence of a compatible public filing, not proof that the filing paid for the exact creative.
- The hosted Vercel E2E matrix remains pending and must be executed by the user against the exact release.

## References

- [GenLayer Networks](https://docs.genlayer.com/developers/networks)
- [GenLayer Equivalence Principle](https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle)
- [GenLayer frontend writes](https://docs.genlayer.com/developers/decentralized-applications/writing-data)
- [FEC advertising and disclaimers](https://www.fec.gov/help-candidates-and-committees/advertising-and-disclaimers/)
- [FEC independent expenditures](https://www.fec.gov/help-candidates-and-committees/making-independent-expenditures/)
- [OpenFEC API](https://api.open.fec.gov/developers/)
