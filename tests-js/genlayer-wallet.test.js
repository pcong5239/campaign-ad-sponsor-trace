import test from "node:test";
import assert from "node:assert/strict";
import { createWriteClient, decodeTraceIdFromReceipt } from "../src/genlayer.js";

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
