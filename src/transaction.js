const SUCCESS = "FINISHED_WITH_RETURN";
const TERMINAL_FAILURES = new Set([
  "FINISHED_WITH_ERROR",
  "UNDETERMINED",
  "CANCELED",
  "VALIDATORS_TIMEOUT",
  "LEADER_TIMEOUT",
]);

export const PENDING_INTENT_KEY = "campaignTrace.pendingIntent";
const LEGACY_PENDING_HASH_KEY = "campaignTrace.pendingHash";

export function parseLosslessInteger(value, label = "integer") {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^(0|[1-9]\d*)$/.test(value)) return BigInt(value);
  throw new Error(`${label} is not a lossless non-negative integer.`);
}

export function parseContractJson(value, label = "contract response") {
  if (typeof value !== "string") throw new Error(`${label} must be a JSON string.`);
  const parsed = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error(`${label} must decode to an object.`);
  }
  return parsed;
}

export function classifyReceipt(receipt) {
  const execution = receipt?.txExecutionResultName ?? receipt?.executionResultName ?? "";
  const status = receipt?.statusName ?? receipt?.status ?? "";
  if (TERMINAL_FAILURES.has(status)) return { kind: "terminal-failure", status, execution };
  if (status && status !== "FINALIZED") return { kind: "not-finalized", status, execution };
  if (execution === SUCCESS) return { kind: "success", status: "FINALIZED", execution };
  if (execution === "FINISHED_WITH_ERROR") return { kind: "execution-error", status: "FINALIZED", execution };
  return { kind: "unknown", status, execution };
}

function encodeArgs(args) {
  return args.map((value) => typeof value === "bigint"
    ? { type: "bigint", value: value.toString() }
    : { type: typeof value, value });
}

export function loadPendingIntent(storage = window.localStorage) {
  const raw = storage.getItem(PENDING_INTENT_KEY);
  if (!raw) {
    const legacyHash = storage.getItem(LEGACY_PENDING_HASH_KEY);
    return legacyHash ? { version: 0, hash: legacyHash, legacy: true } : null;
  }
  let intent;
  try {
    intent = JSON.parse(raw);
  } catch {
    throw new Error("The pending-write record is invalid. Do not retry until it is recovered.");
  }
  const expected = intent?.expectedReadback;
  const validExpected = (
    intent?.functionName === "create_trace"
    && expected?.kind === "create"
    && expected.account?.toLowerCase() === intent?.account?.toLowerCase()
    && /^[0-9a-f]{64}$/.test(expected.digest)
  ) || (
    intent?.functionName === "freeze_trace"
    && expected?.kind === "freeze"
    && /^(0|[1-9]\d*)$/.test(expected.traceId)
  ) || (
    ["assess_trace", "reassess_trace"].includes(intent?.functionName)
    && expected?.kind === "assessment"
    && /^(0|[1-9]\d*)$/.test(expected.traceId)
    && Number.isSafeInteger(expected.minimumRevision)
    && expected.minimumRevision > 0
  );
  if (
    intent?.version !== 1
    || intent.network !== "studionet"
    || !/^0x[0-9a-fA-F]{40}$/.test(intent.address)
    || !/^0x[0-9a-fA-F]{40}$/.test(intent.account)
    || !/^0x[0-9a-fA-F]+$/.test(intent.hash)
    || !Array.isArray(intent.args)
    || !intent.args.every((arg) => arg && typeof arg.type === "string" && Object.hasOwn(arg, "value"))
    || !validExpected
  ) {
    throw new Error("The pending-write record is incomplete. Do not retry until it is recovered.");
  }
  return intent;
}

function clearPendingIntent(storage) {
  storage.removeItem(PENDING_INTENT_KEY);
  storage.removeItem(LEGACY_PENDING_HASH_KEY);
}

async function settlePending({ intent, receipt, readback, onPhase, storage }) {
  const { hash } = intent;
  const outcome = classifyReceipt(receipt);
  if (outcome.kind === "execution-error" || outcome.kind === "terminal-failure") {
    clearPendingIntent(storage);
    onPhase?.("failed", { hash, receipt, outcome });
    return { kind: "failed", hash, receipt, outcome };
  }
  if (outcome.kind !== "success") {
    onPhase?.("reconcile-required", { hash, receipt, outcome });
    throw new Error(`Transaction ${hash} is not conclusively finalized. Reconcile before retrying.`);
  }

  onPhase?.("readback", { hash, receipt });
  const state = await readback(intent, hash, receipt);
  if (!state) {
    onPhase?.("reconcile-required", { hash, receipt });
    throw new Error(`Transaction ${hash} finalized, but authoritative readback did not confirm the change.`);
  }
  clearPendingIntent(storage);
  onPhase?.("confirmed", { hash, receipt, state });
  return { kind: "confirmed", hash, receipt, state };
}

export async function reconcilePendingWrite({ readClient, readback, onPhase, storage = window.localStorage }) {
  const intent = loadPendingIntent(storage);
  if (!intent) return null;
  if (intent.legacy) throw new Error(`Legacy pending hash ${intent.hash} requires manual reconciliation; retry remains blocked.`);

  let receipt;
  try {
    onPhase?.("consensus", { hash: intent.hash });
    receipt = await readClient.waitForTransactionReceipt({ hash: intent.hash, status: "FINALIZED", fullTransaction: false });
  } catch (error) {
    onPhase?.("reconcile-required", { hash: intent.hash, error });
    throw new Error(`Receipt for ${intent.hash} remains unresolved. Retry is still blocked.`);
  }
  return settlePending({ intent, receipt, readback, onPhase, storage });
}

export async function finalizedWrite({
  writeClient,
  readClient,
  address,
  account,
  functionName,
  args,
  expectedReadback,
  readback,
  onPhase,
  storage = window.localStorage,
}) {
  const pending = loadPendingIntent(storage);
  if (pending) {
    onPhase?.("reconcile-required", { hash: pending.hash });
    throw new Error(`Pending transaction ${pending.hash} must be reconciled before another write.`);
  }

  onPhase?.("signing");
  const hash = await writeClient.writeContract({ address, functionName, args, value: 0n });
  const intent = {
    version: 1,
    network: "studionet",
    address,
    account,
    functionName,
    args: encodeArgs(args),
    hash,
    expectedReadback,
  };
  storage.setItem(PENDING_INTENT_KEY, JSON.stringify(intent));
  onPhase?.("submitted", { hash });

  let receipt;
  try {
    onPhase?.("consensus", { hash });
    receipt = await readClient.waitForTransactionReceipt({ hash, status: "FINALIZED", fullTransaction: false });
  } catch (error) {
    onPhase?.("reconcile-required", { hash, error });
    throw new Error(`Receipt wait failed. Reconcile ${hash} before retrying.`);
  }

  const result = await settlePending({
    intent,
    receipt,
    readback: (_intent, settledHash, settledReceipt) => readback(settledHash, settledReceipt),
    onPhase,
    storage,
  });
  if (result.kind === "failed") {
    throw new Error(`Transaction ${hash} failed conclusively (${result.outcome.status || result.outcome.execution}). It is safe to retry.`);
  }
  return result;
}
