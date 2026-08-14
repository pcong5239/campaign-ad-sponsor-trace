import test from "node:test";
import assert from "node:assert/strict";
import { collectProviders, connectSelectedProvider, shortenAddress } from "../src/wallet.js";

class FakeWindow extends EventTarget {
  constructor(ethereum, announcements = []) {
    super();
    this.ethereum = ethereum;
    this.announcements = announcements;
  }

  dispatchEvent(event) {
    if (event.type === "eip6963:requestProvider") {
      for (const detail of this.announcements) {
        const announcement = new Event("eip6963:announceProvider");
        Object.defineProperty(announcement, "detail", { value: detail });
        super.dispatchEvent(announcement);
      }
    }
    return super.dispatchEvent(event);
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

test("multi-wallet discovery keeps provider identity and rejects conflicting labels", async () => {
  const calls = [];
  const okxAnnouncement = { isOkxWallet: true, isOKExWallet: true, isMetaMask: true, request: async () => { calls.push("eip6963-okx"); return ["0x1111111111111111111111111111111111111111"]; } };
  const directRouter = { isOkxWallet: true, isOKExWallet: true, isMetaMask: true, request: async () => { calls.push("direct-router"); return []; } };
  const metamask = { isMetaMask: true, request: async () => { calls.push("metamask"); return ["0x2222222222222222222222222222222222222222"]; } };
  const win = new FakeWindow({ providers: [metamask, directRouter] }, [
    { info: { uuid: "okx", rdns: "com.okex.wallet", name: "OKX Wallet" }, provider: okxAnnouncement },
    { info: { uuid: "metamask", rdns: "io.metamask", name: "MetaMask" }, provider: metamask },
    { info: { uuid: "forged-okx", rdns: "com.okex.wallet", name: "OKX Wallet" }, provider: metamask },
  ]);
  win.okxwallet = directRouter;

  const result = collectProviders(win);
  assert.deepEqual([...result.providers.values()].map(({ name }) => name), ["OKX Wallet", "MetaMask"]);
  await connectSelectedProvider([...result.providers.values()][0]);
  assert.deepEqual(calls, ["eip6963-okx"]);
  result.stop();
});

test("OKX direct global router is ignored without an EIP-6963 announcement", () => {
  const router = { isOkxWallet: true, isMetaMask: true, request: async () => [] };
  const win = new FakeWindow(router);
  win.okxwallet = router;
  const result = collectProviders(win);
  assert.equal(result.providers.size, 0);
  result.stop();
});

test("OKX flags from a non-OKX EIP-6963 identity fail closed", () => {
  const router = { isOkxWallet: true, isMetaMask: true, request: async () => [] };
  const win = new FakeWindow(undefined, [
    { info: { uuid: "unknown", rdns: "example.wallet", name: "OKX Wallet" }, provider: router },
  ]);
  const result = collectProviders(win);
  assert.equal(result.providers.size, 0);
  result.stop();
});
