const WALLET_TYPES = [
  ["okx", "OKX Wallet", (provider) => provider.isOkxWallet || provider.isOKExWallet, /okx|okex/],
  ["rabby", "Rabby Wallet", (provider) => provider.isRabby, /rabby/],
  ["phantom", "Phantom", (provider) => provider.isPhantom, /phantom/],
  ["metamask", "MetaMask", (provider) => provider.isMetaMask, /metamask/],
];

function providerType(provider) {
  return WALLET_TYPES.find(([, , matches]) => matches(provider))?.[0] || "";
}

function announcedType(info = {}) {
  const identity = `${info.rdns || ""} ${info.name || ""}`.toLowerCase();
  return WALLET_TYPES.find(([, , , pattern]) => pattern.test(identity))?.[0] || "";
}

function providerName(provider, fallback = "Injected wallet") {
  return WALLET_TYPES.find(([type]) => type === providerType(provider))?.[1] || fallback;
}

export function collectProviders(win = window) {
  const providers = new Map();
  const add = (detail) => {
    const claimedType = announcedType(detail.info);
    const provider = detail?.provider;
    if (!provider?.request) return;
    const actualType = providerType(provider);
    const isDedicatedOkx = detail.info?.rdns?.toLowerCase() === "com.okex.wallet";
    if ((claimedType === "okx" || actualType === "okx") && !isDedicatedOkx) return;
    if (claimedType && actualType && claimedType !== actualType) return;
    if ([...providers.values()].some((entry) => entry.provider === provider)) return;
    const id = detail.info?.uuid || detail.info?.rdns || detail.info?.name || "legacy-injected";
    providers.set(id, {
      id,
      name: providerName(provider, detail.info?.name || "Injected wallet"),
      icon: detail.info?.icon || "",
      provider,
    });
  };

  const announce = (event) => add(event.detail);
  win.addEventListener("eip6963:announceProvider", announce);
  win.dispatchEvent(new Event("eip6963:requestProvider"));
  if (!providers.size) {
    const legacyProviders = win.ethereum?.providers || (win.ethereum ? [win.ethereum] : []);
    legacyProviders.forEach((provider, index) => add({
      info: { uuid: `legacy-injected-${index}`, name: providerName(provider) },
      provider,
    }));
  }

  return {
    providers,
    stop: () => win.removeEventListener("eip6963:announceProvider", announce),
  };
}

export async function connectSelectedProvider(entry) {
  if (!entry?.provider?.request) throw new Error("Choose an available wallet provider.");
  const accounts = await entry.provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || !accounts[0]) throw new Error("The selected wallet returned no account.");
  return accounts[0];
}

export function shortenAddress(address) {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address || "")) return "Not connected";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
