# Deployment and recovery manifest

## PRE_DEPLOY classification

- Contract: `CampaignAdSponsorTrace`
- Classification: `UPGRADABLE`
- Intended network: Studionet
- Chain ID: `61999`
- RPC: `https://studio.genlayer.com/api`
- Explorer base: `https://explorer-studio.genlayer.com`
- Constructor arguments: none
- Linked contracts: none
- Initial upgrader rule: the deployment sender is appended to `gl.storage.Root.get().upgraders`
- Selected active Studio deployer/upgrader: `0x2e53bb6ED175A7F827590D9D3a353FC51Eb8996a`
- Source commit containing the exact contract: `a9317075b465cf1f4bb40db829fcd04bbce3d747`
- Source SHA-256: `121edd14667527f1b062448883f0cc6a4aadf312658bf5fdcaecfa6c7e3be611`
- Contract address: `0xb19F0F29bb3B15a80Cda21C69C060a207Ed2626e`
- Deployment transaction: `0xd86fc8402a6c7828885dab581262e4be55b8b04e16823697d2cd3c84dff5de35`
- Explorer: `https://explorer-studio.genlayer.com/address/0xb19F0F29bb3B15a80Cda21C69C060a207Ed2626e`
- Deployment result: `FINALIZED`, `MAJORITY_AGREE`, full consensus, successful leader execution
- Deployment timestamp: `2026-08-13T04:41:41.081045Z`
- Deployed-code readback: Base64-decoded bytes are byte-for-byte equal to the approved source; SHA-256 `121edd14667527f1b062448883f0cc6a4aadf312658bf5fdcaecfa6c7e3be611`
- Upgrader readback: `0x2e53bb6ed175a7f827590d9d3a353fc51eb8996a`

The release deployment is accepted for post-deployment testing. It is not final project approval until the later anonymous checkpoints and release gates pass.

## Upgrade and storage policy

The public `upgrade(new_code: bytes)` method replaces the Root Slot code. GenVM enforces authorization through the locked Root Slot: only an address in `upgraders` can modify code. The initial list contains only the deployment sender.

The persistent layout is fixed in this order:

1. `traces: TreeMap[u256, str]`
2. `owners: TreeMap[u256, Address]`
3. `assessments: TreeMap[str, str]`
4. `revisions: TreeMap[u256, u32]`
5. `next_trace_id: u256`
6. `upgrader: Address`

An upgrade must not reorder, remove, or change any of those field types. Any new persistent field or migration requires a new reviewed plan and a new exact-revision gate.

## Recovery limits

- If Studio local UI data is reset but chain state and the recorded account remain available, reconnect the recorded account, import the contract address, load the exact source commit, verify the on-chain code, then perform any reviewed upgrade.
- If the recorded Studio account becomes unavailable, the existing contract may remain readable but its upgrade authority is not recoverable. Deploy a replacement from the recorded source and constructor manifest, rerun all live tests, then update the frontend and documentation.
- If Studionet chain state is reset, the old address and state cannot be recovered. Redeploy from the recorded commit, rerun every write/readback path, and replace the frontend address only after live verification.

Do not claim that an address, state, or upgrade authority survives an account or network reset without current live evidence.

## Required POST_DEPLOY evidence

- Deployment receipt is `FINALIZED` with successful leader execution.
- Receipt `from_address` and `origin_address` match the recorded Studio account.
- Actual contract address, transaction hash, Explorer link, source commit/hash, and zero constructor arguments are recorded here.
- Runtime code readback matches the exact committed source.
- A separate test deployment proves: recorded account can upgrade, storage survives, and a different account is rejected.
- Every advertised write path is exercised on the release deployment with transaction and authoritative readback evidence.

The release deployment, live write/readback matrix, bounded negative result, and completed disposable authorized/unauthorized upgrade rehearsal are recorded in `docs/VERIFICATION.md`. The release instance was not upgraded.
