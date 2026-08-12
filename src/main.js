import "../tokens.css";
import "./style.css";
import {
  CONTRACT_ADDRESS,
  connectStudionet,
  createTraceAndReadback,
  createWriteClient,
  hasLiveContract,
  readLatestAssessment,
  readTrace,
  writeAndReadback,
} from "./genlayer.js";
import { collectProviders, connectSelectedProvider, shortenAddress } from "./wallet.js";
import { parseLosslessInteger } from "./transaction.js";

const state = {
  account: "",
  provider: null,
  writeClient: null,
  currentTrace: null,
  currentAssessment: null,
  providers: collectProviders(),
};

const app = document.querySelector("#app");

app.innerHTML = `
  <nav class="side-rail" aria-label="Primary">
    <a class="rail-wordmark" href="#top" aria-label="Campaign Ad Sponsor Trace home">CAST</a>
    <div class="rail-links">
      <a href="#lookup">Lookup</a>
      <a href="#create">Create</a>
      <a href="#result">Result</a>
    </div>
  </nav>

  <main id="main" class="shell">
    <header id="top" class="mast reveal" style="--i:0">
      <div class="mast-meta">
        <span>Federal independent expenditures</span>
        <span>Studionet · Chain 61999</span>
      </div>
      <h1>Trace the sponsor claim.</h1>
      <p class="lede">Bind exact ad bytes and disclaimer text. GenLayer validators independently compare that frozen claim with FEC committee and Schedule E records.</p>
      <div class="scope-rule">
        <strong>Scope boundary</strong>
        <span>A compatible record does not prove payment for the exact creative and is not a legal finding.</span>
      </div>
      <div class="mast-actions">
        <button id="connect-wallet" class="button button-primary" type="button">Choose wallet</button>
        <span id="wallet-status" class="mono">Not connected</span>
      </div>
    </header>

    <section id="lookup" class="workbench reveal" style="--i:1" aria-labelledby="lookup-heading">
      <div class="section-head">
        <h2 id="lookup-heading">Open a public trace</h2>
        <p>No wallet is required for read-only evidence.</p>
      </div>
      <form id="lookup-form" class="lookup-line" novalidate>
        <label for="lookup-id">Trace ID</label>
        <input id="lookup-id" name="traceId" inputmode="numeric" pattern="[0-9]+" autocomplete="off" placeholder="Example: 1" required />
        <button class="button" type="submit">Load trace</button>
      </form>
      <p id="lookup-error" class="field-error" role="alert"></p>
    </section>

    <section id="create" class="workbench reveal" style="--i:2" aria-labelledby="create-heading">
      <div class="section-head">
        <h2 id="create-heading">Bind the evidence</h2>
        <p>The artifact URL remains external. The contract stores its expected SHA-256 digest and independently checks the fetched bytes.</p>
      </div>
      <form id="trace-form" class="trace-form" novalidate>
        <div class="field field-wide">
          <label for="artifact-url">Public artifact URL</label>
          <input id="artifact-url" name="artifactUrl" type="url" autocomplete="off" placeholder="https://www.facebook.com/ads/library/…" required />
          <small>Top-level comparison requires a supported platform library or public archive URL.</small>
        </div>
        <div class="field field-wide">
          <label for="artifact-digest">Artifact SHA-256</label>
          <input id="artifact-digest" name="artifactDigest" inputmode="text" minlength="64" maxlength="64" spellcheck="false" autocomplete="off" placeholder="64 lowercase hexadecimal characters" required />
        </div>
        <div class="field field-wide">
          <label for="disclaimer">Exact disclaimer text</label>
          <textarea id="disclaimer" name="disclaimer" maxlength="1000" rows="4" placeholder="Paid for by … and not authorized by any candidate or candidate’s committee." required></textarea>
        </div>
        <div class="field">
          <label for="candidate-id">FEC candidate ID</label>
          <input id="candidate-id" name="candidateId" pattern="[HSP][0-9]{8}" maxlength="9" spellcheck="false" autocomplete="off" placeholder="H00123456" required />
        </div>
        <div class="field">
          <label for="committee-id">Claimed committee ID</label>
          <input id="committee-id" name="committeeId" pattern="C[0-9]{8}" maxlength="9" spellcheck="false" autocomplete="off" placeholder="C00123456" required />
        </div>
        <div class="field">
          <label for="cycle">Election cycle</label>
          <input id="cycle" name="cycle" type="number" min="2010" max="2100" step="2" inputmode="numeric" autocomplete="off" required />
        </div>
        <fieldset class="field relation-field">
          <legend>Candidate relation</legend>
          <label><input type="radio" name="supportOppose" value="S" required /> Supports</label>
          <label><input type="radio" name="supportOppose" value="O" required /> Opposes</label>
        </fieldset>
        <div class="field">
          <label for="observed-at">Artifact observed at</label>
          <input id="observed-at" name="observedAt" type="datetime-local" autocomplete="off" required />
        </div>
        <div class="field">
          <label for="cutoff-at">Filing observation cutoff</label>
          <input id="cutoff-at" name="cutoffAt" type="datetime-local" autocomplete="off" required />
        </div>
        <label class="consent field-wide">
          <input id="scope-consent" name="scopeConsent" type="checkbox" required />
          <span>I understand this records evidence compatibility only—not legality, coordination, political truth, or proof that a filing paid for this exact creative.</span>
        </label>
        <div class="form-actions field-wide">
          <button id="create-trace" class="button button-primary" type="submit">Create draft trace</button>
          <span id="deployment-note" class="mono"></span>
        </div>
        <p id="form-error" class="field-error field-wide" role="alert"></p>
      </form>
    </section>

    <section id="result" class="workbench result-workbench reveal" style="--i:3" aria-labelledby="result-heading">
      <div class="section-head">
        <h2 id="result-heading">Frozen record</h2>
        <p id="result-summary">Load or create a trace to inspect its exact decision boundary.</p>
      </div>
      <div id="result-empty" class="empty-state">
        <p>No trace loaded.</p>
        <a href="#lookup">Open a trace by ID</a>
      </div>
      <div id="result-content" hidden></div>
      <div id="trace-actions" class="trace-actions" hidden>
        <button id="freeze-trace" class="button" type="button">Freeze evidence</button>
        <button id="assess-trace" class="button button-primary" type="button">Assess after cutoff</button>
        <button id="reassess-trace" class="button" type="button">Reassess with current FEC data</button>
      </div>
    </section>

    <aside class="transaction-strip" aria-labelledby="transaction-heading">
      <strong id="transaction-heading">Transaction lifecycle</strong>
      <span id="transaction-status" class="mono" aria-live="polite">Idle</span>
    </aside>

    <footer class="colophon">
      <p>Campaign Ad Sponsor Trace · PROJECT · Studionet · Federal independent-expenditure scope · FEC data remains authoritative at its source · All assessments preserve the artifact digest, FEC digest, cutoff, and revision.</p>
      <div><a href="https://www.fec.gov/help-candidates-and-committees/advertising-and-disclaimers/" rel="noreferrer">FEC disclaimer guidance</a> · <a href="https://www.fec.gov/data/browse-data/?tab=spending" rel="noreferrer">FEC spending data</a></div>
    </footer>
  </main>

  <dialog id="provider-dialog" class="provider-dialog" aria-labelledby="provider-heading">
    <div class="dialog-head">
      <div>
        <h2 id="provider-heading">Choose a wallet provider</h2>
        <p>Connection is requested only after you select one.</p>
      </div>
      <button id="close-provider" class="icon-button" type="button" aria-label="Close wallet chooser">×</button>
    </div>
    <div id="provider-list" class="provider-list"></div>
    <p id="provider-error" class="field-error" role="alert"></p>
  </dialog>
`;

