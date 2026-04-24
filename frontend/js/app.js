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

const app         = document.getElementById('app');
const navLinks    = document.querySelectorAll('.nav-link');
const bottomItems = document.querySelectorAll('.bottom-nav-item');

// ── Router ───────────────────────────────────────────────────
function navigate() {
    const hash = window.location.hash.slice(1) || '/dashboard';
    const renderFn = routes[hash] || renderDashboard;

    // Update active state in sidebar nav
    navLinks.forEach(link => {
        const isActive = hash === `/${link.dataset.page}`;
        link.classList.toggle('active', isActive);
    });

    // Update active state in bottom nav
    bottomItems.forEach(item => {
        const isActive = hash === `/${item.dataset.page}`;
        item.classList.toggle('active', isActive);
    });

    // Close sidebar drawer on navigation (mobile)
    closeSidebar();

    renderFn(app);
}

window.addEventListener('hashchange', navigate);
navigate();

// ── Mobile sidebar (hamburger drawer) ────────────────────────
const sidebar  = document.getElementById('sidebar');
const overlay  = document.getElementById('sidebar-overlay');
const hamburger = document.getElementById('hamburger-btn');

function openSidebar() {
    sidebar.classList.add('open');
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
    document.body.style.overflow = '';
}

hamburger.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});

overlay.addEventListener('click', closeSidebar);

// Close sidebar with Escape key
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
});

// ── View toggle (mobile ↔ desktop) ───────────────────────────
const MOBILE_VIEW_KEY = 'vocabmaster_mobile_view';
const viewToggleBtn   = document.getElementById('view-toggle-btn');
const iconDesktop     = document.getElementById('icon-desktop');
const iconMobile      = document.getElementById('icon-mobile');

function isMobileScreen() {
    return window.innerWidth <= 768;
}

/** Apply or remove the forced mobile-view class and update icon */
function applyViewMode(forceMobile) {
    if (forceMobile) {
        document.body.classList.add('mobile-view');
        // Button shows "switch to desktop" icon
        iconDesktop.style.display = 'inline';
        iconMobile.style.display  = 'none';
        viewToggleBtn.title = 'Cambiar a vista de escritorio';
    } else {
        document.body.classList.remove('mobile-view');
        // Button shows "switch to mobile" icon
        iconDesktop.style.display = 'none';
        iconMobile.style.display  = 'inline';
        viewToggleBtn.title = 'Cambiar a vista móvil';
    }
}

function initViewMode() {
    // On small screens → always mobile, no toggle needed
    if (isMobileScreen()) {
        applyViewMode(false); // CSS media query handles it
        viewToggleBtn.style.display = 'none'; // hide toggle on real mobile
        return;
    }

    // On desktop → check saved preference
    const saved = localStorage.getItem(MOBILE_VIEW_KEY);
    const forceMobile = saved === 'true';
    applyViewMode(forceMobile);
    viewToggleBtn.style.display = ''; // show toggle
}

viewToggleBtn.addEventListener('click', () => {
    const isMobile = document.body.classList.contains('mobile-view');
    const next = !isMobile;
    localStorage.setItem(MOBILE_VIEW_KEY, next);
    applyViewMode(next);
    // Close drawer if switching to desktop
    if (!next) closeSidebar();
});

// Re-evaluate on resize
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(initViewMode, 120);
});

initViewMode();

// ── Swipe to open/close sidebar (mobile) ─────────────────────
(function initSwipe() {
    let startX = 0;
    let startY = 0;

    document.addEventListener('touchstart', e => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - startX;
        const dy = e.changedTouches[0].clientY - startY;

        // Only horizontal swipes
        if (Math.abs(dy) > Math.abs(dx)) return;

        // Swipe right from left edge → open
        if (dx > 60 && startX < 30 && !sidebar.classList.contains('open')) {
            openSidebar();
        }
        // Swipe left → close
        if (dx < -60 && sidebar.classList.contains('open')) {
            closeSidebar();
        }
    }, { passive: true });
})();
