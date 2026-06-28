import * as api from '../api.js';
import { toast } from '../utils/helpers.js';

const ROLES = ['free', 'premium', 'admin'];

export async function render(container) {
    container.innerHTML = `
        <div class="page-enter">
            <h2 class="text-2xl font-bold mb-1">Usuarios</h2>
            <p class="text-sm text-slate-500 mb-6">Solo tú (admin) puedes crear cuentas y asignar roles.</p>

            <!-- Crear usuario -->
            <div class="card mb-6 max-w-lg">
                <h3 class="text-sm font-semibold text-slate-400 mb-3">Nuevo usuario</h3>
                <form id="user-form" class="space-y-3">
                    <input type="email" name="email" class="form-input" placeholder="email@ejemplo.com" required>
                    <input type="password" name="password" class="form-input" placeholder="Contraseña (mín. 6)" minlength="6" required>
                    <select name="role" class="form-input">
                        <option value="free">free — sin IA</option>
                        <option value="premium">premium — con IA (cuota)</option>
                        <option value="admin">admin — total</option>
                    </select>
                    <button type="submit" class="btn-primary">Crear usuario</button>
                </form>
            </div>

            <!-- Lista -->
            <div id="user-list">
                <p class="text-slate-500">Cargando…</p>
            </div>
        </div>
    `;

    container.querySelector('#user-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        try {
            await api.admin.createUser({
                email: form.email.value.trim(),
                password: form.password.value,
                role: form.role.value,
            });
            toast('Usuario creado');
            form.reset();
            loadUsers();
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    async function loadUsers() {
        let users = [];
        try { users = await api.admin.listUsers(); }
        catch (err) { container.querySelector('#user-list').innerHTML = `<p class="text-red-500 text-sm">${err.message}</p>`; return; }

        const list = container.querySelector('#user-list');
        list.innerHTML = `
            <div class="space-y-2">
            ${users.map(u => `
                <div class="card flex items-center gap-4 ${u.is_active ? '' : 'opacity-50'}">
                    <div class="flex-1 min-w-0">
                        <h4 class="font-semibold truncate">${u.email}</h4>
                        <p class="text-xs text-slate-500">IA hoy: ${u.ai_calls_today} · ${u.is_active ? 'activo' : 'inactivo'}</p>
                    </div>
                    <select class="form-input role-sel" data-id="${u.id}" style="width:auto">
                        ${ROLES.map(r => `<option value="${r}" ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}
                    </select>
                    <button class="${u.is_active ? 'btn-danger' : 'btn-primary'} toggle-active" data-id="${u.id}" data-active="${u.is_active ? 1 : 0}">
                        ${u.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                </div>
            `).join('')}
            </div>
        `;

        list.querySelectorAll('.role-sel').forEach(sel => {
            sel.addEventListener('change', async () => {
                try {
                    await api.admin.updateUser(sel.dataset.id, { role: sel.value });
                    toast('Rol actualizado');
                    loadUsers();
                } catch (err) { toast(err.message, 'error'); loadUsers(); }
            });
        });
        list.querySelectorAll('.toggle-active').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await api.admin.updateUser(btn.dataset.id, { is_active: btn.dataset.active !== '1' });
                    toast('Usuario actualizado');
                    loadUsers();
                } catch (err) { toast(err.message, 'error'); }
            });
        });
    }

    await loadUsers();
}
