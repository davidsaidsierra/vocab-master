const API = "https://vocab-master-re2t.onrender.com/api";

const $ = (sel) => document.querySelector(sel);
const wordInput       = $("#word");
const translationInput = $("#translation");
const exampleInput    = $("#example");
const categorySelect  = $("#category");
const difficultySelect = $("#difficulty");
const saveBtn         = $("#save-btn");
const errorMsg        = $("#error-msg");
const statusDot       = $("#status-dot");
const formView        = $("#form-view");
const successView     = $("#success-view");

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
async function checkConnection() {
  try {
    const key = await getApiKey();
    const res = await fetch(`${API}/stats/overview`, { headers: apiHeaders(key) });
    if (res.ok) {
      statusDot.classList.add("online");
      statusDot.title = "Connected to VocabMaster";
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
checkConnection();
loadCategories();
loadCapturedWord();
