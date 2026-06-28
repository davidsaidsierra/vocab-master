// ── Sesión: login, rol actual, logout y visibilidad por rol ──
import { auth as authApi, setToken, clearToken } from './api.js';

let currentUser = null;  // { id, email, role } o null

export function getCurrentUser() { return currentUser; }
export function getRole() { return currentUser ? currentUser.role : null; }

/** Carga el usuario actual desde /api/auth/me. En modo local abierto devuelve
 *  el admin local (no muestra login). Devuelve el usuario o null. */
export async function loadCurrentUser() {
    try { currentUser = await authApi.me(); }
    catch { currentUser = null; }
    return currentUser;
}

export function showLogin() {
    const el = document.getElementById('login-overlay');
    if (el) el.classList.add('visible');
}
export function hideLogin() {
    const el = document.getElementById('login-overlay');
    if (el) el.classList.remove('visible');
}

export function logout() {
    clearToken();
    currentUser = null;
    showLogin();
}

/** Aplica visibilidad según el rol: oculta acciones de IA a free y el panel
 *  admin a no-admin. Es puramente cosmético; el servidor es quien bloquea. */
export function applyRoleVisibility() {
    const role = getRole();
    const isAdmin = role === 'admin';
    const canAI = role === 'admin' || role === 'premium';
    document.querySelectorAll('[data-admin-only]').forEach(el => {
        el.style.display = isAdmin ? '' : 'none';
    });
    document.querySelectorAll('[data-requires-ai]').forEach(el => {
        el.style.display = canAI ? '' : 'none';
    });
    const label = document.getElementById('current-user-label');
    if (label) label.textContent = currentUser ? currentUser.email : '';
    const roleBadge = document.getElementById('current-user-role');
    if (roleBadge) roleBadge.textContent = role ? role : '';
}

/** Engancha el formulario de login una sola vez. */
export function initLoginForm(onSuccess) {
    const form = document.getElementById('login-form');
    const errEl = document.getElementById('login-error');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (errEl) errEl.textContent = '';
        const email = (document.getElementById('login-email').value || '').trim();
        const password = document.getElementById('login-password').value || '';
        const btn = form.querySelector('button[type="submit"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Entrando…'; }
        try {
            const res = await authApi.login(email, password);
            setToken(res.access_token);
            await loadCurrentUser();
            applyRoleVisibility();
            hideLogin();
            if (onSuccess) onSuccess();
        } catch (err) {
            if (errEl) errEl.textContent = err.message || 'Error al iniciar sesión';
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
        }
    });
}
