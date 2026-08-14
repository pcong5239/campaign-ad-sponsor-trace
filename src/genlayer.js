import { abi, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { finalizedWrite, parseContractJson, parseLosslessInteger, reconcilePendingWrite, recoverPendingHash } from "./transaction.js";

export const CONTRACT_ADDRESS = import.meta.env?.VITE_CONTRACT_ADDRESS?.trim() || "";
export const readClient = createClient({ chain: studionet });

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

async function readbackExpected(expected, hash) {
  if (expected.kind === "create") {
    const execution = await readClient.debugTraceTransaction({ hash });
    if (execution?.result_code !== 0) return null;
    const traceId = decodeTraceId(execution.return_data);
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

export async function writeAndReadback({ client, account, functionName, traceId, minimumRevision = 0, onPhase }) {
  const expectedReadback = functionName === "freeze_trace"
    ? { kind: "freeze", traceId: traceId.toString() }
    : { kind: "assessment", traceId: traceId.toString(), minimumRevision };
  return finalizedWrite({
    writeClient: client,
    readClient,
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
    readClient,
    address: CONTRACT_ADDRESS,
    account,
    functionName: "create_trace",
    args,
    expectedReadback,
    onPhase,
    readback: (hash) => readbackExpected(expectedReadback, hash),
  });
}

export function reconcileCampaignWrite(onPhase) {
  return reconcilePendingWrite({
    readClient,
    onPhase,
    readback: (intent, hash) => {
      if (intent.address.toLowerCase() !== CONTRACT_ADDRESS.toLowerCase()) return null;
      return readbackExpected(intent.expectedReadback, hash);
    },
  });
}

export function bindRecoveredTransactionHash(hash) {
  return recoverPendingHash(hash.trim());
}
