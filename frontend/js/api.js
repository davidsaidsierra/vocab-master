// ── API client — all calls to the FastAPI backend ────────────

const BASE = '/api';

function getApiKey() {
    return localStorage.getItem('vocab_api_key') || '';
}

async function request(path, options = {}) {
    const res = await fetch(`${BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'X-API-Key': getApiKey(),
            ...(options.headers || {}),
        },
    });
    if (res.status === 401) {
        const key = prompt('Ingresa tu API Key para acceder:');
        if (key) {
            localStorage.setItem('vocab_api_key', key);
            return request(path, options);
        }
        throw new Error('API Key requerida');
    }
    if (res.status === 204) return null;
    if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Error desconocido' }));
        throw new Error(err.detail || `HTTP ${res.status}`);
    }
    return res.json();
}

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
    overview:     () => request('/stats/overview'),
    byCategory:   () => request('/stats/by-category'),
    activity:     (days = 30) => request(`/stats/activity?days=${days}`),
    distribution: () => request('/stats/mastery-distribution'),
};

// ── Lookup (AI contextual translation) ──────────────────────
export const lookup = {
    get:        (word) => request(`/lookup/${encodeURIComponent(word.trim().toLowerCase())}`),
    invalidate: (word) => request(`/lookup/${encodeURIComponent(word.trim().toLowerCase())}`, { method: 'DELETE' }),
};

// ── Writing Challenge (AI text correction) ──────────────────
export const writing = {
    words:  (count = 4) => request(`/writing/words?count=${count}`),
    submit: (data) => request('/writing/submit', { method: 'POST', body: JSON.stringify(data) }),
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
