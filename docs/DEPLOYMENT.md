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
- Source commit: filled from the exact PRE_DEPLOY commit
- Source SHA-256: filled from the exact PRE_DEPLOY contract
- Contract address and deployment transaction: filled only after a FINALIZED/SUCCESS deployment

No deployment is authorized merely by this draft. Immediately before deployment, Codex must verify that the active Studio account is the address above, ask the user which Studio account to use, and receive explicit confirmation.

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
