import test from "node:test";
import assert from "node:assert/strict";
import { collectProviders, connectSelectedProvider, shortenAddress } from "../src/wallet.js";

class FakeWindow extends EventTarget {
  constructor(ethereum) {
    super();
    this.ethereum = ethereum;
  }
}

test("provider discovery never requests accounts", () => {
  let requests = 0;
  const provider = { request: async () => { requests += 1; return []; } };
  const result = collectProviders(new FakeWindow(provider));
  assert.equal(result.providers.size, 1);
  assert.equal(requests, 0);
  result.stop();
});

test("accounts are requested only for explicit selected provider", async () => {
  let method = "";
  const provider = { request: async (request) => { method = request.method; return ["0x1111111111111111111111111111111111111111"]; } };
  const account = await connectSelectedProvider({ provider });
  assert.equal(method, "eth_requestAccounts");
  assert.equal(shortenAddress(account), "0x1111…1111");
});

