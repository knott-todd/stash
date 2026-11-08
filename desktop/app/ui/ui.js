// Three screens: Link, Folders, Backing up. Plus a passcode prompt for Locked accounts.
const app = document.getElementById("app");
let S = null;
let chosen = null; // folder picks while on the Folders screen
let error = null;
let passcodeHint = undefined;
let askingPasscode = false;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const bytes = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`);
const ago = (t) => {
  if (!t) return "";
  const s = (Date.now() - t) / 1000;
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
};

async function call(channel, ...args) {
  try {
    error = null;
    const r = await window.stash.invoke(channel, ...args);
    if (r && r.version) S = r;
    render();
    return r;
  } catch (e) {
    error = String(e.message ?? e).replace(/^Error invoking remote method '\w+': Error: /, "");
    render();
    return null;
  }
}

function brand() {
  return `<div class="brand">Stash<span class="dot">.</span></div>`;
}

function render() {
  if (!S) return;
  if (askingPasscode) return (app.innerHTML = passcodeScreen());
  if (!S.linked) return (app.innerHTML = linkScreen());
  if (!S.folders.length) return (app.innerHTML = foldersScreen());
  app.innerHTML = statusScreen();
}

function linkScreen() {
  if (S.linking) {
    return `${brand()}
      <h1>Approve this computer</h1>
      <p>A page just opened in your browser. Sign in there if asked and tap <strong>Yes, link it</strong>. The code it shows should be:</p>
      <div class="code" data-testid="code">${esc(S.linking.code)}</div>
      <p class="small" style="text-align:center">Waiting <span class="spin"></span></p>
      <div class="spacer"></div>
      <div class="actions">
        <button class="link" data-act="openLink">Open the page again</button>
        <button class="link" data-act="cancelLink">Cancel</button>
      </div>`;
  }
  return `${brand()}
    <h1>Keep this computer backed up.</h1>
    <p>Link it to your Stash account once. After that, every new or changed file in the folders you choose is sent to Stash on its own, encrypted before it leaves.</p>
    ${S.linkExpired ? `<p class="error">That took too long. Try again.</p>` : ""}
    ${error ? `<p class="error">${esc(error)}</p>` : ""}
    <div class="spacer"></div>
    <button class="btn" data-act="link" data-testid="link">Link this computer</button>
    <p class="small" style="margin-top:12px">Your browser will open so you can say yes with your Google account.</p>`;
}

function foldersScreen() {
  chosen ??= S.suggested.filter((f) => /^(Documents|Pictures)/.test(f.label)).map((f) => ({ ...f }));
  const all = [...S.suggested];
  for (const c of chosen) if (!all.some((a) => a.path === c.path)) all.push(c);
  return `${brand()}
    <h1>Which folders?</h1>
    <p>Everything in these folders, and everything added later, stays backed up.</p>
    <div class="card" data-testid="folders">
      ${all
        .map(
          (f) => `<label class="row"><input type="checkbox" data-path="${esc(f.path)}" data-label="${esc(f.label)}" ${chosen.some((c) => c.path === f.path) ? "checked" : ""}>
            <span><span class="name">${esc(f.label)}</span><br><span class="path">${esc(f.path)}</span></span></label>`,
        )
        .join("")}
    </div>
    <div class="actions"><button class="link" data-act="pickFolder">Add another folder…</button></div>
    ${error ? `<p class="error">${esc(error)}</p>` : ""}
    <div class="spacer"></div>
    <button class="btn" data-act="start" data-testid="start" ${chosen.length ? "" : "disabled"}>Start backing up</button>`;
}

function statusScreen() {
  const a = S.agent ?? { status: "off", folders: [] };
  const busy = a.status === "uploading" || a.status === "scanning";
  const pending = (a.folders ?? []).reduce((n, f) => n + (f.pending || 0), 0);
  const dot = a.status === "error" ? "bad" : busy ? "busy" : a.status === "paused" || a.status === "off" ? "off" : "";
  const text =
    a.status === "uploading" ? `Backing up${a.detail ? `: ${esc(a.detail)}` : ""}${pending ? ` · ${pending} to go` : ""}` :
    a.status === "scanning" ? "Looking for new files" :
    a.status === "paused" ? "Paused" :
    a.status === "error" ? (a.lastError === "unlinked" ? "This computer was unlinked. Link it again." : a.lastError === "locked" ? "Enter your passcode to continue." : `Trouble: ${esc(a.lastError ?? "")}`) :
    a.status === "off" ? "Starting" : "Up to date. Watching for changes.";
  const rows = (S.folders ?? []).map((f) => {
    const st = (a.folders ?? []).find((x) => x.path === f.path) ?? {};
    const right = st.pending ? `${st.pending} waiting` : st.lastUpload ? `Up to date · ${ago(st.lastUpload)}` : st.files != null ? "Up to date" : "";
    return `<div class="row"><span><span class="name">${esc(f.label)}</span><br><span class="path">${esc(f.path)}</span></span>
      <span class="right">${st.files != null ? `${st.files} files · ${bytes(st.bytes || 0)}<br>` : ""}<span class="small">${esc(right)}</span>${st.failed ? `<br><span class="small">${st.failed} couldn't be sent</span>` : ""}</span></div>`;
  });
  return `${brand()}
    <div class="status"><span class="dot ${dot}"></span><span data-testid="status">${text}</span></div>
    <div class="card" data-testid="status-folders">${rows.join("") || `<p class="small">No folders yet.</p>`}</div>
    <div class="actions">
      <button class="link" data-act="editFolders">Change folders</button>
      ${a.paused ? `<button class="link" data-act="resume">Resume</button>` : `<button class="link" data-act="pause">Pause</button>`}
      <button class="link" data-act="checkNow">Check now</button>
    </div>
    <div class="spacer"></div>
    <label class="toggle"><input type="checkbox" data-act="openAtLogin" ${S.openAtLogin ? "checked" : ""}> Start when I sign in to this computer</label>
    <div class="actions">
      <button class="link" data-act="openWeb">See all my devices</button>
      <button class="link" data-act="unlink">Unlink this computer</button>
    </div>
    <p class="small" style="margin-top:12px">Linked as ${esc(S.email ?? "your account")} · closing this window keeps it running in the tray.</p>`;
}

function passcodeScreen() {
  return `${brand()}
    <h1>Enter your passcode</h1>
    <p>Your files are locked with a passcode. Enter it once on this computer.${passcodeHint ? ` Hint: ${esc(passcodeHint)}` : ""}</p>
    <input class="input" type="password" id="passcode" placeholder="Passcode" autofocus />
    ${error ? `<p class="error">${esc(error)}</p>` : ""}
    <div class="spacer"></div>
    <button class="btn" data-act="sendPasscode">Open</button>`;
}

app.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  const act = el.dataset.act;
  if (act === "link") await call("link");
  else if (act === "openLink") await call("openLink");
  else if (act === "cancelLink") await call("cancelLink");
  else if (act === "pickFolder") {
    const f = await window.stash.invoke("pickFolder");
    if (f && !chosen.some((c) => c.path === f.path)) chosen.push(f);
    render();
  } else if (act === "start") {
    const picks = [...app.querySelectorAll("input[type=checkbox][data-path]:checked")].map((i) => ({ path: i.dataset.path, label: i.dataset.label }));
    chosen = null;
    await call("setFolders", picks);
  } else if (act === "editFolders") {
    chosen = S.folders.map((f) => ({ ...f }));
    app.innerHTML = foldersScreen();
  } else if (act === "pause") await call("pause");
  else if (act === "resume") await call("resume");
  else if (act === "checkNow") await call("checkNow");
  else if (act === "openWeb") await call("openWeb", "/devices");
  else if (act === "unlink") {
    if (confirm("Unlink this computer? It stops backing up. Everything already sent stays in Stash.")) await call("unlink");
  } else if (act === "sendPasscode") {
    const v = document.getElementById("passcode").value;
    askingPasscode = false;
    await window.stash.invoke("passcode", v);
    render();
  }
});

app.addEventListener("change", async (e) => {
  const el = e.target.closest("[data-act=openAtLogin]");
  if (el) await call("setOpenAtLogin", el.checked);
  if (e.target.matches("input[type=checkbox][data-path]") && chosen) {
    const { path, label } = e.target.dataset;
    if (e.target.checked && !chosen.some((c) => c.path === path)) chosen.push({ path, label });
    if (!e.target.checked) chosen = chosen.filter((c) => c.path !== path);
    render();
  }
});

window.stash.on("state", (s) => {
  S = s;
  render();
});
window.stash.on("askPasscode", ({ hint }) => {
  passcodeHint = hint;
  askingPasscode = true;
  render();
});
window.stash.on("log", () => {});

call("state");
