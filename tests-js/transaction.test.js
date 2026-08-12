import test from "node:test";
import assert from "node:assert/strict";
import {
  PENDING_INTENT_KEY,
  classifyReceipt,
  finalizedWrite,
  loadPendingIntent,
  parseContractJson,
  parseLosslessInteger,
  reconcilePendingWrite,
  recoverPendingHash,
} from "../src/transaction.js";

function memoryStorage(seed = {}) {
  const kept = new Map(Object.entries(seed));
  return {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => kept.set(key, value),
    removeItem: (key) => kept.delete(key),
  };
}

const finalized = { statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_RETURN" };
const baseWrite = (storage, overrides = {}) => ({
  writeClient: { writeContract: async () => "0xdef" },
  readClient: { waitForTransactionReceipt: async () => finalized },
  address: "0x0000000000000000000000000000000000000001",
  account: "0x0000000000000000000000000000000000000002",
  functionName: "freeze_trace",
  args: [1n],
  expectedReadback: { kind: "freeze", traceId: "1" },
  readback: async () => ({ trace: { state: "FROZEN" } }),
  storage,
  ...overrides,
});

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
  assert.equal(classifyReceipt(finalized).kind, "success");
  assert.equal(classifyReceipt({ statusName: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_RETURN" }).kind, "not-finalized");
  assert.equal(classifyReceipt({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_ERROR" }).kind, "execution-error");
  assert.equal(classifyReceipt({ statusName: "UNDETERMINED" }).kind, "terminal-failure");
});

test("timeout then reload preserves full intent and blocks duplicate submission", async () => {
  const storage = memoryStorage();
  let writes = 0;
  const options = baseWrite(storage, {
    writeClient: { writeContract: async () => { writes += 1; return "0xabc"; } },
    readClient: { waitForTransactionReceipt: async () => { throw new Error("timeout"); } },
  });
  await assert.rejects(finalizedWrite(options), /Reconcile 0xabc/);
  const pending = loadPendingIntent(storage);
  assert.deepEqual(
    { network: pending.network, method: pending.functionName, hash: pending.hash, args: pending.args, expected: pending.expectedReadback },
    {
      network: "studionet",
      method: "freeze_trace",
      hash: "0xabc",
      args: [{ type: "bigint", value: "1" }],
      expected: { kind: "freeze", traceId: "1" },
    },
  );
  await assert.rejects(finalizedWrite(options), /must be reconciled/);
  assert.equal(writes, 1);
  pending.expectedReadback.kind = "forged";
  storage.setItem(PENDING_INTENT_KEY, JSON.stringify(pending));
  assert.throws(() => loadPendingIntent(storage), /incomplete/);
});

test("reconcile success requires matching readback then clears intent", async () => {
  const storage = memoryStorage();
  await assert.rejects(finalizedWrite(baseWrite(storage, {
    readClient: { waitForTransactionReceipt: async () => { throw new Error("reload"); } },
  })), /Reconcile/);
  const result = await reconcilePendingWrite({
    readClient: { waitForTransactionReceipt: async () => finalized },
    readback: async (intent) => intent.expectedReadback.traceId === "1" ? { trace: { state: "FROZEN" } } : null,
    storage,
  });
  assert.equal(result.kind, "confirmed");
  assert.equal(storage.getItem(PENDING_INTENT_KEY), null);
});

test("finalized execution error clears intent and makes retry safe", async () => {
  const storage = memoryStorage();
  await assert.rejects(finalizedWrite(baseWrite(storage, {
    readClient: { waitForTransactionReceipt: async () => ({ statusName: "FINALIZED", txExecutionResultName: "FINISHED_WITH_ERROR" }) },
  })), /safe to retry/);
  assert.equal(loadPendingIntent(storage), null);
  const retry = await finalizedWrite(baseWrite(storage));
  assert.equal(retry.kind, "confirmed");
});

test("unresolved reconciliation retains intent and keeps retry blocked", async () => {
  const storage = memoryStorage();
  await assert.rejects(finalizedWrite(baseWrite(storage, {
    readClient: { waitForTransactionReceipt: async () => { throw new Error("timeout"); } },
  })), /Reconcile/);
  await assert.rejects(reconcilePendingWrite({
    readClient: { waitForTransactionReceipt: async () => ({ statusName: "ACCEPTED", txExecutionResultName: "FINISHED_WITH_RETURN" }) },
    readback: async () => null,
    storage,
  }), /not conclusively finalized/);
  assert.ok(loadPendingIntent(storage));
  await assert.rejects(finalizedWrite(baseWrite(storage)), /must be reconciled/);
});

test("successful receipt without authoritative readback retains intent", async () => {
  const storage = memoryStorage();
  await assert.rejects(finalizedWrite(baseWrite(storage, { readback: async () => null })), /readback/);
  assert.ok(loadPendingIntent(storage));
});

test("initial persistence failure requests no wallet transaction", async () => {
  let writes = 0;
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error("quota"); },
    removeItem: () => {},
  };
  await assert.rejects(finalizedWrite(baseWrite(storage, {
    writeClient: { writeContract: async () => { writes += 1; return "0xaaa"; } },
  })), /No wallet transaction was requested/);
  assert.equal(writes, 0);
});

test("hash-binding failure leaves pre-submit reservation blocking after reload", async () => {
  const kept = new Map();
  let writes = 0;
  let sets = 0;
  const storage = {
    getItem: (key) => kept.get(key) ?? null,
    setItem: (key, value) => {
      sets += 1;
      if (sets > 1) throw new Error("storage unavailable");
      kept.set(key, value);
    },
    removeItem: (key) => kept.delete(key),
  };
  const options = baseWrite(storage, {
    writeClient: { writeContract: async () => { writes += 1; return "0xbeef"; } },
  });
  await assert.rejects(finalizedWrite(options), /durable hash binding failed/);
  const pending = loadPendingIntent(storage);
  assert.equal(pending.status, "SUBMITTING");
  assert.equal(pending.hash, null);
  await assert.rejects(finalizedWrite(options), /Submission attempt .* must be reconciled/);
  await assert.rejects(reconcilePendingWrite({
    readClient: options.readClient,
    readback: async () => null,
    storage,
  }), /outcome is unknown/);
  assert.equal(writes, 1);
});

test("hash-less reservation can bind a recovered hash then reconcile safely", async () => {
  const storage = memoryStorage();
  await assert.rejects(finalizedWrite(baseWrite(storage, {
    writeClient: { writeContract: async () => { throw new Error("provider disconnected"); } },
  })), /ambiguous error/);
  assert.throws(() => recoverPendingHash("not-a-hash", storage), /valid transaction hash/);
  const recovered = recoverPendingHash("0xfeed", storage);
  assert.equal(recovered.status, "SUBMITTED");
  assert.equal(recovered.hash, "0xfeed");
  const result = await reconcilePendingWrite({
    readClient: { waitForTransactionReceipt: async () => finalized },
    readback: async () => ({ trace: { state: "FROZEN" } }),
    storage,
  });
  assert.equal(result.kind, "confirmed");
  assert.equal(loadPendingIntent(storage), null);
});

test("explicit wallet rejection clears reservation and permits safe retry", async () => {
  const storage = memoryStorage();
  let writes = 0;
  await assert.rejects(finalizedWrite(baseWrite(storage, {
    writeClient: { writeContract: async () => {
      writes += 1;
      const rejection = new Error("user rejected");
      rejection.code = 4001;
      throw rejection;
    } },
  })), /safe to try again/);
  assert.equal(loadPendingIntent(storage), null);
  const result = await finalizedWrite(baseWrite(storage, {
    writeClient: { writeContract: async () => { writes += 1; return "0xcafe"; } },
  }));
  assert.equal(result.kind, "confirmed");
  assert.equal(writes, 2);
});

test("ambiguous wallet error retains reservation and blocks reload retry", async () => {
  const storage = memoryStorage();
  let writes = 0;
  const options = baseWrite(storage, {
    writeClient: { writeContract: async () => { writes += 1; throw new Error("provider disconnected"); } },
  });
  await assert.rejects(finalizedWrite(options), /ambiguous error/);
  const pending = loadPendingIntent(storage);
  assert.equal(pending.status, "SUBMITTING");
  await assert.rejects(finalizedWrite(options), /must be reconciled/);
  assert.equal(writes, 1);
});
