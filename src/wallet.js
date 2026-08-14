const WALLET_NAMES = [
  [(provider) => provider.isOkxWallet || provider.isOKExWallet, "OKX Wallet"],
  [(provider) => provider.isRabby, "Rabby Wallet"],
  [(provider) => provider.isPhantom, "Phantom"],
  [(provider) => provider.isMetaMask, "MetaMask"],
];

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export function selectedAccount(accounts) {
  return Array.isArray(accounts) && ADDRESS_PATTERN.test(accounts[0] || "") ? accounts[0] : "";
}

export function isTargetChain(chainId, chain) {
  return String(chainId).toLowerCase() === `0x${chain.id.toString(16)}`;
}

function providerName(provider, fallback = "Injected wallet") {
  return WALLET_NAMES.find(([matches]) => matches(provider))?.[1] || fallback;
}

function validAnnouncement(detail) {
  return typeof detail?.info?.uuid === "string"
    && detail.info.uuid.trim().length > 0
    && typeof detail.info.name === "string"
    && detail.info.name.trim().length > 0
    && typeof detail?.provider?.request === "function";
}

export function collectProviders(win = window, { legacyDelayMs = 200 } = {}) {
  const providers = new Map();
  const providerIds = new Map();
  const legacyIds = new Set();
  const subscribers = new Set();
  let announced = false;

  const notify = () => subscribers.forEach((subscriber) => subscriber(providers));
  const remove = (id) => {
    const entry = providers.get(id);
    if (!entry) return;
    providers.delete(id);
    providerIds.delete(entry.provider);
    legacyIds.delete(id);
  };
  const add = (detail, legacy = false) => {
    if (legacy) {
      if (typeof detail?.provider?.request !== "function" || announced) return;
    } else {
      if (!validAnnouncement(detail)) return;
      announced = true;
      [...legacyIds].forEach(remove);
    }

    const provider = detail.provider;
    const id = legacy ? "legacy-window-ethereum" : detail.info.uuid.trim();
    const previousId = providerIds.get(provider);
    if (previousId && previousId !== id) remove(previousId);
    const previousEntry = providers.get(id);
    if (previousEntry && previousEntry.provider !== provider) providerIds.delete(previousEntry.provider);

    providers.set(id, {
      id,
      name: legacy ? providerName(provider) : detail.info.name.trim(),
      icon: legacy ? "" : (detail.info.icon || ""),
      provider,
      source: legacy ? "legacy" : "eip6963",
    });
    providerIds.set(provider, id);
    if (legacy) legacyIds.add(id);
    notify();
  };

  const announce = (event) => add(event.detail);
  win.addEventListener("eip6963:announceProvider", announce);
  win.dispatchEvent(new Event("eip6963:requestProvider"));
  const legacyTimer = win.setTimeout?.(() => {
    if (!announced && win.ethereum) add({ provider: win.ethereum }, true);
  }, legacyDelayMs);

  return {
    providers,
    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    stop() {
      if (legacyTimer !== undefined) win.clearTimeout?.(legacyTimer);
      win.removeEventListener("eip6963:announceProvider", announce);
      subscribers.clear();
    },
  };
}

function errorCode(error) {
  return error?.code ?? error?.data?.code ?? error?.data?.originalError?.code ?? error?.cause?.code;
}

function isUnknownChain(error) {
  const code = errorCode(error);
  if (code !== undefined && code !== null) return Number(code) === 4902;
  return /unknown|unrecognized|not added/i.test(error?.message || "");
}

function chainParams(chain) {
  const params = {
    chainId: `0x${chain.id.toString(16)}`,
    chainName: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: [...chain.rpcUrls.default.http],
  };
  if (chain.blockExplorers?.default?.url) params.blockExplorerUrls = [chain.blockExplorers.default.url];
  return params;
}

export async function switchProviderChain(provider, chain) {
  if (!provider?.request || !Number.isSafeInteger(chain?.id)) throw new Error("The selected wallet or chain is invalid.");
  const target = `0x${chain.id.toString(16)}`;
  const current = await provider.request({ method: "eth_chainId" });
  if (isTargetChain(current, chain)) return;

  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: target }] });
  } catch (error) {
    if (!isUnknownChain(error)) throw error;
    await provider.request({ method: "wallet_addEthereumChain", params: [chainParams(chain)] });
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: target }] });
  }

  const confirmed = await provider.request({ method: "eth_chainId" });
  if (!isTargetChain(confirmed, chain)) throw new Error(`The selected wallet did not switch to chain ${chain.id}.`);
}

export async function connectSelectedProvider(entry, chain) {
  if (!entry?.provider?.request) throw new Error("Choose an available wallet provider.");
  const accounts = await entry.provider.request({ method: "eth_requestAccounts" });
  const account = selectedAccount(accounts);
  if (!account) throw new Error("The selected wallet returned no valid account.");
  await switchProviderChain(entry.provider, chain);
  return account;
}

function watchProvider(provider, { accountsChanged, chainChanged }) {
  provider.on?.("accountsChanged", accountsChanged);
  provider.on?.("chainChanged", chainChanged);
  return () => {
    provider.removeListener?.("accountsChanged", accountsChanged);
    provider.removeListener?.("chainChanged", chainChanged);
  };
}

export function bindProviderSession(provider, chain, { accountChanged, invalidated }) {
  return watchProvider(provider, {
    accountsChanged(accounts) {
      const account = selectedAccount(accounts);
      if (account) accountChanged(account);
      else invalidated();
    },
    chainChanged(chainId) {
      if (!isTargetChain(chainId, chain)) invalidated();
    },
  });
}

export function shortenAddress(address) {
  if (!ADDRESS_PATTERN.test(address || "")) return "Not connected";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
