import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createWriteClient, decodeTraceIdFromReceipt, readStudionetTransaction, retryAuthoritativeReadback, waitForStudionetFinality } from "../src/genlayer.js";

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

test("normal writes keep polling automatically until Studionet finalizes", async () => {
  const receipts = [
    { status: "ACCEPTED" },
    { status: "FINALIZED", consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] } },
  ];
  let calls = 0;
  const result = await waitForStudionetFinality("0x" + "c".repeat(64), {
    fetchImpl: async () => ({ ok: true, json: async () => ({ result: receipts[calls++] }) }),
    timeoutMs: 100,
    intervalMs: 0,
    sleep: async () => {},
  });
  assert.equal(calls, 2);
  assert.equal(result.status, "FINALIZED");
});

test("normal writes retry transient RPC failures until finality deadline", async () => {
  let calls = 0;
  const result = await waitForStudionetFinality("0x" + "d".repeat(64), {
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new Error("temporary RPC failure");
      return { ok: true, json: async () => ({ result: { status: "FINALIZED", consensus_data: { leader_receipt: [{ execution_result: "SUCCESS" }] } } }) };
    },
    timeoutMs: 100,
    intervalMs: 0,
    sleep: async () => {},
  });
  assert.equal(calls, 2);
  assert.equal(result.status, "FINALIZED");
});

test("authoritative readback retries eventual consistency before manual recovery", async () => {
  let reads = 0;
  const state = await retryAuthoritativeReadback(async () => (++reads === 1 ? null : { revision: 3 }), {
    timeoutMs: 100,
    intervalMs: 0,
    sleep: async () => {},
  });
  assert.equal(reads, 2);
  assert.deepEqual(state, { revision: 3 });
});

test("authoritative readback deadline bounds a never-settling RPC", async () => {
  const started = Date.now();
  await assert.rejects(
    retryAuthoritativeReadback(() => new Promise(() => {}), { timeoutMs: 5, intervalMs: 0 }),
    /timed out/,
  );
  assert.ok(Date.now() - started < 100);
});

test("reconciliation retains its button reference across awaits", () => {
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf('byId("reconcile-transaction")'), source.indexOf('window.addEventListener("beforeunload")'));
  assert.match(handler, /const reconcileButton = event\.currentTarget;/);
  assert.doesNotMatch(handler, /finally\s*\{[^}]*event\.currentTarget/s);
});

test("trace writes refresh pending reconciliation controls after timeout", () => {
  const source = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("async function runTraceWrite"), source.indexOf('byId("freeze-trace")'));
  assert.match(handler, /finally\s*\{\s*renderWriteLocks\(\);\s*\}/s);
});
