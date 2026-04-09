import * as api from '../api.js';
import { toast } from '../utils/helpers.js';

const PRESET_COLORS = [
    '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#3b82f6',
    '#ef4444', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];
const PRESET_ICONS = ['📚', '💼', '🎓', '🗣️', '✍️', '🧪', '🎭', '🌍', '💡', '🔧'];

export async function render(container) {
    container.innerHTML = `
        <div class="page-enter">
            <h2 class="text-2xl font-bold mb-6">Categories</h2>

            <!-- Add category form -->
            <div class="card mb-6 max-w-lg">
                <h3 class="text-sm font-semibold text-slate-400 mb-3">New Category</h3>
                <form id="cat-form" class="space-y-3">
                    <input type="text" name="name" class="form-input" placeholder="Category name…" required>
                    <div>
                        <label class="block text-xs text-slate-500 mb-1">Color</label>
                        <div class="flex gap-2 flex-wrap" id="color-picker">
                            ${PRESET_COLORS.map((c, i) => `
                                <button type="button" class="w-8 h-8 rounded-full border-2 transition-transform color-opt ${i === 0 ? 'border-white scale-110' : 'border-transparent'}" style="background:${c}" data-color="${c}"></button>
                            `).join('')}
                        </div>
                        <input type="hidden" name="color" value="${PRESET_COLORS[0]}">
                    </div>
                    <div>
                        <label class="block text-xs text-slate-500 mb-1">Icon</label>
                        <div class="flex gap-2 flex-wrap" id="icon-picker">
                            ${PRESET_ICONS.map((ic, i) => `
                                <button type="button" class="w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-all icon-opt ${i === 0 ? 'bg-slate-700 ring-2 ring-brand-500' : 'bg-slate-800'}" data-icon="${ic}">${ic}</button>
                            `).join('')}
                        </div>
                        <input type="hidden" name="icon" value="${PRESET_ICONS[0]}">
                    </div>
                    <button type="submit" class="btn-primary">Create Category</button>
                </form>
            </div>

            <!-- Existing categories -->
            <div id="cat-list" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <p class="text-slate-500">Loading…</p>
            </div>
        </div>
    `;

    // Color picker logic
    const colorPicker = container.querySelector('#color-picker');
    const colorInput = container.querySelector('[name="color"]');
    colorPicker.addEventListener('click', (e) => {
        const btn = e.target.closest('.color-opt');
        if (!btn) return;
        colorPicker.querySelectorAll('.color-opt').forEach(b => { b.classList.remove('border-white', 'scale-110'); b.classList.add('border-transparent'); });
        btn.classList.add('border-white', 'scale-110');
        btn.classList.remove('border-transparent');
        colorInput.value = btn.dataset.color;
    });

    // Icon picker logic
    const iconPicker = container.querySelector('#icon-picker');
    const iconInput = container.querySelector('[name="icon"]');
    iconPicker.addEventListener('click', (e) => {
        const btn = e.target.closest('.icon-opt');
        if (!btn) return;
        iconPicker.querySelectorAll('.icon-opt').forEach(b => { b.classList.remove('bg-slate-700', 'ring-2', 'ring-brand-500'); b.classList.add('bg-slate-800'); });
        btn.classList.add('bg-slate-700', 'ring-2', 'ring-brand-500');
        btn.classList.remove('bg-slate-800');
        iconInput.value = btn.dataset.icon;
    });

    // Form submit
    container.querySelector('#cat-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        try {
            await api.categories.create({
                name: form.name.value.trim(),
                color: form.color.value,
                icon: form.icon.value,
            });
            toast('Category created!');
            form.name.value = '';
            loadCategories();
        } catch (err) {
            toast(err.message, 'error');
        }
    });

    async function loadCategories() {
        const cats = await api.categories.list();
        const list = container.querySelector('#cat-list');
        if (cats.length === 0) {
            list.innerHTML = '<p class="text-slate-600 text-sm">No categories yet.</p>';
            return;
        }
        list.innerHTML = cats.map(c => `
            <div class="card flex items-center gap-4">
                <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl" style="background:${c.color}22">
                    ${c.icon}
                </div>
                <div class="flex-1">
                    <h4 class="font-semibold">${c.name}</h4>
                    <p class="text-xs text-slate-500">${c.word_count} word${c.word_count !== 1 ? 's' : ''}</p>
                </div>
                <button class="btn-danger delete-cat" data-id="${c.id}">Delete</button>
            </div>
        `).join('');

        list.querySelectorAll('.delete-cat').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm('Delete this category? Words in it will become uncategorized.')) return;
                try {
                    await api.categories.delete(btn.dataset.id);
                    toast('Category deleted');
                    loadCategories();
                } catch (err) {
                    toast(err.message, 'error');
                }
            });
        });
    }

    await loadCategories();
}