const byId = (id) => document.getElementById(id);
const connectButton = byId("connect-wallet");
const providerDialog = byId("provider-dialog");
const providerList = byId("provider-list");
const txStatus = byId("transaction-status");
const now = new Date();
const cycle = now.getUTCFullYear() + (now.getUTCFullYear() % 2);
byId("cycle").value = String(cycle);
byId("observed-at").value = toLocalInput(now);
byId("cutoff-at").value = toLocalInput(new Date(now.getTime() + 48 * 60 * 60 * 1000));
byId("deployment-note").textContent = hasLiveContract() ? `Contract ${shortenAddress(CONTRACT_ADDRESS)}` : "Contract address will be wired after PRE_DEPLOY approval.";

function toLocalInput(date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function phase(name, detail = {}) {
  const labels = {
    signing: "Awaiting wallet signature…",
    submitted: `Submitted ${detail.hash || ""}`,
    consensus: `Consensus in progress · ${detail.hash || ""}`,
    readback: "Finalized · checking authoritative state…",
    confirmed: `Confirmed · ${detail.hash || ""}`,
    failed: `Finalized without successful execution · ${detail.hash || ""}`,
    "reconcile-required": `Reconciliation required before retry · ${detail.hash || ""}`,
  };
  txStatus.textContent = labels[name] || name;
}

function renderProviders() {
  providerList.replaceChildren();
  const entries = [...state.providers.providers.values()];
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.textContent = "No injected wallet provider was detected. Install or enable a compatible wallet, then reopen this chooser.";
    providerList.append(empty);
    return;
  }
  for (const entry of entries) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "provider-option";
    button.textContent = entry.name;
    button.addEventListener("click", () => chooseProvider(entry, button));
    providerList.append(button);
  }
}

