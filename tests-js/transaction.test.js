import test from "node:test";
import assert from "node:assert/strict";
import { classifyReceipt, finalizedWrite, parseContractJson, parseLosslessInteger } from "../src/transaction.js";

test("lossless integer parser rejects unsafe numbers", () => {
  assert.equal(parseLosslessInteger("9007199254740993"), 9007199254740993n);
  assert.throws(() => parseLosslessInteger(9007199254740992), /lossless/);
  assert.throws(() => parseLosslessInteger("01"), /lossless/);
});

test("contract JSON boundary rejects arrays and non-strings", () => {
  assert.deepEqual(parseContractJson('{"state":"FROZEN"}'), { state: "FROZEN" });
  assert.throws(() => parseContractJson("[]"), /object/);
  assert.throws(() => parseContractJson({}), /JSON string/);
});

test("receipt requires finalized leader execution success", () => {
  assert.deepEqual(classifyReceipt({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" }).kind, "success");
  assert.deepEqual(classifyReceipt({ statusName: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_RETURN" }).kind, "not-finalized");
  assert.deepEqual(classifyReceipt({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_ERROR" }).kind, "execution-error");
  assert.deepEqual(classifyReceipt({ statusName: "UNDETERMINED" }).kind, "terminal-failure");
});

test("failed receipt wait preserves hash and blocks blind retry", async () => {
  const kept = new Map();
  const storage = { setItem: (k, v) => kept.set(k, v), removeItem: (k) => kept.delete(k) };
  await assert.rejects(
    finalizedWrite({
      writeClient: { writeContract: async () => "0xabc" },
      readClient: { waitForTransactionReceipt: async () => { throw new Error("timeout"); } },
      address: "0x0000000000000000000000000000000000000001",
      functionName: "freeze_trace",
      args: [1n],
      readback: async () => true,
      storage,
    }),
    /Reconcile 0xabc/,
  );
  assert.equal(kept.get("campaignTrace.pendingHash"), "0xabc");
});

test("successful write still requires authoritative readback", async () => {
  const kept = new Map();
  const storage = { setItem: (k, v) => kept.set(k, v), removeItem: (k) => kept.delete(k) };
  await assert.rejects(
    finalizedWrite({
      writeClient: { writeContract: async () => "0xdef" },
      readClient: { waitForTransactionReceipt: async () => ({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" }) },
      address: "0x0000000000000000000000000000000000000001",
      functionName: "freeze_trace",
      args: [1n],
      readback: async () => null,
      storage,
    }),
    /readback/,
  );
  assert.equal(kept.get("campaignTrace.pendingHash"), "0xdef");
});

