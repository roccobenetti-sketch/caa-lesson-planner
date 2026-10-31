/**
 * Motore di rendering grafico per pagine e box simbolici secondo lo standard IN-Book.
 * Gestisce la riquadratura (framing), i marcatori morfologici (plurale/tempo),
 * i connettori polirematici e l'evidenziazione visiva dell'origine dei simboli (IA / Verifica / Personale).
 */

import { ConfigManager } from './config.js';
import { StateStore } from './stateStore.js';

export const InBookRenderer = {
  activeFilter: 'all', // 'all' | 'ai' | 'verify' | 'custom'
  interactionMode: 'edit', // 'edit' (apre Inspector al click) | 'modeling' (legge ad alta voce al click)

  /**
   * Calcola le statistiche dei simboli nel libro corrente per la barra di controllo qualità.
   */
  computeBookStats(book) {
    let total = 0;
    let aiCount = 0;
    let verifyCount = 0;
    let customCount = 0;
    let arasaacCount = 0;

    for (const page of book.pages || []) {
      for (const sentence of page.sentences || []) {
        for (const token of sentence.tokens || []) {
          total++;
          if (token.origin === 'ai') aiCount++;
          else if (token.origin === 'custom') customCount++;
          else arasaacCount++;

          if (token.needsVerification) verifyCount++;
        }
      }
    }

    return { total, aiCount, verifyCount, customCount, arasaacCount };
  },

  /**
   * Renderizza l'intero documento IN-Book nel contenitore specificato.
   */
  renderBook(containerEl, { onTokenClick, onReadSentence, onAddSentence, onDeletePage }) {
    if (!containerEl) return;
    const book = StateStore.state.currentBook;
    const prefs = ConfigManager.state.preferences;
    const modeling = StateStore.state.modeling;

    if (!book || !Array.isArray(book.pages) || book.pages.length === 0) {
      containerEl.innerHTML = `
        <div class="empty-inbook-state">
          <div class="empty-icon">📖</div>
          <h3>Nessun testo IN-Book caricato</h3>
          <p>Inserisci una frase, un racconto o un brano disciplinare a sinistra e clicca su <strong>"Genera IN-Book in Simboli"</strong>.</p>
        </div>
      `;
      return;
    }

    const stats = this.computeBookStats(book);

    const htmlPages = book.pages.map((page, pIdx) => {
      const sentencesHtml = (page.sentences || []).map((sentence, sIdx) => {
        const tokensHtml = (sentence.tokens || []).map((token, tIdx) => {
          return this.renderTokenBox(token, pIdx, sIdx, tIdx, prefs, modeling);
        }).join('');

        const isActiveSentence =
          modeling.isPlaying &&
          modeling.activePageIndex === pIdx &&
          modeling.activeSentenceIndex === sIdx;

        return `
          <div class="inbook-sentence-row ${isActiveSentence ? 'modeling-sentence-active' : ''}" data-page="${pIdx}" data-sentence="${sIdx}">
            <div class="inbook-tokens-flow">
              ${tokensHtml}
            </div>
            <div class="sentence-actions no-print">
              <button type="button" class="btn-sentence-tts" data-action="read-sentence" data-page="${pIdx}" data-sentence="${sIdx}" title="Ascolta e segui il Modeling di questa frase">
                🔊 Modeling Frase
              </button>
            </div>
          </div>
        `;
      }).join('');

      return `
        <article class="inbook-page-sheet" data-page-index="${pIdx}">
          <header class="inbook-page-header">
            <div class="inbook-page-title-wrap">
              <span class="inbook-page-badge">PAGINA ${pIdx + 1}</span>
              <h3 class="inbook-page-title" contenteditable="true" data-editable-page-title="${pIdx}" spellcheck="false">${this.escapeHtml(page.pageTitle || `Pagina ${pIdx + 1}`)}</h3>
            </div>
            <div class="inbook-page-controls no-print">
              <button type="button" class="btn-page-tool" data-action="read-page" data-page="${pIdx}" title="Avvia lettura Modeling dell'intera pagina">
                ▶️ Leggi Pagina
              </button>
              <button type="button" class="btn-page-tool" data-action="add-sentence" data-page="${pIdx}" title="Aggiungi una nuova frase a questa pagina">
                ➕ Frase
              </button>
              ${book.pages.length > 1 ? `
                <button type="button" class="btn-page-tool btn-danger-soft" data-action="delete-page" data-page="${pIdx}" title="Elimina questa pagina">
                  🗑️
                </button>
              ` : ''}
            </div>
          </header>

          <div class="inbook-page-body">
            ${sentencesHtml}
          </div>

          <footer class="inbook-page-footer">
            <span class="inbook-footer-book-title">${this.escapeHtml(book.title)}</span>
            <span class="inbook-footer-page-num">${pIdx + 1} / ${book.pages.length}</span>
          </footer>
        </article>
      `;
    }).join('');

    containerEl.innerHTML = `
      <div class="inbook-quality-bar no-print">
        <div class="quality-stats-group">
          <button type="button" class="stat-pill ${this.activeFilter === 'all' ? 'active' : ''}" data-filter="all">
            📚 Tutti i simboli: <strong>${stats.total}</strong>
          </button>
          <button type="button" class="stat-pill stat-ai ${this.activeFilter === 'ai' ? 'active' : ''}" data-filter="ai" title="Mostra/Evidenzia i pittogrammi generati dall'Intelligenza Artificiale">
            ✨ Generati da IA: <strong>${stats.aiCount}</strong>
          </button>
          <button type="button" class="stat-pill stat-verify ${this.activeFilter === 'verify' ? 'active' : ''}" data-filter="verify" title="Mostra le parole polisemiche o generate da verificare nel contesto">
            ⚠️ Da verificare: <strong>${stats.verifyCount}</strong>
          </button>
          <button type="button" class="stat-pill stat-custom ${this.activeFilter === 'custom' ? 'active' : ''}" data-filter="custom" title="Mostra i simboli personalizzati o con associazione specifica dell'utente">
            👤 Personali / Associati: <strong>${stats.customCount}</strong>
          </button>
        </div>

        <div class="quality-mode-switch">
          <button type="button" class="mode-btn ${this.interactionMode === 'edit' ? 'active' : ''}" data-mode="edit" title="Clicca su un simbolo per cambiarlo, rigenerarlo con IA o modificarne l'associazione">
            ✏️ Modalità Verifica & Modifica
          </button>
          <button type="button" class="mode-btn ${this.interactionMode === 'modeling' ? 'active' : ''}" data-mode="modeling" title="Clicca sui simboli per il Modeling (indicazione continua con voce)">
            👆 Modalità Lettura (Modeling)
          </button>
        </div>
      </div>

      <div class="inbook-cover-banner">
        <div class="cover-meta-badge">${this.escapeHtml((book.category || 'IN-BOOK').toUpperCase())} • MODELLO IN-BOOK CAA</div>
        <h2 class="inbook-main-title" id="editableBookTitle" contenteditable="true" spellcheck="false">${this.escapeHtml(book.title)}</h2>
        <p class="inbook-main-subtitle" id="editableBookSubtitle" contenteditable="true" spellcheck="false">${this.escapeHtml(book.subtitle)}</p>
      </div>

      <div class="inbook-pages-stack">
        ${htmlPages}
      </div>
    `;

    // Event delegation per click sui token, filtri e controlli di pagina
    this.bindRenderedEvents(containerEl, { onTokenClick, onReadSentence, onAddSentence, onDeletePage });
  },

  /**
   * Renderizza un singolo Box Simbolico IN-Book.
   */
  renderTokenBox(token, pIdx, sIdx, tIdx, prefs, modeling) {
    const highlight = prefs.highlightOrigins;
    const origin = token.origin || 'arasaac';
    const needsVerify = Boolean(token.needsVerification);

    let originClass = '';
    let originBadgeHtml = '';

    if (highlight) {
      if (origin === 'ai') {
        originClass = 'origin-ai';
        originBadgeHtml = `<span class="token-origin-badge badge-ai" title="Pittogramma generato da IA - Clicca per personalizzare o cambiare">✨ IA</span>`;
      } else if (origin === 'custom') {
        originClass = 'origin-custom';
        originBadgeHtml = `<span class="token-origin-badge badge-custom" title="Simbolo Personale / Associazione Utente">👤</span>`;
      } else if (needsVerify) {
        originClass = 'origin-verify';
        originBadgeHtml = `<span class="token-origin-badge badge-verify" title="Parola con più significati: clicca per verificare o cambiare simbolo">⚠️</span>`;
      }
    }

    // Filtro di messa in risalto
    let filterDimClass = '';
    if (this.activeFilter === 'ai' && origin !== 'ai') filterDimClass = 'token-dimmed';
    if (this.activeFilter === 'verify' && !needsVerify) filterDimClass = 'token-dimmed';
    if (this.activeFilter === 'custom' && origin !== 'custom') filterDimClass = 'token-dimmed';

    // Marcatori morfologici IN-Book (Tempo verbale e Plurale)
    let grammarMarkersHtml = '';
    if (prefs.showGrammarMarkers) {
      const tenseMarker =
        token.tense === 'past'
          ? `<span class="inbook-marker marker-tense-past" title="Tempo Passato">←</span>`
          : token.tense === 'future'
            ? `<span class="inbook-marker marker-tense-future" title="Tempo Futuro">→</span>`
            : '';

      const pluralMarker = token.plural
        ? `<span class="inbook-marker marker-plural" title="Plurale">+</span>`
        : '';

      if (tenseMarker || pluralMarker) {
        grammarMarkersHtml = `<div class="inbook-grammar-markers">${tenseMarker}${pluralMarker}</div>`;
      }
    }

    const isModelingActive =
      modeling.activePageIndex === pIdx &&
      modeling.activeSentenceIndex === sIdx &&
      modeling.activeTokenIndex === tIdx;

    const compoundClass = token.isCompound ? 'inbook-box-compound' : '';
    const textPosClass = prefs.textPosition === 'top' ? 'text-pos-top' : 'text-pos-bottom';
    const displayLabel = prefs.uppercaseLabels
      ? String(token.label || '').toLocaleUpperCase('it-IT')
      : String(token.label || '');

    return `
      <div class="inbook-token-box ${originClass} ${compoundClass} ${textPosClass} ${filterDimClass} ${isModelingActive ? 'modeling-token-active' : ''}"
           data-page="${pIdx}"
           data-sentence="${sIdx}"
           data-token="${tIdx}"
           tabindex="0"
           role="button"
           aria-label="Simbolo ${this.escapeHtml(displayLabel)}">
        ${originBadgeHtml}
        <div class="inbook-picto-frame">
          ${grammarMarkersHtml}
          <img src="${token.imageUrl || ''}" alt="${this.escapeHtml(displayLabel)}" class="inbook-picto-img" loading="lazy" />
        </div>
        ${token.isCompound ? `<div class="inbook-compound-connector" aria-hidden="true"></div>` : ''}
        <div class="inbook-token-label">${this.escapeHtml(displayLabel)}</div>
        ${isModelingActive ? `<div class="modeling-finger-indicator no-print" aria-hidden="true">👆</div>` : ''}
      </div>
    `;
  },

  bindRenderedEvents(containerEl, callbacks) {
    // Click sui filtri barra qualità
    containerEl.querySelectorAll('[data-filter]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.activeFilter = btn.dataset.filter || 'all';
        this.renderBook(containerEl, callbacks);
      });
    });

    // Switch modalità Edit vs Modeling
    containerEl.querySelectorAll('[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.interactionMode = btn.dataset.mode || 'edit';
        this.renderBook(containerEl, callbacks);
      });
    });

    // Click su un singolo box IN-Book
    containerEl.querySelectorAll('.inbook-token-box').forEach(boxEl => {
      boxEl.addEventListener('click', () => {
        const pIdx = Number(boxEl.dataset.page);
        const sIdx = Number(boxEl.dataset.sentence);
        const tIdx = Number(boxEl.dataset.token);
        if (callbacks.onTokenClick) {
          callbacks.onTokenClick(pIdx, sIdx, tIdx, this.interactionMode);
        }
      });

      boxEl.addEventListener('keydown', evt => {
        if (evt.key === 'Enter' || evt.key === ' ') {
          evt.preventDefault();
          boxEl.click();
        }
      });
    });

    // Azioni frasi e pagine
    containerEl.querySelectorAll('[data-action="read-sentence"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pIdx = Number(btn.dataset.page);
        const sIdx = Number(btn.dataset.sentence);
        if (callbacks.onReadSentence) callbacks.onReadSentence(pIdx, sIdx);
      });
    });

    containerEl.querySelectorAll('[data-action="read-page"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pIdx = Number(btn.dataset.page);
        if (callbacks.onReadSentence) callbacks.onReadSentence(pIdx, null);
      });
    });

    containerEl.querySelectorAll('[data-action="add-sentence"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pIdx = Number(btn.dataset.page);
        if (callbacks.onAddSentence) callbacks.onAddSentence(pIdx);
      });
    });

    containerEl.querySelectorAll('[data-action="delete-page"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pIdx = Number(btn.dataset.page);
        if (callbacks.onDeletePage) callbacks.onDeletePage(pIdx);
      });
    });

    // Modifica inline titolo e sottotitolo libro
    const titleEl = containerEl.querySelector('#editableBookTitle');
    if (titleEl) {
      titleEl.addEventListener('blur', () => {
        StateStore.state.currentBook.title = titleEl.textContent.trim() || 'IN-Book';
      });
    }
    const subEl = containerEl.querySelector('#editableBookSubtitle');
    if (subEl) {
      subEl.addEventListener('blur', () => {
        StateStore.state.currentBook.subtitle = subEl.textContent.trim();
      });
    }
    containerEl.querySelectorAll('[data-editable-page-title]').forEach(el => {
      el.addEventListener('blur', () => {
        const idx = Number(el.dataset.editablePageTitle);
        if (StateStore.state.currentBook.pages[idx]) {
          StateStore.state.currentBook.pages[idx].pageTitle = el.textContent.trim();
        }
      });
    });
  },

  escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
};
