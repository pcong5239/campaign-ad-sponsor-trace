import { abi, createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { finalizedWrite, parseContractJson, parseLosslessInteger } from "./transaction.js";

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS?.trim() || "";
export const readClient = createClient({ chain: studionet });

export function hasLiveContract() {
  return /^0x[0-9a-fA-F]{40}$/.test(CONTRACT_ADDRESS);
}

export function createWriteClient(provider, account) {
  return createClient({ chain: studionet, account, provider });
}

export async function connectStudionet(client) {
  await client.connect("studionet");
}

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

export async function writeAndReadback({ client, functionName, args, traceId, verify, onPhase }) {
  return finalizedWrite({
    writeClient: client,
    readClient,
    address: CONTRACT_ADDRESS,
    functionName,
    args,
    onPhase,
    readback: async () => {
      const trace = await readTrace(traceId);
      const assessment = await readLatestAssessment(traceId);
      return verify({ trace, assessment }) ? { trace, assessment } : null;
    },
  });
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

export async function createTraceAndReadback({ client, args, account, expectedDigest, onPhase }) {
  return finalizedWrite({
    writeClient: client,
    readClient,
    address: CONTRACT_ADDRESS,
    functionName: "create_trace",
    args,
    onPhase,
    readback: async (hash) => {
      const execution = await readClient.debugTraceTransaction({ hash });
      if (execution?.result_code !== 0) return null;
      const traceId = decodeTraceId(execution.return_data);
      const trace = await readTrace(traceId);
      if (!trace) return null;
      if (trace.owner?.toLowerCase() !== account.toLowerCase()) return null;
      if (trace.artifact_sha256 !== expectedDigest) return null;
      return { traceId, trace };
    },
  });
}