async function chooseProvider(entry, button) {
  byId("provider-error").textContent = "";
  button.disabled = true;
  try {
    const account = await connectSelectedProvider(entry);
    const client = createWriteClient(entry.provider, account);
    await connectStudionet(client);
    state.account = account;
    state.provider = entry.provider;
    state.writeClient = client;
    connectButton.textContent = "Switch wallet";
    byId("wallet-status").textContent = `${entry.name} · ${shortenAddress(account)}`;
    entry.provider.on?.("accountsChanged", () => window.location.reload());
    entry.provider.on?.("chainChanged", () => window.location.reload());
    providerDialog.close();
  } catch (error) {
    byId("provider-error").textContent = error?.message || "The selected wallet did not connect. Choose a provider and approve the request.";
  } finally {
    button.disabled = false;
  }
}

connectButton.addEventListener("click", () => {
  renderProviders();
  providerDialog.showModal();
});
byId("close-provider").addEventListener("click", () => providerDialog.close());
providerDialog.addEventListener("click", (event) => {
  if (event.target === providerDialog) providerDialog.close();
});

byId("lookup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const error = byId("lookup-error");
  error.textContent = "";
  if (!hasLiveContract()) {
    error.textContent = "The Studionet contract address is not wired yet. This becomes available after PRE_DEPLOY approval and deployment.";
    return;
  }
  try {
    const id = parseLosslessInteger(new FormData(event.currentTarget).get("traceId"), "Trace ID");
    const trace = await readTrace(id);
    if (!trace) throw new Error(`Trace ${id} was not found.`);
    state.currentTrace = trace;
    state.currentAssessment = await readLatestAssessment(id);
    renderResult();
  } catch (cause) {
    error.textContent = cause?.message || "The trace could not be loaded. Check the ID and try the read again.";
  }
});

byId("trace-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const error = byId("form-error");
  error.textContent = "";
  if (!form.reportValidity()) return;
  if (!hasLiveContract()) {
    error.textContent = "Creation is disabled until the reviewed contract is deployed and its real Studionet address is wired.";
    return;
  }
  if (!state.writeClient) {
    error.textContent = "Choose a wallet provider before creating a trace.";
    connectButton.focus();
    return;
  }
  const data = new FormData(form);
  const digest = String(data.get("artifactDigest")).trim().toLowerCase();
  const args = [
    String(data.get("artifactUrl")).trim(),
    digest,
    String(data.get("disclaimer")).trim(),
    String(data.get("candidateId")).trim().toUpperCase(),
    Number(data.get("cycle")),
    String(data.get("committeeId")).trim().toUpperCase(),
    String(data.get("supportOppose")),
    BigInt(Math.floor(new Date(String(data.get("observedAt"))).getTime() / 1000)),
    BigInt(Math.floor(new Date(String(data.get("cutoffAt"))).getTime() / 1000)),
  ];
  setFormBusy(form, true);
  try {
    const result = await createTraceAndReadback({ client: state.writeClient, args, account: state.account, expectedDigest: digest, onPhase: phase });
    state.currentTrace = result.state.trace;
    state.currentAssessment = null;
    renderResult();
    location.hash = "result";
  } catch (cause) {
    error.textContent = cause?.message || "The draft was not confirmed. Reconcile any submitted hash before trying again.";
  } finally {
    setFormBusy(form, false);
  }
});

function setFormBusy(form, busy) {
  for (const control of form.elements) control.disabled = busy;
  byId("create-trace").textContent = busy ? "Creating draft…" : "Create draft trace";
}

