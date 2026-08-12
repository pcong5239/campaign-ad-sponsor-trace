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
  let raw;
  try {
    raw = storage.getItem(PENDING_INTENT_KEY);
  } catch {
    throw new Error("Pending-write storage is unavailable. Do not submit or retry a transaction.");
  }
  if (!raw) {
    let legacyHash;
    try {
      legacyHash = storage.getItem(LEGACY_PENDING_HASH_KEY);
    } catch {
      throw new Error("Pending-write storage is unavailable. Do not submit or retry a transaction.");
    }
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
    || !["SUBMITTING", "SUBMITTED"].includes(intent.status)
    || typeof intent.attemptId !== "string"
    || intent.attemptId.length < 8
    || !/^0x[0-9a-fA-F]{40}$/.test(intent.address)
    || !/^0x[0-9a-fA-F]{40}$/.test(intent.account)
    || (intent.status === "SUBMITTED" && !/^0x[0-9a-fA-F]+$/.test(intent.hash))
    || (intent.status === "SUBMITTING" && intent.hash !== null)
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
  if (storage.getItem(PENDING_INTENT_KEY) || storage.getItem(LEGACY_PENDING_HASH_KEY)) {
    throw new Error("The pending-write record could not be cleared. Retry remains blocked.");
  }
}

function persistIntent(storage, intent) {
  storage.setItem(PENDING_INTENT_KEY, JSON.stringify(intent));
  const persisted = loadPendingIntent(storage);
  if (persisted?.attemptId !== intent.attemptId || persisted.status !== intent.status || persisted.hash !== intent.hash) {
    throw new Error("The pending-write record could not be verified.");
  }
  return persisted;
}

function isWalletRejection(error) {
  return [error, error?.cause, error?.data].some((item) => item?.code === 4001 || item?.code === "ACTION_REJECTED");
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
  if (intent.status === "SUBMITTING") {
    throw new Error(`Submission attempt ${intent.attemptId} has no durable transaction hash. Its outcome is unknown and retry remains blocked.`);
  }

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

export function recoverPendingHash(hash, storage = window.localStorage) {
  if (!/^0x[0-9a-fA-F]+$/.test(hash)) throw new Error("Enter a valid transaction hash from the selected wallet or Studionet Explorer.");
  const intent = loadPendingIntent(storage);
  if (!intent || intent.legacy || intent.status !== "SUBMITTING") {
    throw new Error("No hash-less submission attempt is available for recovery.");
  }
  return persistIntent(storage, { ...intent, status: "SUBMITTED", hash });
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
    throw new Error(`${pending.hash ? `Pending transaction ${pending.hash}` : `Submission attempt ${pending.attemptId}`} must be reconciled before another write.`);
  }

  const prepared = {
    version: 1,
    status: "SUBMITTING",
    attemptId: globalThis.crypto.randomUUID(),
    network: "studionet",
    address,
    account,
    functionName,
    args: encodeArgs(args),
    hash: null,
    expectedReadback,
  };
  try {
    persistIntent(storage, prepared);
  } catch (error) {
    onPhase?.("storage-unavailable", { error });
    throw new Error("Pending intent could not be durably reserved. No wallet transaction was requested.");
  }

  onPhase?.("signing");
  let hash;
  try {
    hash = await writeClient.writeContract({ address, functionName, args, value: 0n });
  } catch (error) {
    if (isWalletRejection(error)) {
      try {
        clearPendingIntent(storage);
      } catch (clearError) {
        onPhase?.("reconcile-required", { error: clearError });
        throw new Error("The wallet rejected the request, but its reservation could not be cleared. Retry remains blocked.");
      }
      onPhase?.("cancelled");
      throw new Error("The wallet request was rejected before submission. It is safe to try again.");
    }
    onPhase?.("reconcile-required", { error });
    throw new Error(`Submission attempt ${prepared.attemptId} returned an ambiguous error. Retry remains blocked.`);
  }

  const intent = { ...prepared, status: "SUBMITTED", hash };
  try {
    persistIntent(storage, intent);
  } catch (error) {
    onPhase?.("reconcile-required", { hash, error });
    throw new Error(`Transaction ${hash} may have been submitted, but durable hash binding failed. Retry remains blocked.`);
  }
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
