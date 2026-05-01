// ── SPA Router ───────────────────────────────────────────────
import { render as renderDashboard }    from './components/dashboard.js';
import { render as renderWordList }     from './components/wordList.js';
import { render as renderWordForm }     from './components/wordForm.js';
import { render as renderFlashcards }   from './components/flashcards.js';
import { render as renderCategories }   from './components/categoriesPage.js';
import { render as renderQuickSummary } from './components/quickSummary.js';
import { render as renderEnglishClass } from './components/englishClass.js';
import { render as renderWriting }      from './components/writingChallenge.js';

const routes = {
    '/dashboard':    renderDashboard,
    '/words':        renderWordList,
    '/add':          renderWordForm,
    '/review':       renderFlashcards,
    '/summary':      renderQuickSummary,
    '/categories':   renderCategories,
    '/english-class': renderEnglishClass,
    '/writing':      renderWriting,
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

/* ══════════════════════════════════════════════════════════════
   MOBILE ENHANCEMENTS — totalmente aditivo y defensivo
   - No toca `navigate()` ni el flujo del router
   - Todos los elementos DOM están null-checked
   - Todo envuelto en try/catch → si algo falla, el desktop
     sigue funcionando al 100%
   ══════════════════════════════════════════════════════════════ */
(function initMobile() {
    try {
        const body      = document.body;
        const sidebar   = document.getElementById('sidebar');
        const overlay   = document.getElementById('sidebar-overlay');
        const hamburger = document.getElementById('hamburger-btn');
        const toggles   = document.querySelectorAll('.js-view-toggle');
        const bnItems   = document.querySelectorAll('.bn-item');

        // ── Sidebar drawer helpers ──────────────────────────────
        function openDrawer() {
            if (sidebar) sidebar.classList.add('open');
            if (overlay) overlay.classList.add('visible');
        }
        function closeDrawer() {
            if (sidebar) sidebar.classList.remove('open');
            if (overlay) overlay.classList.remove('visible');
        }

        if (hamburger && sidebar) {
            hamburger.addEventListener('click', () => {
                sidebar.classList.contains('open') ? closeDrawer() : openDrawer();
            });
        }
        if (overlay) overlay.addEventListener('click', closeDrawer);

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') closeDrawer();
        });

        // ── Sync bottom nav + close drawer on navigation ───────
        function syncMobileNav() {
            try {
                const hash = window.location.hash.slice(1) || '/dashboard';
                bnItems.forEach(item => {
                    const page = item.dataset.page;
                    item.classList.toggle('active', hash === `/${page}`);
                });
                closeDrawer();
            } catch (_) { /* silent */ }
        }
        window.addEventListener('hashchange', syncMobileNav);
        syncMobileNav();

        // ── View mode toggle (móvil ↔ escritorio) ──────────────
        const VIEW_KEY = 'vocabmaster_view_mode';

        function applyMode(mode) {
            body.classList.remove('force-mobile', 'force-desktop');
            if (mode === 'mobile')  body.classList.add('force-mobile');
            if (mode === 'desktop') body.classList.add('force-desktop');
            updateToggleLabels();
        }

        function isMobileViewport() {
            return window.matchMedia('(max-width: 768px)').matches;
        }

        function currentlyMobileView() {
            if (body.classList.contains('force-mobile'))  return true;
            if (body.classList.contains('force-desktop')) return false;
            return isMobileViewport();
        }

        function updateToggleLabels() {
            const inMobile = currentlyMobileView();
            toggles.forEach(btn => {
                const label = btn.querySelector('span');
                if (label) {
                    label.textContent = inMobile ? 'Vista escritorio' : 'Vista móvil';
                }
                btn.title = inMobile
                    ? 'Cambiar a vista de escritorio'
                    : 'Cambiar a vista móvil';
            });
        }

        // Load saved preference
        const saved = localStorage.getItem(VIEW_KEY);
        if (saved === 'mobile' || saved === 'desktop') {
            applyMode(saved);
        } else {
            updateToggleLabels();
        }

        toggles.forEach(btn => {
            btn.addEventListener('click', () => {
                const inMobile = currentlyMobileView();
                const next = inMobile ? 'desktop' : 'mobile';
                localStorage.setItem(VIEW_KEY, next);
                applyMode(next);
                closeDrawer();
            });
        });

        // Re-evaluate labels on resize
        let resizeT;
        window.addEventListener('resize', () => {
            clearTimeout(resizeT);
            resizeT = setTimeout(updateToggleLabels, 150);
        });

        // ── Swipe to open/close sidebar (mobile) ───────────────
        let tsX = 0, tsY = 0;
        document.addEventListener('touchstart', e => {
            if (!e.touches || !e.touches[0]) return;
            tsX = e.touches[0].clientX;
            tsY = e.touches[0].clientY;
        }, { passive: true });
        document.addEventListener('touchend', e => {
            if (!e.changedTouches || !e.changedTouches[0]) return;
            const dx = e.changedTouches[0].clientX - tsX;
            const dy = e.changedTouches[0].clientY - tsY;
            if (Math.abs(dy) > Math.abs(dx)) return;
            if (!sidebar) return;
            if (dx > 60 && tsX < 30 && !sidebar.classList.contains('open')) openDrawer();
            else if (dx < -60 && sidebar.classList.contains('open')) closeDrawer();
        }, { passive: true });

    } catch (err) {
        console.warn('[VocabMaster] Mobile features disabled:', err);
    }
})();