async function runTraceWrite(functionName, verify) {
  if (!state.currentTrace || !state.writeClient) {
    txStatus.textContent = "Choose a wallet and load a trace before writing.";
    return;
  }
  const traceId = parseLosslessInteger(state.currentTrace.trace_id, "Trace ID");
  for (const button of document.querySelectorAll("#trace-actions button")) button.disabled = true;
  try {
    const result = await writeAndReadback({ client: state.writeClient, functionName, args: [traceId], traceId, verify, onPhase: phase });
    state.currentTrace = result.state.trace;
    state.currentAssessment = result.state.assessment;
    renderResult();
  } catch (error) {
    txStatus.textContent = error?.message || "The write was not confirmed. Reconcile before retrying.";
  } finally {
    renderActions();
  }
}

byId("freeze-trace").addEventListener("click", () => runTraceWrite("freeze_trace", ({ trace }) => trace?.state === "FROZEN"));
byId("assess-trace").addEventListener("click", () => runTraceWrite("assess_trace", ({ assessment }) => Boolean(assessment?.verdict)));
byId("reassess-trace").addEventListener("click", () => runTraceWrite("reassess_trace", ({ assessment }) => Boolean(assessment?.revision > state.currentAssessment?.revision)));

function renderResult() {
  const trace = state.currentTrace;
  byId("result-empty").hidden = Boolean(trace);
  byId("result-content").hidden = !trace;
  byId("trace-actions").hidden = !trace;
  if (!trace) return;
  byId("result-summary").textContent = `Trace ${trace.trace_id} · ${trace.state} · ${trace.artifact_provenance}`;
  const content = byId("result-content");
  content.replaceChildren(
    recordTable("Frozen claim", [
      ["Artifact digest", trace.artifact_sha256],
      ["Exact disclaimer", trace.disclaimer],
      ["Candidate", trace.candidate_id],
      ["Committee", trace.committee_id],
      ["Cycle", trace.cycle],
      ["Relation", trace.support_oppose === "S" ? "Supports" : "Opposes"],
      ["Cutoff", new Date(Number(trace.cutoff_at) * 1000).toISOString()],
    ]),
  );
  const source = document.createElement("a");
  source.href = trace.artifact_url;
  source.rel = "noreferrer";
  source.target = "_blank";
  source.textContent = "Open the original artifact in a separate tab";
  source.className = "artifact-link";
  content.append(source);
  if (state.currentAssessment) {
    content.append(recordTable("Latest assessment", [
      ["Verdict", state.currentAssessment.verdict],
      ["Revision", state.currentAssessment.revision],
      ["Reason", state.currentAssessment.reason],
      ["Committee relation", state.currentAssessment.committee_relation],
      ["Disclaimer relation", state.currentAssessment.disclaimer_relation],
      ["Filing relation", state.currentAssessment.filing_relation],
      ["Matched transaction", state.currentAssessment.matched_transaction_id || "None"],
      ["FEC evidence digest", state.currentAssessment.fec_digest || "Unavailable"],
      ["Manual review", state.currentAssessment.manual_review_required ? "Required" : "Not required by this signal"],
    ]));
  }
  renderActions();
}

function recordTable(caption, rows) {
  const table = document.createElement("table");
  const cap = document.createElement("caption");
  cap.textContent = caption;
  table.append(cap);
  const body = document.createElement("tbody");
  for (const [label, value] of rows) {
    const row = document.createElement("tr");
    const head = document.createElement("th");
    const cell = document.createElement("td");
    head.scope = "row";
    head.textContent = label;
    cell.textContent = String(value ?? "");
    row.append(head, cell);
    body.append(row);
  }
  table.append(body);
  return table;
}

function renderActions() {
  const trace = state.currentTrace;
  if (!trace) return;
  const isOwner = state.account && trace.owner?.toLowerCase() === state.account.toLowerCase();
  byId("freeze-trace").hidden = trace.state !== "DRAFT";
  byId("freeze-trace").disabled = !isOwner;
  byId("assess-trace").hidden = trace.state !== "FROZEN" || Boolean(state.currentAssessment);
  byId("assess-trace").disabled = !state.writeClient || Date.now() < Number(trace.cutoff_at) * 1000;
  byId("reassess-trace").hidden = !state.currentAssessment;
  byId("reassess-trace").disabled = !state.writeClient;
}

window.addEventListener("beforeunload", (event) => {
  if (txStatus.textContent.includes("Submitted") || txStatus.textContent.includes("Consensus")) {
    event.preventDefault();
  }
});

const pendingHash = localStorage.getItem("campaignTrace.pendingHash");
if (pendingHash) txStatus.textContent = `Pending reconciliation · ${pendingHash}`;

