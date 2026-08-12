# Campaign Ad Sponsor Trace — specification v0.1

Status: approved implementation baseline  
Category: `PROJECT`  
Network: Studionet only  
Economic model: non-economic

## Problem and GenLayer role

A journalist, researcher, or citizen cannot assume that an advertiser, submitter, or ordinary server will preserve an exact political-ad artifact, use a neutral evidence window, or report an unfavorable sponsor mismatch. A submitter can manipulate the URL, bytes, disclaimer, claimed committee, candidate relation, or cutoff; a conventional server can select records or rewrite its answer.

GenLayer is the authority for one bounded consequence: an immutable assessment revision attached to a frozen trace. Validators independently fetch the same artifact and official FEC evidence, derive the same consequential fields, and agree before the revision is stored. The product does not decide legality, coordination, political truth, or whether a filing paid for the exact creative.

## MVP scope

- Federal candidate independent expenditures only.
- Text or graphic artifact available at a public HTTPS URL.
- Exact lowercase SHA-256 supplied for artifact binding.
- Exact disclaimer, federal FEC candidate ID, cycle, claimed committee ID, support/oppose relation, observation time, and filing cutoff.
- Official OpenFEC committee and Schedule E evidence.
- Platform-library or public-archive hostname provenance required for a positive compatibility result.
- Public reads; owner-only freeze; permissionless assessment/reassessment after cutoff.

Out of scope: candidate-funded ads, audio/video extraction, state elections, legal compliance, coordination findings, truth scoring, identity proof, payments, rewards, staking, enforcement, and automated content amplification.

## Actors and authority

| Actor | Address source | Allowed consequential action | Contract enforcement |
|---|---|---|---|
| Trace registrant | selected wallet sender | create and freeze own draft | owner recorded at create; sender equality on freeze |
| Public assessor | any selected wallet sender | assess/reassess after cutoff | permissionless trigger; contract re-fetches and decides |
| Public reader | no wallet required | read trace and revision history | view methods only |
| Studio deployer/upgrader | verified deployment sender | replace reviewed contract code | GenVM Root Slot upgrader list |

No actor can submit a verdict, score, evidence provenance label, authenticated FEC result, or matched transaction as calldata.

## State machine

```text
create_trace → DRAFT → freeze_trace → FROZEN
                                   ├─ assess_trace → revision 1
                                   └─ reassess_trace → revision 2…n
```

- A draft can be frozen once by its owner.
- Bound trace inputs do not change after freeze.
- The first assessment uses `assess_trace`; later runs use `reassess_trace`.
- Each assessment is terminal and immutable for its revision; later evidence creates a new revision.
- There is no delete, owner override, verdict override, payout, or settlement path.

## Evidence and verdict policy

Artifact provenance is derived from the parsed HTTPS hostname. The fetched bytes must match the frozen SHA-256 and stay within 2 MB. FEC calls are constrained by committee, candidate, cycle, support/oppose evaluation, and the frozen observation/cutoff window. Stable fields are normalized and sorted before digesting.

Allowed verdicts:

- `COMPATIBLE_FEC_TRACE_FOUND`
- `CLAIMED_COMMITTEE_MISMATCH`
- `DISCLAIMER_PAYOR_MISMATCH`
- `NO_COMPATIBLE_FILING_AS_OF_CUTOFF`
- `NOT_COMPARABLE`
- `UNRESOLVED`

Only the compatible verdict avoids manual review. Missing/unavailable/invalid evidence, unknown enums, unmatched model transaction IDs, or inconsistent verdict/relation combinations fail to `UNRESOLVED` or `NOT_COMPARABLE`; they never become a positive result. The custom validator independently reruns retrieval and evaluation and compares the exact semantic projection that controls the stored outcome.

## Contract surface

Writes:

- `create_trace(...) -> u256`
- `freeze_trace(trace_id)`
- `assess_trace(trace_id)`
- `reassess_trace(trace_id)`
- `upgrade(new_code)` — Root Slot authorization; operational only, not advertised in the public workflow

Views:

- `get_trace(trace_id)`
- `get_assessment(trace_id, revision)`
- `get_latest_assessment(trace_id)`
- `get_revision_count(trace_id)`
- `get_next_trace_id()`
- `get_upgrader()`

## Frontend journey

1. Read the scope and legal limitation before entering evidence.
2. Look up any trace without a wallet.
3. For a write, select `Choose wallet`; the provider chooser is shown even if only one provider exists.
4. Account access is requested only after explicit provider selection.
5. Validate and submit exact trace inputs, then retain the transaction hash.
6. Wait for `FINALIZED`, require successful leader execution, and perform authoritative contract readback.
7. Bind a newly returned trace ID to the exact create transaction by decoding that transaction; never infer from the global counter.
8. On timeout, error, or undecodable receipt, retain the hash and require reconciliation before retry.

## Verification and acceptance criteria

- Contract compiles; current GenVM AST lint and pinned-SDK semantic validation pass.
- Policy tests cover URL provenance, scheme confusion, FEC identifiers, manual-review policy, canonical JSON, semantic consensus projection, and Root Slot upgrade source policy.
- Frontend tests cover lossless integers, untrusted JSON, receipt finality/execution, retained hashes, authoritative readback, and provider-choice privacy.
- Production build passes with no new installed dependency.
- At 320px and desktop: no horizontal overflow, undersized effective target, unlabeled control, multiline action label, or placeholder address.
- Studionet deployment is `FINALIZED`/`SUCCESS`; deployed source/hash/readback match the reviewed commit.
- Live proof covers create, freeze, compatible or safely unresolved assessment, reassessment, failure/reconciliation, public history read, authorized upgrade rehearsal on a separate deployment, and unauthorized-upgrader rejection.
- Frontend receives only the real verified Studionet contract address after post-deploy acceptance.

## Studionet plan

1. Obtain exact-revision anonymous `PRE_DEPLOY` approval.
2. Reconfirm the selected Studio account and obtain user authorization immediately before deployment.
3. Deploy the exact committed source with zero constructor arguments.
4. Verify receipt identity, `FINALIZED`, successful execution, Explorer address, source hash, code readback, and initial upgrader.
5. Use a separate test deployment for the upgrade authorization/storage-preservation rehearsal.
6. Exercise all advertised release-deployment writes and capture authoritative readbacks.
7. Request anonymous `POST_DEPLOY_TEST` review before GitHub/Vercel release work.

## Known limitations

- OpenFEC `DEMO_KEY` is public and rate-limited; failures safely reduce availability.
- Platform/archive URLs may disappear, change rendering, or reject validator fetches.
- A compatible Schedule E record does not identify the exact creative or establish legal compliance.
- Reassessment reflects later source state and therefore can differ while preserving history.
- The sole initial upgrader is the Studio deployment account; losing it or losing Studionet state may require replacement deployment.
