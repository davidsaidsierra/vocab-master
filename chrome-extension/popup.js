const API_LOCAL  = "http://127.0.0.1:8000/api";
const API_REMOTE = "https://vocab-master-re2t.onrender.com/api";
let API = API_REMOTE; // resolved in checkConnection

const $ = (sel) => document.querySelector(sel);
const wordInput       = $("#word");
const translationInput = $("#translation");
const exampleInput    = $("#example");
const categorySelect  = $("#category");
const difficultySelect = $("#difficulty");
const saveBtn         = $("#save-btn");
const lookupBtn       = $("#lookup-btn");
const lookupPanel     = $("#lookup-panel");
const errorMsg        = $("#error-msg");
const statusDot       = $("#status-dot");
const loadingView     = $("#loading-view");
const loginView       = $("#login-view");
const loginEmail      = $("#login-email");
const loginPassword   = $("#login-password");
const loginBtn        = $("#login-btn");
const loginError      = $("#login-error");
const formView        = $("#form-view");
const successView     = $("#success-view");

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── Token JWT (reemplaza al viejo X-API-Key) ────────────────
const TOKEN_KEY = "vocab_token";
const API_BASE_KEY = "vocab_api_base";  // base donde se emitió el token
let token = "";

async function loadToken() {
  const d = await chrome.storage.local.get(TOKEN_KEY);
  token = d[TOKEN_KEY] || "";
  return token;
}
async function setToken(t) {
  token = t || "";
  await chrome.storage.local.set({ [TOKEN_KEY]: token });
}
async function clearToken() {
  token = "";
  await chrome.storage.local.remove(TOKEN_KEY);
}

// El token JWT se firma con el JWT_SECRET del backend que lo emitió. Si local y
// Render usan secretos distintos, un token de uno da 401 ("no autenticado") en
// el otro. Guardamos la base donde se hizo login y la preferimos, para no saltar
// de backend con un token que allí no vale.
async function getPinnedBase() {
  const d = await chrome.storage.local.get(API_BASE_KEY);
  return d[API_BASE_KEY] || "";
}
async function setPinnedBase(base) {
  await chrome.storage.local.set({ [API_BASE_KEY]: base || "" });
}
function authHeaders() {
  const h = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

// fetch contra la API con el token; si el server responde 401, la sesión
// expiró → limpiar token y volver al login.
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  if (res.status === 401) {
    await clearToken();
    showLogin("Tu sesión expiró. Inicia sesión de nuevo.");
    throw new Error("No autenticado");
  }
  return res;
}

// ── Vistas ──────────────────────────────────────────────────
function hideAll() {
  loadingView.style.display = "none";
  loginView.style.display = "none";
  formView.style.display = "none";
  successView.style.display = "none";
}
function showLogin(msg) {
  hideAll();
  loginView.style.display = "block";
  if (msg) {
    loginError.textContent = msg;
    loginError.style.display = "block";
  } else {
    loginError.style.display = "none";
  }
  loginEmail.focus();
}
function showForm() {
  hideAll();
  formView.style.display = "block";
  loadCategories();
  loadCapturedWord();
}

// ── Reachability: base fijada primero, luego local, luego Render ─────
// Cualquier respuesta HTTP (incluida 401 sin token) significa "alcanzable".
// Timeout amplio: Render (free tier) tarda en despertar tras estar dormido.
async function reachable(base) {
  try {
    await fetch(`${base}/auth/me`, {
      headers: authHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    return true;
  } catch {
    return false;
  }
}

function markOnline(base) {
  API = base;
  statusDot.classList.add("online");
  statusDot.title = base === API_LOCAL ? "Connected (local)" : "Connected (Render)";
}

async function checkConnection() {
  // Preferimos la base donde se emitió el token (el JWT solo vale allí). Solo si
  // esa base está caída probamos la otra.
  const pinned = await getPinnedBase();
  const order = pinned
    ? [pinned, pinned === API_LOCAL ? API_REMOTE : API_LOCAL]
    : [API_LOCAL, API_REMOTE];
  for (const base of order) {
    if (await reachable(base)) {
      markOnline(base);
      return true;
    }
  }
  statusDot.title = "Cannot reach VocabMaster";
  return false;
}

// ── Login ───────────────────────────────────────────────────
loginBtn.addEventListener("click", doLogin);
loginPassword.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); doLogin(); }
});

async function doLogin() {
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  if (!email || !password) {
    loginError.textContent = "Ingresa email y contraseña.";
    loginError.style.display = "block";
    return;
  }
  loginBtn.disabled = true;
  loginBtn.textContent = "Entrando…";
  try {
    const res = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    await setToken(data.access_token);
    await setPinnedBase(API);  // el token solo vale en este backend
    loginPassword.value = "";
    showForm();
  } catch (err) {
    loginError.textContent = err.message;
    loginError.style.display = "block";
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Iniciar sesión";
  }
}

// ── Load categories from API ────────────────────────────────
async function loadCategories() {
  try {
    const res = await apiFetch(`/categories/`);
    if (!res.ok) return;
    const cats = await res.json();
    categorySelect.length = 1; // conserva la opción "None"
    cats.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = `${c.icon} ${c.name}`;
      categorySelect.appendChild(opt);
    });
  } catch {}
}

// ── Load captured word from context menu ────────────────────
async function loadCapturedWord() {
  const data = await chrome.storage.local.get(["capturedWord", "capturedAt"]);
  if (data.capturedWord && Date.now() - data.capturedAt < 30000) {
    wordInput.value = data.capturedWord;
    chrome.storage.local.remove(["capturedWord", "capturedAt"]);
    translationInput.focus();
  }
}

