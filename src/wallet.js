export function collectProviders(win = window) {
  const providers = new Map();
  const add = (detail) => {
    if (!detail?.provider?.request) return;
    const id = detail.info?.uuid || detail.info?.rdns || detail.info?.name || "legacy-injected";
    providers.set(id, {
      id,
      name: detail.info?.name || "Injected wallet",
      icon: detail.info?.icon || "",
      provider: detail.provider,
    });
  };

  const announce = (event) => add(event.detail);
  win.addEventListener("eip6963:announceProvider", announce);
  win.dispatchEvent(new Event("eip6963:requestProvider"));
  if (win.ethereum) add({ info: { uuid: "legacy-injected", name: "Injected wallet" }, provider: win.ethereum });

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

