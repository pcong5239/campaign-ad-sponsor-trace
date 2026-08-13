# Campaign Ad Sponsor Trace

Campaign Ad Sponsor Trace is a non-economic GenLayer PROJECT for binding an exact federal political-ad artifact and comparing its sponsor claim with official FEC committee and Schedule E records.

The contract produces an immutable, revisioned evidence signal. It does **not** decide legality, coordination, political truth, candidate quality, or whether a filing paid for the exact creative.

## Why GenLayer

A submitter, advertiser, or ordinary application server may have an incentive to select favorable evidence or change a mapping after publication. Here, the consequential result is owned by an Intelligent Contract: validators independently fetch the same bound artifact and FEC sources, verify their digests, rederive the decision fields, and agree before an assessment is stored.

Schema validation is defense in depth only. The custom validator compares an independently produced semantic projection containing the verdict, evidence identity, relationship bands, and matched FEC transaction.

## MVP scope

- Federal candidate independent expenditures only.
- Text or graphic artifacts at a public HTTPS URL.
- Exact disclaimer text supplied and frozen by the registrant.
- Official OpenFEC committee and Schedule E evidence.
- Platform-library or public-archive provenance for a top-level compatible result.
- Permissionless assessment and reassessment after the filing cutoff.

Out of scope: candidate-funded ads, audio/video extraction, state elections, legal compliance, coordination findings, truth scoring, payments, rewards, staking, and enforcement.

## Verdicts

- `COMPATIBLE_FEC_TRACE_FOUND`
- `CLAIMED_COMMITTEE_MISMATCH`
- `DISCLAIMER_PAYOR_MISMATCH`
- `NO_COMPATIBLE_FILING_AS_OF_CUTOFF`
- `NOT_COMPARABLE`
- `UNRESOLVED`

`NO_COMPATIBLE_FILING_AS_OF_CUTOFF` is time-bound and reassessable. Infrastructure failures, malformed source data, validator disagreement, and unavailable artifacts fail safely without becoming a substantive finding.

## Architecture

```text
Public artifact URL ─┐
                     ├─ leader fetch + normalize ─┐
OpenFEC sources ─────┘                            │
                                                  ├─ exact consequential projection ─ on-chain revision
Public artifact URL ─┐                            │
                     ├─ validator refetch + derive┘
OpenFEC sources ─────┘

Browser ─ genlayer-js ─ Studionet ─ CampaignAdSponsorTrace
```

The frontend is a static Vite application. It has no authoritative backend. Public reads require no wallet. Writes present an explicit provider chooser and request connection only after the user selects a provider.

Every write waits for `FINALIZED`, checks successful leader execution, and performs authoritative contract readback. A timeout or receipt-decoding failure retains the original transaction hash and requires reconciliation before retry.

## Contract workflow

```text
DRAFT → FROZEN → assessment revision 1 → revision 2 → …
```

- `create_trace(...)` binds artifact URL/digest, disclaimer, candidate, cycle, committee, relation, observation time, and cutoff.
- `freeze_trace(trace_id)` is owner-only and makes the submitted boundary immutable.
- `assess_trace(trace_id)` is permissionless after cutoff and creates revision 1.
- `reassess_trace(trace_id)` is permissionless and appends a new revision.
- Read methods expose the frozen trace, latest or exact assessment revision, revision count, and next trace ID.

## Evidence model

OpenFEC is queried with the public, rate-limited `DEMO_KEY`; no private key is embedded. Rate limits or source failures yield `UNRESOLVED` or an undetermined transaction rather than a negative finding.

Schedule E contains expenditure records, candidate relations, dates, committee IDs, payees, and filing references. A compatible record is evidence of a compatible public filing—not a one-to-one identity claim for the submitted creative. If the bounded OpenFEC result set is paginated beyond the fetched page, the contract returns `UNRESOLVED` instead of making an absence claim from incomplete evidence.

The contract derives artifact provenance from the hostname. A registrant cannot self-label an arbitrary host as an official library. User-controlled URLs remain inspectable but cannot receive `COMPATIBLE_FEC_TRACE_FOUND`.

## Network

- Network: Studionet
- RPC: `https://studio.genlayer.com/api`
- Chain ID: `61999`
- Explorer: `https://explorer-studio.genlayer.com`
- Release contract: `0xb19F0F29bb3B15a80Cda21C69C060a207Ed2626e`
- Deployment transaction: `0xd86fc8402a6c7828885dab581262e4be55b8b04e16823697d2cd3c84dff5de35`

The production configuration contains the verified release address above. Full live evidence is recorded in `docs/POST_DEPLOY_EVIDENCE.md`.

## Local verification

Prerequisites already expected by the project:

- Node.js 22+
- `genlayer-js` 1.1.8
- Vite 7.3.6
- Python 3.12+
- `genvm-lint`
- `genlayer-test` 0.29.2 for Direct Mode

```powershell
python -m unittest discover -s tests -v
python -m pytest tests\direct -v
npm test
npm run build
genvm-lint check contracts\campaign_ad_sponsor_trace.py --json
```

The current machine passes the Python policy suite, frontend suite, production build, Python compilation, GenVM AST lint, and pinned-SDK semantic validation. Validation is run against the already-cached GenVM `v0.3.0-rc7` bundle because a separate newer cache entry does not contain the pinned runner archive.

Copy `.env.example` to `.env`; the checked example already contains the verified release address:

```text
VITE_CONTRACT_ADDRESS=0xb19F0F29bb3B15a80Cda21C69C060a207Ed2626e
```

## Safety and limitations

- Political content is delimited as untrusted evidence in model prompts.
- The ad is not embedded or autoplayed; the UI opens the original source only on explicit action.
- FEC or platform updates can make a later revision differ from an earlier one; history is append-only.
- Platform ad-library URLs can disappear, render differently, or block validator fetches.
- OpenFEC responses may be delayed or rate-limited.
- FEC guidance itself states that it does not replace statutes, regulations, advisory opinions, or court decisions.
- The contract is `UPGRADABLE`. The Studio deployment account is the sole initial upgrader; losing that account, or a Studio/Studionet reset, can remove the practical recovery path. Storage field order and types must remain unchanged across upgrades.

## Official references

- [GenLayer Networks](https://docs.genlayer.com/developers/networks)
- [GenLayer Equivalence Principle](https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle)
- [GenLayer frontend writes](https://docs.genlayer.com/developers/decentralized-applications/writing-data)
- [FEC advertising and disclaimers](https://www.fec.gov/help-candidates-and-committees/advertising-and-disclaimers/)
- [FEC independent expenditures](https://www.fec.gov/help-candidates-and-committees/making-independent-expenditures/)
- [OpenFEC API](https://api.open.fec.gov/developers/)
