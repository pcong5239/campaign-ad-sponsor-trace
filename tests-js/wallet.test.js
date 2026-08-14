import test from "node:test";
import assert from "node:assert/strict";
import {
  bindProviderSession,
  collectProviders,
  connectSelectedProvider,
  isTargetChain,
  selectedAccount,
  shortenAddress,
  switchProviderChain,
} from "../src/wallet.js";

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const OTHER_ACCOUNT = "0x2222222222222222222222222222222222222222";
const CHAIN = {
  id: 61999,
  name: "Genlayer Studio Network",
  nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
  rpcUrls: { default: { http: ["https://studio.genlayer.com/api"] } },
  blockExplorers: { default: { url: "https://explorer-studio.genlayer.com" } },
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const announcement = (uuid, name, provider) => ({ info: { uuid, name, rdns: `test.${uuid}` }, provider });

class FakeWindow extends EventTarget {
  constructor(ethereum, announcements = []) {
    super();
    this.ethereum = ethereum;
    this.announcements = announcements;
    this.setTimeout = setTimeout;
    this.clearTimeout = clearTimeout;
  }

  announce(detail) {
    const event = new Event("eip6963:announceProvider");
    Object.defineProperty(event, "detail", { value: detail });
    super.dispatchEvent(event);
  }

  dispatchEvent(event) {
    if (event.type === "eip6963:requestProvider") this.announcements.forEach((detail) => this.announce(detail));
    return super.dispatchEvent(event);
  }
}

class EventProvider {
  constructor(request) { this.request = request; this.listeners = new Map(); }
  on(name, listener) { this.listeners.set(name, listener); }
  removeListener(name, listener) { if (this.listeners.get(name) === listener) this.listeners.delete(name); }
  emit(name, value) { this.listeners.get(name)?.(value); }
}

test("zero providers remains empty after bounded discovery", async () => {
  const result = collectProviders(new FakeWindow(), { legacyDelayMs: 1 });
  await wait(5);
  assert.equal(result.providers.size, 0);
  result.stop();
});

test("one and two announced providers are distinct and discovery requests no accounts", () => {
  let requests = 0;
  const first = { request: async () => { requests += 1; } };
  const second = { request: async () => { requests += 1; } };
  const win = new FakeWindow(undefined, [announcement("first", "First", first), announcement("second", "Second", second)]);
  const result = collectProviders(win);
  assert.deepEqual([...result.providers.values()].map(({ name }) => name), ["First", "Second"]);
  assert.equal(requests, 0);
  result.stop();
});

test("malformed announcements are ignored", () => {
  const provider = { request: async () => [] };
  const win = new FakeWindow(undefined, [
    {},
    { info: { uuid: "", name: "Empty UUID" }, provider },
    { info: { uuid: "missing-name", name: "" }, provider },
    { info: { uuid: "missing-provider", name: "Missing provider" }, provider: {} },
  ]);
  const result = collectProviders(win);
  assert.equal(result.providers.size, 0);
  result.stop();
});

test("re-announcement upserts by UUID and provider identity", () => {
  const first = { request: async () => [] };
  const second = { request: async () => [] };
  const win = new FakeWindow(undefined, [announcement("wallet", "Initial", first)]);
  const result = collectProviders(win);
  win.announce(announcement("wallet", "Replacement", second));
  win.announce(announcement("new-uuid", "Updated", second));
  assert.equal(result.providers.size, 1);
  assert.equal([...result.providers.values()][0].name, "Updated");
  assert.equal([...result.providers.values()][0].provider, second);
  result.stop();
});

test("window.ethereum is added only after the bounded legacy delay", async () => {
  const legacy = { isMetaMask: true, request: async () => [] };
  const result = collectProviders(new FakeWindow(legacy), { legacyDelayMs: 5 });
  assert.equal(result.providers.size, 0);
  await wait(10);
  assert.equal([...result.providers.values()][0].source, "legacy");
  result.stop();
});

test("the first valid announcement removes an existing legacy fallback", async () => {
  const legacy = { isMetaMask: true, request: async () => [] };
  const announced = { request: async () => [] };
  const win = new FakeWindow(legacy);
  const result = collectProviders(win, { legacyDelayMs: 1 });
  await wait(5);
  win.announce(announcement("modern", "Modern Wallet", announced));
  assert.deepEqual([...result.providers.values()].map(({ name, source }) => [name, source]), [["Modern Wallet", "eip6963"]]);
  result.stop();
});

test("only the explicitly selected provider requests an account and chain", async () => {
  const selectedCalls = [];
  const globalCalls = [];
  const selected = {
    isOkxWallet: true,
    isMetaMask: true,
    request: async ({ method }) => {
      selectedCalls.push(method);
      if (method === "eth_requestAccounts") return [ACCOUNT];
      if (method === "eth_chainId") return "0xf22f";
      throw new Error(method);
    },
  };
  const globalProvider = { request: async ({ method }) => { globalCalls.push(method); return []; } };
  const win = new FakeWindow(globalProvider, [announcement("okx", "OKX Wallet", selected)]);
  const result = collectProviders(win);
  const account = await connectSelectedProvider([...result.providers.values()][0], CHAIN);
  assert.equal(account, ACCOUNT);
  assert.deepEqual(selectedCalls, ["eth_requestAccounts", "eth_chainId"]);
  assert.deepEqual(globalCalls, []);
  result.stop();
});

test("empty or malformed account responses fail before chain switching", async () => {
  for (const accounts of [[], ["not-an-address"]]) {
    const calls = [];
    const provider = { request: async ({ method }) => { calls.push(method); return accounts; } };
    await assert.rejects(connectSelectedProvider({ provider }, CHAIN), /valid account/);
    assert.deepEqual(calls, ["eth_requestAccounts"]);
  }
});

test("a rejected account connection is surfaced without any chain request", async () => {
  const calls = [];
  const rejection = Object.assign(new Error("User rejected"), { code: 4001 });
  const provider = { request: async ({ method }) => {
    calls.push(method);
    throw rejection;
  } };
  await assert.rejects(connectSelectedProvider({ provider }, CHAIN), (error) => error === rejection);
  assert.deepEqual(calls, ["eth_requestAccounts"]);
});

test("a known chain switches once without adding the network", async () => {
  let chainId = "0x1";
  const calls = [];
  const provider = { request: async ({ method }) => {
    calls.push(method);
    if (method === "eth_chainId") return chainId;
    if (method === "wallet_switchEthereumChain") { chainId = "0xf22f"; return null; }
    throw new Error(method);
  } };
  await switchProviderChain(provider, CHAIN);
  assert.deepEqual(calls, ["eth_chainId", "wallet_switchEthereumChain", "eth_chainId"]);
});

test("unknown chain adds then retries the switch", async () => {
  let chainId = "0x1";
  let firstSwitch = true;
  const calls = [];
  const provider = { request: async (request) => {
    calls.push(request);
    if (request.method === "eth_chainId") return chainId;
    if (request.method === "wallet_switchEthereumChain" && firstSwitch) {
      firstSwitch = false;
      throw { code: 4902, message: "Unknown chain" };
    }
    if (request.method === "wallet_addEthereumChain") return null;
    if (request.method === "wallet_switchEthereumChain") { chainId = "0xf22f"; return null; }
    throw new Error(request.method);
  } };
  await switchProviderChain(provider, CHAIN);
  assert.deepEqual(calls.map(({ method }) => method), [
    "eth_chainId", "wallet_switchEthereumChain", "wallet_addEthereumChain", "wallet_switchEthereumChain", "eth_chainId",
  ]);
  assert.equal(calls[2].params[0].chainId, "0xf22f");
  assert.deepEqual(calls[2].params[0].rpcUrls, ["https://studio.genlayer.com/api"]);
});

test("non-unknown or rejected switch never adds a chain", async () => {
  const calls = [];
  const rejection = { code: 4001, message: "User rejected" };
  const provider = { request: async ({ method }) => {
    calls.push(method);
    if (method === "eth_chainId") return "0x1";
    throw rejection;
  } };
  await assert.rejects(switchProviderChain(provider, CHAIN), (error) => error === rejection);
  assert.deepEqual(calls, ["eth_chainId", "wallet_switchEthereumChain"]);
});

test("an explicit rejection code cannot be overridden by unknown-chain prose", async () => {
  const calls = [];
  const rejection = { code: 4001, message: "User rejected an unknown chain request" };
  const provider = { request: async ({ method }) => {
    calls.push(method);
    if (method === "eth_chainId") return "0x1";
    throw rejection;
  } };
  await assert.rejects(switchProviderChain(provider, CHAIN), (error) => error === rejection);
  assert.deepEqual(calls, ["eth_chainId", "wallet_switchEthereumChain"]);
});

test("account changes update, removals/wrong chains invalidate, and teardown removes listeners", () => {
  const provider = new EventProvider(async () => []);
  const events = [];
  const stop = bindProviderSession(provider, CHAIN, {
    accountChanged: (account) => events.push(["account", account]),
    invalidated: () => events.push(["invalidated"]),
  });
  provider.emit("accountsChanged", [OTHER_ACCOUNT]);
  provider.emit("accountsChanged", []);
  provider.emit("chainChanged", "0xf22f");
  provider.emit("chainChanged", "0x1");
  stop();
  provider.emit("accountsChanged", [ACCOUNT]);
  assert.deepEqual(events, [["account", OTHER_ACCOUNT], ["invalidated"], ["invalidated"]]);
  assert.equal(provider.listeners.size, 0);
});

test("an on-only provider is never subscribed because teardown is unavailable", () => {
  let subscriptions = 0;
  const provider = { on: () => { subscriptions += 1; }, request: async () => [] };
  const stop = bindProviderSession(provider, CHAIN, { accountChanged: () => {}, invalidated: () => {} });
  assert.equal(subscriptions, 0);
  stop();
});

test("malformed lifecycle hooks are treated as absent", () => {
  const provider = { on: "not callable", removeListener: () => {}, request: async () => [] };
  const stop = bindProviderSession(provider, CHAIN, { accountChanged: () => {}, invalidated: () => {} });
  assert.doesNotThrow(stop);
});

test("partial lifecycle registration is rolled back before surfacing failure", () => {
  const listeners = new Map();
  const provider = {
    request: async () => [],
    on(name, listener) {
      if (name === "chainChanged") throw new Error("hook failure");
      listeners.set(name, listener);
    },
    removeListener(name, listener) {
      if (listeners.get(name) === listener) listeners.delete(name);
    },
  };
  assert.throws(
    () => bindProviderSession(provider, CHAIN, { accountChanged: () => {}, invalidated: () => {} }),
    /hook failure/,
  );
  assert.equal(listeners.size, 0);
});

test("account change/removal and chain validation helpers fail closed", () => {
  assert.equal(selectedAccount([OTHER_ACCOUNT]), OTHER_ACCOUNT);
  assert.equal(selectedAccount([]), "");
  assert.equal(selectedAccount(["invalid"]), "");
  assert.equal(isTargetChain("0xF22F", CHAIN), true);
  assert.equal(isTargetChain("0x1", CHAIN), false);
  assert.equal(shortenAddress(ACCOUNT), "0x1111…1111");
});
