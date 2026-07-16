// ── API client — all calls to the FastAPI backend ────────────

const BASE = '/api';
const TOKEN_KEY = 'vocab_token';

export function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t) {
    if (t) localStorage.setItem(TOKEN_KEY, t);
}
export function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
}

async function request(path, options = {}) {
    const token = getToken();
    const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BASE}${path}`, { ...options, headers });

    if (res.status === 401) {
        // Token ausente/expirado → limpiar y pedir login. En modo local abierto
        // el backend nunca devuelve 401, así que esto no aparece en local.
        clearToken();
        window.dispatchEvent(new CustomEvent('auth:required'));
        throw new Error('Sesión requerida');
    }
    if (res.status === 204) return null;
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Error desconocido' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
}

// ── Auth ─────────────────────────────────────────────────────
export const auth = {
    login: (email, password) =>
        request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    me: () => request('/auth/me'),
};

// ── Admin (gestión de usuarios; solo rol admin) ──────────────
export const admin = {
    listUsers: () => request('/admin/users'),
    createUser: (data) => request('/admin/users', { method: 'POST', body: JSON.stringify(data) }),
    updateUser: (id, data) => request(`/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
};

// ── Words ────────────────────────────────────────────────────
export const words = {
    list:   (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return request(`/words/${qs ? '?' + qs : ''}`);
    },
    get:    (id) => request(`/words/${id}`),
    create: (data) => request('/words/', { method: 'POST', body: JSON.stringify(data) }),
    update: (id, data) => request(`/words/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id) => request(`/words/${id}`, { method: 'DELETE' }),
    quick:  (data) => request('/words/quick', { method: 'POST', body: JSON.stringify(data) }),
    pending: () => request('/words/pending'),
    enrichPending: () => request('/words/enrich-pending', { method: 'POST' }),
    backfillSynonyms: () => request('/words/backfill-synonyms', { method: 'POST' }),
    backfillLevels: () => request('/words/backfill-levels', { method: 'POST' }),
};

// ── Dictionary (offline bidireccional: autocompletado + traducción rápida) ──
// dir: "en-es" (por defecto) | "es-en"
export const dictionary = {
    suggest:   (q, dir = 'en-es') => request(`/dictionary/suggest?q=${encodeURIComponent(q.trim())}&limit=5&dir=${dir}`),
    translate: (word, dir = 'en-es') => request(`/dictionary/translate/${encodeURIComponent(word.trim().toLowerCase())}?dir=${dir}`),
};

// ── Categories ───────────────────────────────────────────────
export const categories = {
    list:   () => request('/categories/'),
    create: (data) => request('/categories/', { method: 'POST', body: JSON.stringify(data) }),
    delete: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
};

// ── Reviews ──────────────────────────────────────────────────
export const reviews = {
    practice: (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return request(`/reviews/practice${qs ? '?' + qs : ''}`);
    },
    submit: (data) => request('/reviews/', { method: 'POST', body: JSON.stringify(data) }),
};

// ── Stats ────────────────────────────────────────────────────
export const stats = {
    overview:      () => request('/stats/overview'),
    byCategory:    () => request('/stats/by-category'),
    activity:      (days = 30) => request(`/stats/activity?days=${days}`),
    distribution:  () => request('/stats/mastery-distribution'),
    byLevel:       () => request('/stats/by-level'),
    levelProgress: () => request('/stats/level-progress'),
};

// ── Lookup (AI contextual translation) ──────────────────────
export const lookup = {
    get:        (word) => request(`/lookup/${encodeURIComponent(word.trim().toLowerCase())}`),
    invalidate: (word) => request(`/lookup/${encodeURIComponent(word.trim().toLowerCase())}`, { method: 'DELETE' }),
    contextual: (word, context) => request('/lookup/contextual', { method: 'POST', body: JSON.stringify({ word, context }) }),
};

// ── Documents (lector de PDF) ────────────────────────────────
export const documents = {
    list:       () => request('/documents/'),
    byHash:     (hash) => request(`/documents/by-hash/${hash}`),
    create:     (data) => request('/documents/', { method: 'POST', body: JSON.stringify(data) }),
    update:     (id, data) => request(`/documents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
    delete:     (id) => request(`/documents/${id}`, { method: 'DELETE' }),
    upload:     async (id, file) => {
        const token = getToken();
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`${BASE}/documents/${id}/upload`, {
            method: 'POST',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
            body: form,
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ detail: 'Error al subir el PDF' }));
            throw new Error(err.detail || `HTTP ${res.status}`);
        }
        return res.json();
    },
    fileUrl:    (id) => `${BASE}/documents/${id}/file`,
    words:      (id) => request(`/documents/${id}/words`),
    annotations: {
        list:   (docId) => request(`/documents/${docId}/annotations`),
        create: (docId, data) => request(`/documents/${docId}/annotations`, { method: 'POST', body: JSON.stringify(data) }),
        update: (docId, annId, data) => request(`/documents/${docId}/annotations/${annId}`, { method: 'PATCH', body: JSON.stringify(data) }),
        delete: (docId, annId) => request(`/documents/${docId}/annotations/${annId}`, { method: 'DELETE' }),
    },
};

// ── Writing Challenge (AI text correction) ──────────────────
export const writing = {
    words:   (count = 4) => request(`/writing/words?count=${count}`),
    submit:  (data) => request('/writing/submit', { method: 'POST', body: JSON.stringify(data) }),
    history: (limit = 50) => request(`/writing/history?limit=${limit}`),
};

// ── International Exams (TOEFL Writing) ─────────────────────
export const exams = {
    list:        () => request('/exams/'),
    question:    (taskType, { mode = 'practice', generate = false } = {}) => {
        const qs = new URLSearchParams({ mode, generate: String(generate) });
        if (taskType) qs.set('task_type', taskType);
        return request(`/exams/toefl/writing/question?${qs.toString()}`);
    },
    createAttempt: (data) => request('/exams/attempts', { method: 'POST', body: JSON.stringify(data) }),
    gradeTask:   (attemptId, data) => request(`/exams/attempts/${attemptId}/grade-task`, { method: 'POST', body: JSON.stringify(data) }),
    finalize:    (attemptId) => request(`/exams/attempts/${attemptId}/finalize`, { method: 'POST' }),
    getAttempt:  (attemptId) => request(`/exams/attempts/${attemptId}`),
    history:     (limit = 20) => request(`/exams/history?limit=${limit}`),
};

// ── Grammar Knowledge Base ──────────────────────────────────
export const grammar = {
    topics:     (params = {}) => {
        const qs = new URLSearchParams(params).toString();
        return request(`/grammar/topics${qs ? '?' + qs : ''}`);
    },
    topic:      (slug) => request(`/grammar/topics/${encodeURIComponent(slug)}`),
    categories: () => request('/grammar/categories'),
};
