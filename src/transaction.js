const SUCCESS = "FINISHED_WITH_RETURN";
const TERMINAL_FAILURES = new Set([
  "FINISHED_WITH_ERROR",
  "UNDETERMINED",
  "CANCELED",
  "VALIDATORS_TIMEOUT",
  "LEADER_TIMEOUT",
]);

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

export async function finalizedWrite({
  writeClient,
  readClient,
  address,
  functionName,
  args,
  readback,
  onPhase,
  storage = window.localStorage,
}) {
  onPhase?.("signing");
  const hash = await writeClient.writeContract({ address, functionName, args, value: 0n });
  storage.setItem("campaignTrace.pendingHash", hash);
  onPhase?.("submitted", { hash });

  let receipt;
  try {
    onPhase?.("consensus", { hash });
    receipt = await readClient.waitForTransactionReceipt({ hash, status: "FINALIZED", fullTransaction: false });
  } catch (error) {
    onPhase?.("reconcile-required", { hash, error });
    throw new Error(`Receipt wait failed. Reconcile ${hash} before retrying.`);
  }

  const outcome = classifyReceipt(receipt);
  if (outcome.kind !== "success") {
    onPhase?.("failed", { hash, receipt, outcome });
    throw new Error(`Transaction ${hash} did not finish successfully (${outcome.status || outcome.execution || "unknown"}).`);
  }

  onPhase?.("readback", { hash, receipt });
  const state = await readback(hash, receipt);
  if (!state) {
    onPhase?.("reconcile-required", { hash, receipt });
    throw new Error(`Transaction ${hash} finalized, but authoritative readback did not confirm the change.`);
  }
  storage.removeItem("campaignTrace.pendingHash");
  onPhase?.("confirmed", { hash, receipt, state });
  return { hash, receipt, state };
}