// ── Lookup (AI contextual translation) ─────────────────────
lookupBtn.addEventListener("click", async () => {
  const word = wordInput.value.trim();
  if (!word) {
    showError("Escribe una palabra primero.");
    wordInput.focus();
    return;
  }

  lookupBtn.disabled = true;
  lookupPanel.classList.add("visible");
  lookupPanel.innerHTML = `<div class="lookup-loading">Buscando significados…</div>`;

  try {
    const res = await apiFetch(`/lookup/${encodeURIComponent(word.toLowerCase())}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    const data = await res.json();
    renderLookup(data);
  } catch (err) {
    lookupPanel.innerHTML = `<div class="lookup-error">⚠️ ${escHtml(err.message)}</div>`;
  } finally {
    lookupBtn.disabled = false;
  }
});

function renderLookup(data) {
  const meanings = data.meanings || [];
  const phrases  = data.common_phrases || [];

  if (meanings.length === 0 && phrases.length === 0) {
    lookupPanel.innerHTML = `<div class="lookup-error">Sin resultados.</div>`;
    return;
  }

  const badge = data.cached ? "💾" : "✨";
  let html = `<h4>${badge} ${escHtml(data.word)} ${data.phonetic ? `<span style="color:#64748b;font-weight:normal">${escHtml(data.phonetic)}</span>` : ""}</h4>`;

  meanings.forEach((m, i) => {
    const ex = (m.examples && m.examples[0]) || null;
    html += `
      <div class="lookup-meaning" data-idx="${i}" data-type="meaning">
        <div><span class="pos">${escHtml(m.part_of_speech || "")}</span><span class="tr">${escHtml(m.translation_es)}</span></div>
        ${m.definition_en ? `<div style="color:#cbd5e1;margin-top:2px">${escHtml(m.definition_en)}</div>` : ""}
        ${ex ? `<div class="ex">"${escHtml(ex.en)}" — ${escHtml(ex.es)}</div>` : ""}
      </div>
    `;
  });

  if (phrases.length) {
    html += `<h4 style="margin-top:8px">Frases comunes</h4>`;
    phrases.forEach((p) => {
      html += `
        <div class="lookup-meaning">
          <div><span class="tr">${escHtml(p.phrase)}</span> — <span style="color:#94a3b8">${escHtml(p.meaning_es)}</span></div>
          ${p.example_en ? `<div class="ex">"${escHtml(p.example_en)}"</div>` : ""}
        </div>
      `;
    });
  }

  html += `<div style="text-align:center;margin-top:6px;color:#64748b;font-size:10px">Click en un significado para usarlo</div>`;
  lookupPanel.innerHTML = html;

  // Click → fill fields with the chosen meaning
  lookupPanel.querySelectorAll('.lookup-meaning[data-type="meaning"]').forEach((el) => {
    el.addEventListener("click", () => {
      const m = meanings[parseInt(el.dataset.idx)];
      if (m.translation_es) translationInput.value = m.translation_es;
      const ex = (m.examples && m.examples[0]) || null;
      if (ex && !exampleInput.value.trim()) exampleInput.value = ex.en;
      lookupPanel.classList.remove("visible");
    });
  });
}

// ── Save word ───────────────────────────────────────────────
saveBtn.addEventListener("click", async () => {
  const word = wordInput.value.trim();
  const translation = translationInput.value.trim();

  if (!word || !translation) {
    showError("Word and translation are required.");
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Saving…";

  try {
    const body = {
      word,
      translation,
      example: exampleInput.value.trim() || null,
      category_id: categorySelect.value ? parseInt(categorySelect.value) : null,
      difficulty: parseInt(difficultySelect.value),
    };

    const res = await apiFetch(`/words/`, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to save");
    }

    // Show success
    $("#saved-word").textContent = word;
    formView.style.display = "none";
    successView.style.display = "block";
  } catch (err) {
    showError(err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save to VocabMaster";
  }
});

// ── Add another word ────────────────────────────────────────
$("#add-another").addEventListener("click", () => {
  wordInput.value = "";
  translationInput.value = "";
  exampleInput.value = "";
  difficultySelect.value = "3";
  lookupPanel.classList.remove("visible");
  lookupPanel.innerHTML = "";
  successView.style.display = "none";
  formView.style.display = "block";
  wordInput.focus();
});

// ── Allow Enter key to save (solo dentro del formulario) ────
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && formView.style.display !== "none") {
    e.preventDefault();
    saveBtn.click();
  }
});

// ── Helpers ─────────────────────────────────────────────────
function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = "block";
  setTimeout(() => (errorMsg.style.display = "none"), 4000);
}

// ── Init ────────────────────────────────────────────────────
async function init() {
  await loadToken();
  const ok = await checkConnection();
  if (!ok) {
    showLogin("No se pudo conectar con el servidor.");
    return;
  }
  if (!token) {
    showLogin();
    return;
  }
  // Verifica que el token siga siendo válido.
  try {
    const res = await fetch(`${API}/auth/me`, { headers: authHeaders() });
    if (res.status === 401) {
      await clearToken();
      showLogin("Tu sesión expiró. Inicia sesión de nuevo.");
      return;
    }
    if (!res.ok) {
      showLogin("No se pudo verificar la sesión.");
      return;
    }
    // El token es válido en esta base: fijarla para futuras aperturas.
    await setPinnedBase(API);
  } catch {
    showLogin("No se pudo conectar con el servidor.");
    return;
  }
  showForm();
}

init();
