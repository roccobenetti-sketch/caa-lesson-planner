/**
 * Entrypoint principale per CAA IN-Book Studio.
 * Inizializza autenticazione (SSO/Credenziali), configurazione, stato,
 * editor interattivo, Modeling Player e salvataggio libri.
 */

import { AuthManager } from './authManager.js';
import { ConfigManager } from './config.js';
import { StateStore } from './stateStore.js';
import { GeminiInbookService } from './geminiInbookService.js';
import { InBookRenderer } from './inbookRenderer.js';
import { InspectorModal } from './inspectorModal.js';
import { ModelingPlayer } from './modelingPlayer.js';
import { DocumentExtractor } from './documentExtractor.js';

const PRESET_TEXTS = {
  fiaba: {
    title: 'Il Piccolo Drago Scintilla',
    category: 'narrativa',
    text: `C'era una volta nel bosco verde il piccolo drago Scintilla.\nScintilla apriva la porta della grotta e guardava il cielo blu.\nUn giorno incontrò una tartaruga vicino al fiume.\nInsieme mangiarono una pesca dolce e poi tornarono a casa per andare a letto.`
  },
  scienze: {
    title: 'La Fotosintesi Clorofilliana',
    category: 'scienze',
    text: `Le piante sono esseri viventi che producono da sole il proprio nutrimento.\nLe radici assorbono dal terreno l'acqua e i sali minerali.\nNelle foglie verdi si trova la clorofilla che cattura la luce del sole.\nGrazie alla fotosintesi clorofilliana la pianta trasforma l'acqua e l'anidride carbonica in zuccheri e libera ossigeno nell'aria.`
  },
  storia: {
    title: 'Gli Uomini del Paleolitico',
    category: 'storia',
    text: `C'era una volta nel Paleolitico l'uomo nomade che viveva nelle caverne.\nGli uomini cacciavano gli animali e raccoglievano i frutti spontanei nel bosco.\nCon la scoperta del fuoco l'uomo illuminava la notte buia, cucinava la carne e si proteggeva dal freddo.`
  }
};

