// ── SPA Router ───────────────────────────────────────────────
import { render as renderDashboard }    from './components/dashboard.js';
import { render as renderWordList }     from './components/wordList.js';
import { render as renderWordForm }     from './components/wordForm.js';
import { render as renderFlashcards }   from './components/flashcards.js';
import { render as renderCategories }   from './components/categoriesPage.js';
import { render as renderQuickSummary } from './components/quickSummary.js';
import { render as renderEnglishClass } from './components/englishClass.js';

const routes = {
    '/dashboard':    renderDashboard,
    '/words':        renderWordList,
    '/add':          renderWordForm,
    '/review':       renderFlashcards,
    '/summary':      renderQuickSummary,
    '/categories':   renderCategories,
    '/english-class': renderEnglishClass,
};

const app = document.getElementById('app');
const navLinks = document.querySelectorAll('.nav-link');

function navigate() {
    const hash = window.location.hash.slice(1) || '/dashboard';
    const renderFn = routes[hash] || renderDashboard;

    // Update active nav link
    navLinks.forEach(link => {
        const page = link.dataset.page;
        const isActive = hash === `/${page}`;
        link.classList.toggle('active', isActive);
    });

    renderFn(app);
}

window.addEventListener('hashchange', navigate);
navigate();
