import * as api from '../api.js';
import { masteryColor } from '../utils/helpers.js';

export async function render(container) {
    container.innerHTML = '<div class="page-enter" id="dash-page"><p class="text-slate-500">Loading…</p></div>';
    const page = container.querySelector('#dash-page');

    try {
        const [overview, byCat, activity, distribution] = await Promise.all([
            api.stats.overview(),
            api.stats.byCategory(),
            api.stats.activity(30),
            api.stats.distribution(),
        ]);

        page.innerHTML = `
            <h2 class="text-2xl font-bold mb-6">Dashboard</h2>

            <!-- Stat cards -->
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                ${statCard('Total Words', overview.total_words, '#8b5cf6', '#6d28d9', '📚')}
                ${statCard('Avg Mastery', overview.average_mastery + '%', '#10b981', '#047857', '🎯')}
                ${statCard('Due for Review', overview.due_for_review, '#f59e0b', '#d97706', '⏰')}
                ${statCard('Total Reviews', overview.total_reviews, '#ec4899', '#be185d', '✅')}
            </div>

            <!-- Charts row -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div class="card">
                    <h3 class="text-sm font-semibold text-slate-400 mb-4">Mastery Distribution</h3>
                    <canvas id="chart-distribution" height="200"></canvas>
                </div>
                <div class="card">
                    <h3 class="text-sm font-semibold text-slate-400 mb-4">Activity (Last 30 Days)</h3>
                    <canvas id="chart-activity" height="200"></canvas>
                </div>
            </div>

            <!-- Categories breakdown -->
            <div class="card">
                <h3 class="text-sm font-semibold text-slate-400 mb-4">Categories</h3>
                ${byCat.length === 0
                    ? '<p class="text-slate-600 text-sm">No categories yet. Add words to see your breakdown.</p>'
                    : `<div class="space-y-3">${byCat.map(c => categoryRow(c)).join('')}</div>`
                }
            </div>
        `;

        renderDistributionChart(distribution);
        renderActivityChart(activity);
    } catch (e) {
        page.innerHTML = `<p class="text-red-400">Error loading dashboard: ${e.message}</p>`;
    }
}

function statCard(label, value, from, to, icon) {
    return `
        <div class="stat-card" style="--stat-from:${from};--stat-to:${to}">
            <div class="text-2xl mb-3">${icon}</div>
            <div class="text-3xl font-bold">${value}</div>
            <div class="text-sm">${label}</div>
        </div>
    `;
}

function categoryRow(c) {
    const pct = Math.min(c.avg_mastery, 100);
    return `
        <div class="flex items-center gap-4">
            <span class="text-lg w-8 text-center">${c.icon}</span>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between text-sm mb-1">
                    <span class="font-medium">${c.name}</span>
                    <span class="text-slate-400">${c.word_count} words · ${c.avg_mastery}%</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-fill" style="width:${pct}%;background:${c.color}"></div>
                </div>
            </div>
        </div>
    `;
}

function renderDistributionChart(data) {
    const ctx = document.getElementById('chart-distribution');
    if (!ctx) return;
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: Object.keys(data),
            datasets: [{
                data: Object.values(data),
                backgroundColor: ['#ef4444', '#f97316', '#f59e0b', '#8b5cf6', '#10b981'],
                borderWidth: 0,
            }],
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#6e6e73', padding: 16, font: { size: 12 } } },
            },
        },
    });
}

function renderActivityChart(data) {
    const ctx = document.getElementById('chart-activity');
    if (!ctx) return;

    const last30 = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        const found = data.find(r => r.date === key);
        last30.push({ date: key, count: found ? found.count : 0 });
    }

    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: last30.map(d => d.date.slice(5)),
            datasets: [{
                label: 'Reviews',
                data: last30.map(d => d.count),
                backgroundColor: 'rgba(0, 113, 227, 0.55)',
                borderRadius: 4,
            }],
        },
        options: {
            responsive: true,
            scales: {
                x: { ticks: { color: '#86868b', maxRotation: 45, font: { size: 10 } }, grid: { display: false } },
                y: { ticks: { color: '#86868b', stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.05)' }, beginAtZero: true },
            },
            plugins: { legend: { display: false } },
        },
    });
}
