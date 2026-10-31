/**
 * Gestione Tema Giorno / Notte OLED per CAA Lesson Planner.
 * Supporta:
 * - Tasto rapido nell'header (Pill Giorno / Notte)
 * - Modalità Notte NERO OLED PURO (#000000)
 * - Mantenimento automatico dell'impostazione attiva in app (via sso_theme query param)
 * - Persistenza locale su localStorage
 */

const THEME_STORAGE_KEY = 'caa_planner_theme_mode';

export const ThemeManager = {
  currentTheme: 'light', // 'light' | 'dark'

  init() {
    // 1. Controlla parametro SSO dall'app Interpelli Scuola Mobile
    try {
      const params = new URLSearchParams(window.location.search);
      const ssoTheme = params.get('sso_theme');
      if (ssoTheme === 'dark' || ssoTheme === 'light') {
        this.applyTheme(ssoTheme, false);
        return;
      }
    } catch (_) {}

    // 2. Ripristina da memoria locale
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      if (saved === 'dark' || saved === 'light') {
        this.applyTheme(saved, false);
        return;
      }
    } catch (_) {}

    // 3. Fallback preferenza di sistema
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      this.applyTheme('dark', false);
    } else {
      this.applyTheme('light', false);
    }
  },

  toggle() {
    const nextTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
    this.applyTheme(nextTheme, true);
  },

  applyTheme(theme, save = true) {
    this.currentTheme = theme;
    const isDark = theme === 'dark';
    const root = document.documentElement;

    if (isDark) {
      root.classList.add('dark');
      root.classList.add('oled-theme');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.classList.remove('oled-theme');
      root.style.colorScheme = 'light';
    }

    if (save) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, theme);
      } catch (_) {}
    }

    this.updateToggleUi();
  },

  updateToggleUi() {
    const btn = document.getElementById('btnThemeToggle');
    if (!btn) return;
    const isDark = this.currentTheme === 'dark';
    btn.innerHTML = isDark 
      ? '<span class="text-amber-400">☀️</span><span class="font-bold text-xs text-white hidden sm:inline">Giorno</span>' 
      : '<span class="text-blue-900">🌙</span><span class="font-bold text-xs text-slate-800 hidden sm:inline">Notte</span>';
    btn.title = isDark ? 'Passa a Modalità Giorno' : 'Passa a Modalità Notte (Nero OLED)';
    btn.className = isDark
      ? 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-amber-500/60 bg-zinc-900 text-white shadow-sm transition'
      : 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-800 shadow-sm transition';
  }
};
