import { abi, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { classifyReceipt, finalizedWrite, parseContractJson, parseLosslessInteger, reconcilePendingWrite, recoverPendingHash } from "./transaction.js";

export const CONTRACT_ADDRESS = import.meta.env?.VITE_CONTRACT_ADDRESS?.trim() || "";
export const readClient = createClient({ chain: studionet });
const STUDIONET_RPC = studionet.rpcUrls.default.http[0];
const RECONCILE_TIMEOUT_MS = 6_000;
const FINALITY_TIMEOUT_MS = 120_000;
const READBACK_TIMEOUT_MS = 30_000;

export async function readStudionetTransaction(hash, fetchImpl = fetch, timeoutMs = RECONCILE_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(STUDIONET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getTransactionByHash", params: [hash] }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Studionet returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (payload?.error) throw new Error(payload.error.message || "Studionet rejected the transaction lookup.");
    if (!payload?.result || typeof payload.result !== "object") throw new Error("Studionet returned no transaction.");
    return payload.result;
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForStudionetFinality(hash, {
  fetchImpl = fetch,
  timeoutMs = FINALITY_TIMEOUT_MS,
  intervalMs = 2_500,
  now = Date.now,
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
} = {}) {
  const deadline = now() + timeoutMs;
  let lastError;
  while (true) {
    const remaining = deadline - now();
    if (remaining <= 0) throw new Error(`Timed out waiting for ${hash} to finalize.`, { cause: lastError });
    try {
      const receipt = await readStudionetTransaction(hash, fetchImpl, Math.min(RECONCILE_TIMEOUT_MS, remaining));
      if (["success", "execution-error", "terminal-failure"].includes(classifyReceipt(receipt).kind)) return receipt;
    } catch (error) {
      lastError = error;
    }
    await sleep(Math.min(intervalMs, Math.max(0, deadline - now())));
  }
}

const finalityClient = {
  getTransaction: ({ hash }) => readStudionetTransaction(hash),
  waitForTransactionReceipt: ({ hash }) => waitForStudionetFinality(hash),
};

async function boundedReadback(promise) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Authoritative readback timed out.")), READBACK_TIMEOUT_MS + RECONCILE_TIMEOUT_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export function hasLiveContract() {
  return /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);
}

export function createWriteClient(provider, account) {
  return createClient({ chain: studionet, account, provider });
}

export { studionet };

export async function readTrace(id) {
  const raw = await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_trace",
    args: [parseLosslessInteger(id, "Trace ID")],
  });
  return raw ? parseContractJson(raw, "trace") : null;
}

export async function readLatestAssessment(id) {
  const raw = await readClient.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_latest_assessment",
    args: [parseLosslessInteger(id, "Trace ID")],
  });
  return raw ? parseContractJson(raw, "assessment") : null;
}

function hexBytes(value) {
  if (typeof value !== "string" || !/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
    throw new Error("Leader return data is not valid hex.");
  }
  return Uint8Array.from(value.slice(2).match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16)) || []);
}

export function decodeTraceId(returnData) {
  const decoded = abi.calldata.decode(hexBytes(returnData));
  return parseLosslessInteger(decoded, "Returned trace ID");
}

export function decodeTraceIdFromReceipt(receipt) {
  const encoded = receipt?.consensus_data?.leader_receipt?.[0]?.result;
  if (typeof encoded !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error("Finalized receipt has no valid leader return data.");
  }
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes[0] !== 0 || bytes.length < 2) throw new Error("Leader return data does not contain a successful value.");
  return parseLosslessInteger(abi.calldata.decode(bytes.slice(1)), "Returned trace ID");
}

async function readbackExpectedOnce(expected, hash, receipt) {
  if (expected.kind === "create") {
    let traceId;
    try {
      traceId = decodeTraceIdFromReceipt(receipt);
    } catch {
      const execution = await readClient.debugTraceTransaction({ hash });
      if (execution?.result_code !== 0) return null;
      traceId = decodeTraceId(execution.return_data);
    }
    const trace = await readTrace(traceId);
    if (!trace) return null;
    if (trace.owner?.toLowerCase() !== expected.account.toLowerCase()) return null;
    if (trace.artifact_sha256 !== expected.digest) return null;
    return { traceId, trace, assessment: null };
  }

  const traceId = parseLosslessInteger(expected.traceId, "Pending trace ID");
  const trace = await readTrace(traceId);
  const assessment = await readLatestAssessment(traceId);
  if (expected.kind === "freeze" && trace?.state !== "FROZEN") return null;
  if (expected.kind !== "freeze" && expected.kind !== "assessment") return null;
  const revision = Number(assessment?.revision);
  if (expected.kind === "assessment" && (!Number.isSafeInteger(revision) || revision < expected.minimumRevision)) return null;
  return { trace, assessment };
}

export async function retryAuthoritativeReadback(read, {
  timeoutMs = READBACK_TIMEOUT_MS,
  intervalMs = 2_000,
  now = Date.now,
  sleep = (delay) => new Promise((resolve) => setTimeout(resolve, delay)),
} = {}) {
  const deadline = now() + timeoutMs;
  let lastError;
  while (true) {
    try {
      const state = await read();
      if (state) return state;
    } catch (error) {
      lastError = error;
    }
    if (now() >= deadline) {
      if (lastError) throw lastError;
      return null;
    }
    await sleep(Math.min(intervalMs, Math.max(0, deadline - now())));
  }
}

function readbackExpected(expected, hash, receipt) {
  return retryAuthoritativeReadback(() => readbackExpectedOnce(expected, hash, receipt));
}

export async function writeAndReadback({ client, account, functionName, traceId, minimumRevision = 0, onPhase }) {
  const expectedReadback = functionName === "freeze_trace"
    ? { kind: "freeze", traceId: traceId.toString() }
    : { kind: "assessment", traceId: traceId.toString(), minimumRevision };
  return finalizedWrite({
    writeClient: client,
    readClient: finalityClient,
    address: CONTRACT_ADDRESS,
    account,
    functionName,
    args: [traceId],
    expectedReadback,
    onPhase,
    readback: (hash) => readbackExpected(expectedReadback, hash),
  });
}

export async function createTraceAndReadback({ client, args, account, expectedDigest, onPhase }) {
  const expectedReadback = { kind: "create", account, digest: expectedDigest };
  return finalizedWrite({
    writeClient: client,
    readClient: finalityClient,
    address: CONTRACT_ADDRESS,
    account,
    functionName: "create_trace",
    args,
    expectedReadback,
    onPhase,
    readback: (hash, receipt) => readbackExpected(expectedReadback, hash, receipt),
  });
}

export function reconcileCampaignWrite(onPhase) {
  return reconcilePendingWrite({
    readClient: finalityClient,
    onPhase,
    readback: (intent, hash, receipt) => {
      if (intent.address.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) return null;
      return boundedReadback(readbackExpected(intent.expectedReadback, hash, receipt));
    },
  });
}

export function bindRecoveredTransactionHash(hash) {
  return recoverPendingHash(hash.trim());
}