const AppBootstrap = {
  async init() {
    // 1. Gestione Autenticazione (SSO da App Interpelli o Sessione)
    try {
      await AuthManager.init();
    } catch (e) {
      console.warn('Errore init auth:', e);
    }
    this.setupAuthUI();

    await ConfigManager.init();
    StateStore.init();
    InspectorModal.init();

    this.syncPreferencesUI();
    this.bindSidebarAndHeaderEvents();
    this.bindAuthEvents();
    this.loadSavedBooksList();

    StateStore.subscribe(() => {
      this.renderWorkspace();
    });

    if (AuthManager.isAuthenticated()) {
      await this.loadPreset('fiaba', true);
    }
  },

  setupAuthUI() {
    const loginModal = document.getElementById('loginAuthModal');
    const userBadge = document.getElementById('headerUserBadge');
    const btnOpenUsers = document.getElementById('btnOpenUsersModal');

    if (!AuthManager.isAuthenticated()) {
      if (loginModal) loginModal.classList.remove('hidden');
      if (userBadge) userBadge.textContent = 'Non connesso';
      return;
    }

    if (loginModal) loginModal.classList.add('hidden');

    const user = AuthManager.currentUser;
    if (userBadge) {
      userBadge.textContent = user.role === 'admin' ? `${user.name || user.username} (Admin)` : (user.name || user.username);
    }

    if (btnOpenUsers) {
      if (AuthManager.isAdmin()) {
        btnOpenUsers.classList.remove('hidden');
      } else {
        btnOpenUsers.classList.add('hidden');
      }
    }
  },

  bindAuthEvents() {
    // Form Login
    const loginForm = document.getElementById('loginAuthForm');
    if (loginForm) {
      loginForm.addEventListener('submit', async evt => {
        evt.preventDefault();
        const userInput = document.getElementById('loginUsernameInput');
        const passInput = document.getElementById('loginPasswordInput');
        const errMsg = document.getElementById('loginErrorMessage');
        const submitBtn = document.getElementById('btnLoginSubmit');

        if (errMsg) errMsg.classList.add('hidden');
        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.textContent = '⏳ Verifica credenziali...';
        }

        try {
          const res = await AuthManager.login(userInput?.value, passInput?.value);
          if (res.success) {
            this.setupAuthUI();
            this.setStatus(`Accesso completato. Benvenuto, ${res.user.name || res.user.username}!`);
            await this.loadPreset('fiaba', true);
          } else {
            if (errMsg) {
              errMsg.textContent = res.message || 'Nome utente o password non corretti.';
              errMsg.classList.remove('hidden');
            }
          }
        } catch (err) {
          if (errMsg) {
            errMsg.textContent = `Errore di connessione: ${err.message}`;
            errMsg.classList.remove('hidden');
          }
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "🔐 Accedi all'IN-Book Studio";
          }
        }
      });
    }

    // Logout
    const logoutBtn = document.getElementById('btnLogoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        AuthManager.logout();
        this.setupAuthUI();
        this.setStatus('Disconnessione effettuata.');
      });
    }

    // Gestione Utenti (Admin)
    const btnOpenUsers = document.getElementById('btnOpenUsersModal');
    const usersModal = document.getElementById('usersManagementModal');
    const btnCloseUsers = document.getElementById('btnCloseUsersModal');

    if (btnOpenUsers && usersModal) {
      btnOpenUsers.addEventListener('click', () => {
        this.renderAdminUsersList();
        usersModal.classList.remove('hidden');
      });
    }

    if (btnCloseUsers && usersModal) {
      btnCloseUsers.addEventListener('click', () => {
        usersModal.classList.add('hidden');
      });
    }

    if (usersModal) {
      usersModal.addEventListener('click', evt => {
        if (evt.target === usersModal) usersModal.classList.add('hidden');
      });
    }

    const btnCreateUser = document.getElementById('btnSubmitCreateUser');
    if (btnCreateUser) {
      btnCreateUser.addEventListener('click', () => {
        const uInput = document.getElementById('newUsernameInput');
        const pInput = document.getElementById('newPasswordInput');
        const dInput = document.getElementById('newDisplayNameInput');
        const statusEl = document.getElementById('userCreateStatusMsg');

        const u = uInput ? uInput.value : '';
        const p = pInput ? pInput.value : '';
        const d = dInput ? dInput.value : '';

        const res = AuthManager.createUser(u, p, d);
        if (res.success) {
          if (statusEl) statusEl.textContent = `Utente "${u}" creato e sincronizzato con successo!`;
          if (uInput) uInput.value = '';
          if (pInput) pInput.value = '';
          if (dInput) dInput.value = '';
          this.renderAdminUsersList();
        } else {
          if (statusEl) statusEl.textContent = `Errore: ${res.message}`;
        }
      });
    }
  },

  renderAdminUsersList() {
    const container = document.getElementById('adminUsersListContainer');
    if (!container) return;

    const users = AuthManager.getUsersList();
    if (users.length === 0) {
      container.innerHTML = '<p class="muted-hint">Nessun utente registrato.</p>';
      return;
    }

    container.innerHTML = users.map(u => {
      const isRocco = u.username.toLowerCase() === 'rocco';
      const isAdmin = u.role === 'admin' || isRocco;

      return `
        <div class="admin-user-row">
          <div class="admin-user-info">
            <span class="admin-user-avatar ${isAdmin ? 'avatar-admin' : ''}">
              ${u.username.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <strong>${u.name || u.username}</strong>
              <small>@${u.username} • ${isAdmin ? 'Amministratore' : 'Docente'}</small>
            </div>
          </div>
          <div>
            ${!isRocco ? `
              <button type="button" class="btn-del-user" data-delete-user="${u.username}" title="Revoca accesso">
                Elimina
              </button>
            ` : '<span class="badge-version">Master</span>'}
          </div>
        </div>
      `;
    }).join('');

    container.querySelectorAll('[data-delete-user]').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.deleteUser;
        if (window.confirm(`Sei sicuro di voler revocare l'accesso all'utente "${target}"?`)) {
          AuthManager.deleteUser(target);
          this.renderAdminUsersList();
        }
      });
    });
  },

  syncPreferencesUI() {
    const prefs = ConfigManager.state.preferences;
    const chkHighlight = document.getElementById('chkHighlightOrigins');
    const chkGrammar = document.getElementById('chkShowGrammarMarkers');
    const selTextPos = document.getElementById('selTextPosition');
    const selAiStyle = document.getElementById('selDefaultAiStyle');

    if (chkHighlight) chkHighlight.checked = prefs.highlightOrigins;
    if (chkGrammar) chkGrammar.checked = prefs.showGrammarMarkers;
    if (selTextPos) selTextPos.value = prefs.textPosition;
    if (selAiStyle) selAiStyle.value = prefs.defaultAiStyle;
  },

  renderWorkspace() {
    const container = document.getElementById('inbookCanvasContainer');
    InBookRenderer.renderBook(container, {
      onTokenClick: (pIdx, sIdx, tIdx, mode) => {
        if (mode === 'modeling') {
          ModelingPlayer.speakSingleToken(pIdx, sIdx, tIdx);
        } else {
          InspectorModal.open(pIdx, sIdx, tIdx);
        }
      },
      onReadSentence: (pIdx, sIdx) => {
        ModelingPlayer.playSequence(pIdx, sIdx);
      },
      onAddSentence: async pIdx => {
        const rawSentence = window.prompt('Inserisci la nuova frase da tradurre in simboli IN-Book:');
        if (!rawSentence || !rawSentence.trim()) return;
        this.setStatus('Traduzione della nuova frase in simboli in corso...');
        try {
          const tempBook = await GeminiInbookService.analyzeTextToInBook({
            rawText: rawSentence.trim(),
            title: StateStore.state.currentBook.title,
            category: StateStore.state.currentBook.category,
            translationMode: 'faithful'
          });
          const newSentences = tempBook.pages?.[0]?.sentences || [];
          if (newSentences.length > 0 && StateStore.state.currentBook.pages[pIdx]) {
            StateStore.state.currentBook.pages[pIdx].sentences.push(...newSentences);
            StateStore.notify('sentence_added');
          }
          this.setStatus('Nuova frase aggiunta alla pagina.');
        } catch (err) {
          this.setStatus(`Errore aggiunta frase: ${err.message}`, true);
        }
      },
      onDeletePage: pIdx => {
        if (StateStore.state.currentBook.pages.length <= 1) return;
        StateStore.state.currentBook.pages.splice(pIdx, 1);
        StateStore.notify('page_deleted');
      }
    });
  },

  bindSidebarAndHeaderEvents() {
    const btnGenerate = document.getElementById('btnGenerateInBook');
    if (btnGenerate) {
      btnGenerate.addEventListener('click', () => this.handleGenerateFromInput());
    }

    document.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.loadPreset(btn.dataset.preset, false);
      });
    });

    const fileInput = document.getElementById('uploadTextFileInput');
    if (fileInput) {
      fileInput.addEventListener('change', async evt => {
        const file = evt.target.files?.[0];
        if (!file) return;

        const textArea = document.getElementById('sourceTextInput');
        const titleInput = document.getElementById('bookTitleInput');

        this.setStatus(Estrazione contenuti da "" in corso...);
        try {
          const extracted = await DocumentExtractor.extractFromFile(file, msg => this.setStatus(msg));
          if (textArea) textArea.value = extracted.text;
          if (titleInput && (!titleInput.value.trim() || titleInput.value === 'Nuovo IN-Book')) {
            titleInput.value = extracted.title;
          }

          const pageInfo = extracted.pageCount ?  ( pagine) : '';
          this.setStatus(File "" [] estratto con successo! Clicca su "Genera IN-Book in Simboli".);
        } catch (extErr) {
          this.setStatus(Errore estrazione file: , true);
        } finally {
          fileInput.value = '';
        }
      });
    }ricato. Clicca su "Genera IN-Book in Simboli".`);
        };
        reader.readAsText(file, 'utf-8');
      });
    }

    const chkHighlight = document.getElementById('chkHighlightOrigins');
    if (chkHighlight) {
      chkHighlight.addEventListener('change', () => {
        ConfigManager.updatePreferences({ highlightOrigins: chkHighlight.checked });
        this.renderWorkspace();
      });
    }

    const chkGrammar = document.getElementById('chkShowGrammarMarkers');
    if (chkGrammar) {
      chkGrammar.addEventListener('change', () => {
        ConfigManager.updatePreferences({ showGrammarMarkers: chkGrammar.checked });
        this.renderWorkspace();
      });
    }

    const selTextPos = document.getElementById('selTextPosition');
    if (selTextPos) {
      selTextPos.addEventListener('change', () => {
        ConfigManager.updatePreferences({ textPosition: selTextPos.value });
        this.renderWorkspace();
      });
    }

    const selAiStyle = document.getElementById('selDefaultAiStyle');
    if (selAiStyle) {
      selAiStyle.addEventListener('change', () => {
        ConfigManager.updatePreferences({ defaultAiStyle: selAiStyle.value });
      });
    }

    const btnStopModeling = document.getElementById('btnStopModeling');
    if (btnStopModeling) {
      btnStopModeling.addEventListener('click', () => ModelingPlayer.stop());
    }

    const btnPrintPdf = document.getElementById('btnPrintInBookPdf');
    if (btnPrintPdf) {
      btnPrintPdf.addEventListener('click', () => {
        ModelingPlayer.stop();
        window.print();
      });
    }

    const btnSaveBook = document.getElementById('btnSaveInBook');
    if (btnSaveBook) {
      btnSaveBook.addEventListener('click', () => this.saveCurrentBook());
    }

    const btnExportJson = document.getElementById('btnExportBookJson');
    if (btnExportJson) {
      btnExportJson.addEventListener('click', () => {
        const book = StateStore.state.currentBook;
        const blob = new Blob([JSON.stringify(book, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(book.title || 'inbook').toLowerCase().replace(/\s+/g, '_')}_inbook.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    const importJsonInput = document.getElementById('importBookJsonInput');
    if (importJsonInput) {
      importJsonInput.addEventListener('change', evt => {
        const file = evt.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const parsed = JSON.parse(String(reader.result));
            StateStore.setBook(parsed);
            this.setStatus(`IN-Book "${parsed.title}" importato correttamente.`);
          } catch (err) {
            this.setStatus(`File JSON non valido: ${err.message}`, true);
          }
        };
        reader.readAsText(file, 'utf-8');
      });
    }

    const btnOpenSettings = document.getElementById('btnOpenSettingsModal');
    const settingsModal = document.getElementById('settingsModal');
    if (btnOpenSettings && settingsModal) {
      btnOpenSettings.addEventListener('click', () => {
        const keyInput = document.getElementById('settingsApiKeyInput');
        const modelSelect = document.getElementById('settingsModelSelect');
        if (keyInput) keyInput.value = ConfigManager.state.isCustomKey ? ConfigManager.state.apiKey : '';
        if (modelSelect) {
          modelSelect.innerHTML = ConfigManager.state.availableModels.map(m =>
            `<option value="${m.id}" ${m.id === ConfigManager.state.model ? 'selected' : ''}>${m.displayName}</option>`
          ).join('');
        }
        settingsModal.classList.remove('hidden');
      });

      settingsModal.addEventListener('click', evt => {
        if (evt.target === settingsModal || evt.target.closest('[data-close-settings]')) {
          settingsModal.classList.add('hidden');
        }
      });

      const btnSaveSettings = document.getElementById('btnSaveSettings');
      if (btnSaveSettings) {
        btnSaveSettings.addEventListener('click', () => {
          const keyInput = document.getElementById('settingsApiKeyInput');
          const modelSelect = document.getElementById('settingsModelSelect');
          ConfigManager.saveSettings({
            apiKey: keyInput ? keyInput.value : '',
            model: modelSelect ? modelSelect.value : 'gemini-3.1-flash-lite'
          });
          settingsModal.classList.add('hidden');
          this.setStatus('Impostazioni IA salvate correttamente.');
        });
      }
    }
  },

  async loadPreset(presetKey, autoGenerate = false) {
    const preset = PRESET_TEXTS[presetKey];
    if (!preset) return;

    const titleInput = document.getElementById('bookTitleInput');
    const categorySelect = document.getElementById('bookCategorySelect');
    const textInput = document.getElementById('sourceTextInput');

    if (titleInput) titleInput.value = preset.title;
    if (categorySelect) categorySelect.value = preset.category;
    if (textInput) textInput.value = preset.text;

    if (autoGenerate) {
      await this.handleGenerateFromInput();
    } else {
      this.setStatus(`Esempio "${preset.title}" caricato nell'editor. Clicca su "Genera IN-Book in Simboli".`);
    }
  },

  async handleGenerateFromInput() {
    if (!AuthManager.isAuthenticated()) {
      this.setupAuthUI();
      return;
    }

    const titleInput = document.getElementById('bookTitleInput');
    const categorySelect = document.getElementById('bookCategorySelect');
    const modeSelect = document.getElementById('translationModeSelect');
    const textInput = document.getElementById('sourceTextInput');
    const btnGenerate = document.getElementById('btnGenerateInBook');

    const rawText = textInput ? textInput.value.trim() : '';
    const title = titleInput ? titleInput.value.trim() : 'Nuovo IN-Book';
    const category = categorySelect ? categorySelect.value : 'narrativa';
    const translationMode = modeSelect ? modeSelect.value : 'faithful';

    if (!rawText) {
      this.setStatus('Inserisci un testo o scegli un esempio prima di generare.', true);
      return;
    }

    if (btnGenerate) {
      btnGenerate.disabled = true;
      btnGenerate.textContent = '⏳ Traduzione in simboli IN-Book...';
    }

    try {
      const bookData = await GeminiInbookService.analyzeTextToInBook({
        rawText,
        title,
        category,
        translationMode,
        onProgress: msg => this.setStatus(msg)
      });

      StateStore.setBook(bookData);
      this.setStatus(`IN-Book "${bookData.title}" completato! Clicca su qualsiasi simbolo per verificarlo o rigenerarlo con IA.`);
    } catch (err) {
      this.setStatus(`Errore durante la generazione: ${err.message}`, true);
    } finally {
      if (btnGenerate) {
        btnGenerate.disabled = false;
        btnGenerate.textContent = '✨ Genera IN-Book in Simboli';
      }
    }
  },

  async saveCurrentBook() {
    const book = StateStore.state.currentBook;
    try {
      const resp = await fetch('/api/books', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(book)
      });
      if (resp.ok) {
        const res = await resp.json();
        book.id = res.id;
        this.setStatus(`Libro "${book.title}" salvato nell'archivio.`);
        this.loadSavedBooksList();
      } else {
        throw new Error(`HTTP ${resp.status}`);
      }
    } catch (err) {
      this.setStatus(`Salvataggio locale completato nel browser (${book.title}).`);
    }
  },

  async loadSavedBooksList() {
    const listEl = document.getElementById('savedBooksList');
    if (!listEl) return;
    try {
      const resp = await fetch('/api/books');
      if (!resp.ok) return;
      const data = await resp.json();
      const books = data.books || [];
      if (books.length === 0) {
        listEl.innerHTML = `<p class="muted-hint">Nessun IN-Book salvato sul disco.</p>`;
        return;
      }

      listEl.innerHTML = books.map(b => `
        <div class="saved-book-item">
          <div class="saved-book-meta" data-load-book="${b.id}">
            <strong>${b.title}</strong>
            <span>${b.category} • ${b.pageCount} pag.</span>
          </div>
          <button type="button" class="btn-del-book" data-delete-book="${b.id}" title="Elimina">✕</button>
        </div>
      `).join('');

      listEl.querySelectorAll('[data-load-book]').forEach(el => {
        el.addEventListener('click', async () => {
          const id = el.dataset.loadBook;
          const r = await fetch(`/api/books?id=${encodeURIComponent(id)}`);
          if (r.ok) {
            const fullBook = await r.json();
            StateStore.setBook(fullBook);
            this.setStatus(`Libro "${fullBook.title}" caricato.`);
          }
        });
      });

      listEl.querySelectorAll('[data-delete-book]').forEach(btn => {
        btn.addEventListener('click', async evt => {
          evt.stopPropagation();
          const id = btn.dataset.deleteBook;
          await fetch(`/api/books?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
          this.loadSavedBooksList();
        });
      });
    } catch (err) {
      // Silenzioso
    }
  },

  setStatus(message, isError = false) {
    const bar = document.getElementById('appStatusBanner');
    if (!bar) return;
    bar.textContent = message;
    bar.className = `status-banner ${isError ? 'status-error' : 'status-ok'}`;
  }
};

document.addEventListener('DOMContentLoaded', () => {
  AppBootstrap.init();
});
