import test from "node:test";
import assert from "node:assert/strict";
import { createWriteClient, decodeTraceIdFromReceipt, readStudionetTransaction } from "../src/genlayer.js";

const ACCOUNT = "0x1111111111111111111111111111111111111111";

test("write client stays bound to the explicitly selected provider", async () => {
  const selectedCalls = [];
  const globalCalls = [];
  const selected = { request: async ({ method }) => { selectedCalls.push(method); return [ACCOUNT]; } };
  globalThis.window = { ethereum: { request: async ({ method }) => { globalCalls.push(method); return []; } } };
  try {
    const client = createWriteClient(selected, ACCOUNT);
    assert.deepEqual(await client.request({ method: "eth_accounts" }), [ACCOUNT]);
    assert.deepEqual(selectedCalls, ["eth_accounts"]);
    assert.deepEqual(globalCalls, []);
  } finally {
    delete globalThis.window;
  }
});

test("live finalized leader receipt decodes the transaction-specific trace ID", () => {
  const receipt = {
    statusName: "FINALIZED",
    consensus_data: { leader_receipt: [{ execution_result: "SUCCESS", result: "ABE=" }] },
  };
  assert.equal(decodeTraceIdFromReceipt(receipt), 2n);
  assert.throws(() => decodeTraceIdFromReceipt({}), /leader return data/);
});

test("manual reconciliation uses one bounded raw Studionet transaction lookup", async () => {
  let calls = 0;
  const receipt = { status: "FINALIZED", consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] } };
  const result = await readStudionetTransaction("0x" + "a".repeat(64), async (url, options) => {
    calls += 1;
    assert.equal(url, "https://studio.genlayer.com/api");
    assert.equal(JSON.parse(options.body).method, "eth_getTransactionByHash");
    assert.ok(options.signal);
    return { ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: receipt }) };
  }, 50);
  assert.equal(calls, 1);
  assert.equal(result, receipt);
});

test("manual reconciliation transaction lookup cannot hang indefinitely", async () => {
  await assert.rejects(
    readStudionetTransaction("0x" + "b".repeat(64), (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }), 5),
    /aborted/,
  );
});
