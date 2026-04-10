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
const formView        = $("#form-view");
const successView     = $("#success-view");

function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ── API Key ─────────────────────────────────────────────────
async function getApiKey() {
  const data = await chrome.storage.local.get("api_key");
  if (data.api_key) return data.api_key;
  const key = prompt("Ingresa tu API Key de VocabMaster:");
  if (key) {
    await chrome.storage.local.set({ api_key: key });
    return key;
  }
  return "";
}

function apiHeaders(key) {
  return { "Content-Type": "application/json", "X-API-Key": key };
}

// ── Check if VocabMaster server is running ──────────────────
// Tries local first (fast, no cold-start), falls back to Render.
async function checkConnection() {
  const key = await getApiKey();
  // 1. Try local
  try {
    const res = await fetch(`${API_LOCAL}/stats/overview`, {
      headers: apiHeaders(key),
      signal: AbortSignal.timeout(1500),
    });
    if (res.ok) {
      API = API_LOCAL;
      statusDot.classList.add("online");
      statusDot.title = "Connected (local)";
      return true;
    }
  } catch {}
  // 2. Fallback to Render
  try {
    const res = await fetch(`${API_REMOTE}/stats/overview`, { headers: apiHeaders(key) });
    if (res.ok) {
      API = API_REMOTE;
      statusDot.classList.add("online");
      statusDot.title = "Connected (Render)";
      return true;
    }
  } catch {}
  statusDot.title = "Cannot reach VocabMaster";
  return false;
}

// ── Load categories from API ────────────────────────────────
async function loadCategories() {
  try {
    const key = await getApiKey();
    const res = await fetch(`${API}/categories/`, { headers: apiHeaders(key) });
    const cats = await res.json();
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
    const key = await getApiKey();
    const res = await fetch(`${API}/lookup/${encodeURIComponent(word.toLowerCase())}`, {
      headers: apiHeaders(key),
    });
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

    const key = await getApiKey();
    const res = await fetch(`${API}/words/`, {
      method: "POST",
      headers: apiHeaders(key),
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
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
  formView.style.display = "block";
  successView.style.display = "none";
  wordInput.focus();
});

// ── Allow Enter key to save ─────────────────────────────────
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
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
// checkConnection must resolve first so API points to the right server.
checkConnection().then(() => {
  loadCategories();
  loadCapturedWord();
});
