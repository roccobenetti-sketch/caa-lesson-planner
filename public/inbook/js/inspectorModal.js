/**
 * Pannello Modale Interattivo per la verifica, correzione e personalizzazione dei simboli IN-Book.
 * Permette di:
 * 1. Rigenerare il pittogramma con IA tramite richieste e associazioni specifiche dell'utente.
 * 2. Sostituire il simbolo cercando negli archivi web ufficiali (ARASAAC) o tra i sinonimi.
 * 3. Scegliere un simbolo dall'Archivio Personale o caricare un'immagine dal dispositivo.
 * 4. Modificare marcatori grammaticali IN-Book (+ plurale, <- passato, -> futuro) e unire/dividere box.
 */

import { StateStore } from './stateStore.js';
import { ArasaacService } from './arasaacService.js';
import { GeminiInbookService } from './geminiInbookService.js';
import { ConfigManager } from './config.js';

export const InspectorModal = {
  coords: null, // { pageIndex, sentenceIndex, tokenIndex }
  activeTab: 'ai', // 'ai' | 'arasaac' | 'custom' | 'grammar'
  generatedPreviewUrl: null,
  generatedPromptUsed: '',

  init() {
    const modalEl = document.getElementById('tokenInspectorModal');
    if (!modalEl) return;

    modalEl.addEventListener('click', evt => {
      if (evt.target === modalEl || evt.target.closest('[data-close-inspector]')) {
        this.close();
      }
    });
  },

  open(pageIndex, sentenceIndex, tokenIndex) {
    const token = StateStore.getToken(pageIndex, sentenceIndex, tokenIndex);
    if (!token) return;

    this.coords = { pageIndex, sentenceIndex, tokenIndex };
    this.generatedPreviewUrl = null;
    this.generatedPromptUsed = '';

    // Se la parola è ambigua su ARASAAC e ha alternative pronte, apri sulla tab ARASAAC, altrimenti su IA
    if (token.origin === 'arasaac' && token.needsVerification && (token.alternatives || []).length > 1) {
      this.activeTab = 'arasaac';
    } else {
      this.activeTab = 'ai';
    }

    this.render();
    const modalEl = document.getElementById('tokenInspectorModal');
    if (modalEl) {
      modalEl.classList.remove('hidden');
    }
  },

  close() {
    const modalEl = document.getElementById('tokenInspectorModal');
    if (modalEl) {
      modalEl.classList.add('hidden');
    }
    this.coords = null;
  },

  getSelectedScope() {
    const radio = document.querySelector('input[name="inspectorApplyScope"]:checked');
    return radio ? radio.value : 'book';
  },

  render() {
    const modalContent = document.getElementById('tokenInspectorBody');
    if (!modalContent || !this.coords) return;

    const { pageIndex, sentenceIndex, tokenIndex } = this.coords;
    const token = StateStore.getToken(pageIndex, sentenceIndex, tokenIndex);
    if (!token) return;

    const originBadge =
      token.origin === 'ai'
        ? `<span class="inspector-badge badge-ai">✨ Generato da IA</span>`
        : token.origin === 'custom'
          ? `<span class="inspector-badge badge-custom">👤 Simbolo Personale / Associato</span>`
          : `<span class="inspector-badge badge-arasaac">🌐 Archivio Web ARASAAC</span>`;

    modalContent.innerHTML = `
      <div class="inspector-header">
        <div class="inspector-current-preview">
          <img src="${token.imageUrl || ''}" alt="${token.label}" id="inspectorCurrentImg" />
          <div class="inspector-current-label">${token.label}</div>
        </div>
        <div class="inspector-header-info">
          <div class="inspector-badges-row">
            ${originBadge}
            ${token.needsVerification ? `<span class="inspector-badge badge-verify">⚠️ Da Verificare</span>` : `<span class="inspector-badge badge-verified">✓ Verificato</span>`}
          </div>
          <h3>Personalizza o Correggi Simbolo: "${token.label}"</h3>
          <p class="inspector-sub">Lemma rilevato: <strong>${token.lemma || token.label.toLowerCase()}</strong></p>

          <div class="inspector-scope-selector">
            <span class="scope-title">Dove vuoi applicare la modifica?</span>
            <div class="scope-options">
              <label class="scope-radio">
                <input type="radio" name="inspectorApplyScope" value="single" />
                <span>Solo in questo box</span>
              </label>
              <label class="scope-radio">
                <input type="radio" name="inspectorApplyScope" value="book" checked />
                <span>In tutto il libro (${token.label})</span>
              </label>
              <label class="scope-radio">
                <input type="radio" name="inspectorApplyScope" value="permanent" />
                <span>🌟 Associazione Permanente (usa sempre per "${token.label}")</span>
              </label>
            </div>
          </div>
        </div>
        <div class="inspector-header-actions">
          ${token.needsVerification ? `
            <button type="button" class="btn-verify-ok" id="btnMarkTokenVerified" title="Conferma che questo simbolo è corretto">
              ✓ Conferma Corretto
            </button>
          ` : ''}
          <button type="button" class="btn-close-modal" data-close-inspector title="Chiudi">✕</button>
        </div>
      </div>

      <div class="inspector-tabs">
        <button type="button" class="insp-tab ${this.activeTab === 'ai' ? 'active' : ''}" data-tab="ai">
          ✨ Crea con IA & Associazioni
        </button>
        <button type="button" class="insp-tab ${this.activeTab === 'arasaac' ? 'active' : ''}" data-tab="arasaac">
          🌐 Archivi Web (ARASAAC)
        </button>
        <button type="button" class="insp-tab ${this.activeTab === 'custom' ? 'active' : ''}" data-tab="custom">
          📁 Archivio Personale (${StateStore.state.customPictograms.length})
        </button>
        <button type="button" class="insp-tab ${this.activeTab === 'grammar' ? 'active' : ''}" data-tab="grammar">
          🔧 Testo, Grammatica & Unione Box
        </button>
      </div>

      <div class="inspector-tab-panel" id="inspectorTabContent">
        ${this.renderActiveTabContent(token)}
      </div>
    `;

    this.bindEvents(token);
  },

  renderActiveTabContent(token) {
    const defaultStyle = ConfigManager.state.preferences.defaultAiStyle || 'stylized';

    if (this.activeTab === 'ai') {
      const initialPrompt = token.aiPrompt || `${token.label} (rappresentazione chiara per lettura in simboli CAA)`;
      return `
        <div class="insp-ai-section">
          <div class="insp-form-col">
            <label class="insp-label" for="aiCustomPromptInput">
              Descrivi come vuoi il pittogramma per <strong>"${token.label}"</strong>:
            </label>
            <textarea id="aiCustomPromptInput" rows="3" class="insp-textarea" placeholder="Es: Bambino con gli occhiali e maglietta rossa che sorride, oppure: Foglia verde illuminata dal sole...">${initialPrompt}</textarea>

            <div class="insp-row-split">
              <div>
                <label class="insp-label" for="aiStyleSelect">Stile Grafico:</label>
                <select id="aiStyleSelect" class="insp-select">
                  <option value="stylized" ${defaultStyle === 'stylized' ? 'selected' : ''}>🎨 Pittogramma CAA (Stile ARASAAC / IN-Book)</option>
                  <option value="storybook" ${defaultStyle === 'storybook' ? 'selected' : ''}>🧚 Illustrazione Fiabesca Narrativa</option>
                  <option value="realistic" ${defaultStyle === 'realistic' ? 'selected' : ''}>📷 Realistico Dettagliato</option>
                </select>
              </div>
              <div class="insp-checkbox-wrap">
                <label class="insp-check-label">
                  <input type="checkbox" id="chkSaveToPersonalArchive" checked />
                  <span>Salva anche nel mio Archivio Personale</span>
                </label>
              </div>
            </div>

            <div class="insp-ai-buttons">
              <button type="button" class="btn-primary-ai" id="btnGenerateCustomAiPicto">
                ✨ Genera Nuovo Pittogramma con IA
              </button>
            </div>
            <div id="aiGenStatusMsg" class="insp-status-msg"></div>
          </div>

          <div class="insp-preview-col">
            <div class="ai-result-card" id="aiResultCard">
              ${this.generatedPreviewUrl ? `
                <img src="${this.generatedPreviewUrl}" alt="Anteprima IA" class="ai-generated-img" />
                <button type="button" class="btn-apply-success" id="btnApplyGeneratedAi">
                  ✓ Usa questo simbolo nel libro
                </button>
              ` : `
                <div class="ai-placeholder-box">
                  <span>✨</span>
                  <p>Scrivi la tua richiesta specifica e clicca su <strong>"Genera Nuovo Pittogramma con IA"</strong>.</p>
                </div>
              `}
            </div>
          </div>
        </div>
      `;
    }

    if (this.activeTab === 'arasaac') {
      const alts = token.alternatives || [];
      const altsHtml = alts.length > 0
        ? alts.map(alt => `
            <button type="button" class="picto-choice-card" data-select-arasaac-url="${alt.imageUrl}" data-select-arasaac-id="${alt.id}">
              <img src="${alt.imageUrl}" alt="${alt.keyword || token.label}" loading="lazy" />
              <span>${alt.keyword || token.lemma || token.label}</span>
            </button>
          `).join('')
        : `<p class="muted-hint">Cerca qualsiasi termine o sinonimo qui sopra per esplorare il catalogo ARASAAC.</p>`;

      return `
        <div class="insp-arasaac-section">
          <div class="arasaac-search-bar">
            <input type="text" id="arasaacLiveSearchInput" class="insp-input" value="${token.lemma || token.label.toLowerCase()}" placeholder="Cerca parola o sinonimo su ARASAAC (es. correre, casa, felice)..." />
            <button type="button" class="btn-secondary-action" id="btnRunArasaacSearch">
              🔍 Cerca negli Archivi Web
            </button>
          </div>

          <div class="arasaac-results-title">Simboli disponibili su ARASAAC (clicca per sostituire):</div>
          <div class="picto-choices-grid" id="arasaacChoicesGrid">
            ${altsHtml}
          </div>
        </div>
      `;
    }

    if (this.activeTab === 'custom') {
      const customList = StateStore.state.customPictograms || [];
      const associations = Object.values(StateStore.state.wordAssociations || {});

      const customCardsHtml = customList.length > 0
        ? customList.map(item => `
            <div class="picto-choice-card custom-archive-card" data-select-custom-url="${item.imageUrl}" data-select-custom-prompt="${item.prompt || item.name}">
              <img src="${item.imageUrl}" alt="${item.name}" loading="lazy" />
              <span>${item.name}</span>
              <button type="button" class="btn-del-custom" data-delete-custom-id="${item.id}" title="Rimuovi dall'archivio">✕</button>
            </div>
          `).join('')
        : `<p class="muted-hint">Non hai ancora simboli salvati nell'archivio personale. Generane uno nella scheda "✨ Crea con IA" o carica un'immagine qui sotto.</p>`;

      const assocHtml = associations.length > 0
        ? `
          <div class="associations-list-box">
            <h4>🔗 Regole di Associazione Permanente Attive (${associations.length})</h4>
            <div class="assoc-tags-wrap">
              ${associations.map(a => `
                <span class="assoc-chip">
                  <img src="${a.imageUrl}" alt="${a.word}" />
                  <strong>${a.word.toUpperCase()}</strong>
                  <button type="button" data-remove-assoc="${a.word}" title="Elimina regola di associazione">✕</button>
                </span>
              `).join('')}
            </div>
          </div>
        `
        : '';

      return `
        <div class="insp-custom-section">
          <div class="custom-toolbar">
            <input type="text" id="filterCustomArchiveInput" class="insp-input" placeholder="Filtra i tuoi simboli personali per nome..." />
            <label class="btn-upload-file">
              📤 Carica Immagine / Foto dal PC
              <input type="file" id="uploadCustomImageInput" accept="image/*" class="hidden" />
            </label>
          </div>

          <div class="picto-choices-grid" id="customArchiveGrid">
            ${customCardsHtml}
          </div>

          ${assocHtml}
        </div>
      `;
    }

    // Tab Grammar & Box structure
    return `
      <div class="insp-grammar-section">
        <div class="insp-row-split">
          <div>
            <label class="insp-label" for="editTokenLabelInput">Testo stampato nel Box IN-Book:</label>
            <input type="text" id="editTokenLabelInput" class="insp-input" value="${token.label}" />
          </div>
          <div>
            <label class="insp-label" for="editTokenLemmaInput">Lemma base / Sinonimo di ricerca:</label>
            <input type="text" id="editTokenLemmaInput" class="insp-input" value="${token.lemma || ''}" />
          </div>
        </div>

        <div class="insp-row-split" style="margin-top: 14px;">
          <div>
            <label class="insp-label" for="editTokenTenseSelect">Indicatore Tempo Verbale IN-Book:</label>
            <select id="editTokenTenseSelect" class="insp-select">
              <option value="none" ${token.tense === 'none' ? 'selected' : ''}>Nessun indicatore temporale</option>
              <option value="past" ${token.tense === 'past' ? 'selected' : ''}>← Tempo Passato (freccia indietro)</option>
              <option value="present" ${token.tense === 'present' ? 'selected' : ''}>Tempo Presente</option>
              <option value="future" ${token.tense === 'future' ? 'selected' : ''}>→ Tempo Futuro (freccia avanti)</option>
            </select>
          </div>
          <div class="insp-checkbox-wrap">
            <label class="insp-check-label">
              <input type="checkbox" id="editTokenPluralChk" ${token.plural ? 'checked' : ''} />
              <span>Mostra indicatore <strong>Plurale (+)</strong> nel box</span>
            </label>
          </div>
        </div>

        <div class="grammar-save-row">
          <button type="button" class="btn-apply-success" id="btnSaveGrammarChanges">
            💾 Salva Testo e Marcatori Grammaticali
          </button>
        </div>

        <hr class="insp-divider" />

        <h4>Operazioni Strutturali sul Box (Unità Polirematiche IN-Book)</h4>
        <div class="structural-buttons-row">
          <button type="button" class="btn-struct-action" id="btnMergeNextToken">
            🔗 Unisci con il box successivo
          </button>
          ${token.isCompound || token.label.includes(' ') ? `
            <button type="button" class="btn-struct-action" id="btnSplitToken">
              ✂️ Separa le parole in più box
            </button>
          ` : ''}
          <button type="button" class="btn-struct-action" id="btnInsertTokenAfter">
            ➕ Inserisci nuovo box dopo questo
          </button>
          <button type="button" class="btn-struct-action btn-danger-soft" id="btnDeleteCurrentToken">
            🗑️ Elimina questo box
          </button>
        </div>
      </div>
    `;
  },

  bindEvents(token) {
    const { pageIndex, sentenceIndex, tokenIndex } = this.coords;

    // Cambio tab
    document.querySelectorAll('.insp-tab').forEach(tabBtn => {
      tabBtn.addEventListener('click', () => {
        this.activeTab = tabBtn.dataset.tab;
        this.render();
      });
    });

    // Segna come verificato
    const verifyBtn = document.getElementById('btnMarkTokenVerified');
    if (verifyBtn) {
      verifyBtn.addEventListener('click', () => {
        StateStore.updateToken(this.coords, { needsVerification: false }, this.getSelectedScope());
        this.close();
      });
    }

    // TAB 1: Generazione con IA
    const genBtn = document.getElementById('btnGenerateCustomAiPicto');
    if (genBtn) {
      genBtn.addEventListener('click', async () => {
        const promptInput = document.getElementById('aiCustomPromptInput');
        const styleSelect = document.getElementById('aiStyleSelect');
        const statusEl = document.getElementById('aiGenStatusMsg');
        const customPrompt = promptInput ? promptInput.value.trim() : '';
        const chosenStyle = styleSelect ? styleSelect.value : 'stylized';

        if (!customPrompt) {
          if (statusEl) statusEl.textContent = '⚠️ Inserisci una descrizione per generare il pittogramma.';
          return;
        }

        genBtn.disabled = true;
        genBtn.textContent = '⏳ Generazione pittogramma IA in corso...';
        if (statusEl) statusEl.textContent = 'Disegno vettoriale in corso con Gemini IA...';

        try {
          const dataUri = await GeminiInbookService.generateAiPictogramSvg(customPrompt, chosenStyle);
          this.generatedPreviewUrl = dataUri;
          this.generatedPromptUsed = customPrompt;
          this.render();
        } catch (err) {
          if (statusEl) statusEl.textContent = `❌ Errore: ${err.message}`;
          genBtn.disabled = false;
          genBtn.textContent = '✨ Genera Nuovo Pittogramma con IA';
        }
      });
    }

    const applyAiBtn = document.getElementById('btnApplyGeneratedAi');
    if (applyAiBtn && this.generatedPreviewUrl) {
      applyAiBtn.addEventListener('click', () => {
        const saveArchive = document.getElementById('chkSaveToPersonalArchive')?.checked;
        const scope = this.getSelectedScope();

        if (saveArchive) {
          StateStore.saveCustomPictogram({
            name: token.label,
            imageUrl: this.generatedPreviewUrl,
            prompt: this.generatedPromptUsed || token.label,
            style: 'stylized'
          });
        }

        StateStore.updateToken(
          this.coords,
          {
            imageUrl: this.generatedPreviewUrl,
            origin: saveArchive || scope === 'permanent' ? 'custom' : 'ai',
            aiPrompt: this.generatedPromptUsed || token.aiPrompt,
            needsVerification: false
          },
          scope
        );
        this.close();
      });
    }

    // TAB 2: Ricerca ARASAAC
    const searchBtn = document.getElementById('btnRunArasaacSearch');
    const searchInput = document.getElementById('arasaacLiveSearchInput');
    if (searchBtn && searchInput) {
      const executeSearch = async () => {
        const query = searchInput.value.trim();
        if (!query) return;
        const gridEl = document.getElementById('arasaacChoicesGrid');
        if (gridEl) gridEl.innerHTML = `<p class="muted-hint">⏳ Ricerca su ARASAAC per "${query}"...</p>`;

        const results = await ArasaacService.searchPictograms(query);
        if (!gridEl) return;

        if (results.length === 0) {
          gridEl.innerHTML = `<p class="muted-hint">Nessun simbolo trovato su ARASAAC per "${query}". Prova con un sinonimo o usa la scheda "✨ Crea con IA".</p>`;
          return;
        }

        gridEl.innerHTML = results.slice(0, 20).map(item => {
          const url = ArasaacService.getPictogramImageUrl(item._id);
          const kw = item.keywords?.[0]?.keyword || query;
          return `
            <button type="button" class="picto-choice-card" data-select-arasaac-url="${url}" data-select-arasaac-id="${item._id}">
              <img src="${url}" alt="${kw}" loading="lazy" />
              <span>${kw}</span>
            </button>
          `;
        }).join('');

        this.bindArasaacChoiceCards();
      };

      searchBtn.addEventListener('click', executeSearch);
      searchInput.addEventListener('keydown', evt => {
        if (evt.key === 'Enter') {
          evt.preventDefault();
          executeSearch();
        }
      });
    }
    this.bindArasaacChoiceCards();

    // TAB 3: Archivio Personale & Upload
    document.querySelectorAll('[data-select-custom-url]').forEach(card => {
      card.addEventListener('click', evt => {
        if (evt.target.closest('[data-delete-custom-id]')) return;
        const url = card.dataset.selectCustomUrl;
        const prompt = card.dataset.selectCustomPrompt || token.label;
        StateStore.updateToken(
          this.coords,
          {
            imageUrl: url,
            origin: 'custom',
            aiPrompt: prompt,
            needsVerification: false
          },
          this.getSelectedScope()
        );
        this.close();
      });
    });

    document.querySelectorAll('[data-delete-custom-id]').forEach(delBtn => {
      delBtn.addEventListener('click', evt => {
        evt.stopPropagation();
        StateStore.deleteCustomPictogram(delBtn.dataset.deleteCustomId);
        this.render();
      });
    });

    document.querySelectorAll('[data-remove-assoc]').forEach(rmBtn => {
      rmBtn.addEventListener('click', () => {
        StateStore.removeWordAssociation(rmBtn.dataset.removeAssoc);
        this.render();
      });
    });

    const filterInput = document.getElementById('filterCustomArchiveInput');
    if (filterInput) {
      filterInput.addEventListener('input', () => {
        const q = filterInput.value.trim().toLowerCase();
        document.querySelectorAll('.custom-archive-card').forEach(card => {
          const text = card.textContent.toLowerCase();
          card.style.display = text.includes(q) ? '' : 'none';
        });
      });
    }

    const uploadInput = document.getElementById('uploadCustomImageInput');
    if (uploadInput) {
      uploadInput.addEventListener('change', evt => {
        const file = evt.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result);
          StateStore.saveCustomPictogram({
            name: token.label,
            imageUrl: dataUrl,
            prompt: `Immagine caricata per ${token.label}`,
            category: 'upload'
          });
          StateStore.updateToken(
            this.coords,
            {
              imageUrl: dataUrl,
              origin: 'custom',
              needsVerification: false
            },
            this.getSelectedScope()
          );
          this.close();
        };
        reader.readAsDataURL(file);
      });
    }

    // TAB 4: Grammatica e Struttura Box
    const saveGrammarBtn = document.getElementById('btnSaveGrammarChanges');
    if (saveGrammarBtn) {
      saveGrammarBtn.addEventListener('click', () => {
        const newLabel = document.getElementById('editTokenLabelInput')?.value.trim().toLocaleUpperCase('it-IT') || token.label;
        const newLemma = document.getElementById('editTokenLemmaInput')?.value.trim().toLowerCase() || token.lemma;
        const newTense = document.getElementById('editTokenTenseSelect')?.value || 'none';
        const newPlural = Boolean(document.getElementById('editTokenPluralChk')?.checked);

        StateStore.updateToken(
          this.coords,
          {
            label: newLabel,
            lemma: newLemma,
            tense: newTense,
            plural: newPlural,
            isCompound: newLabel.includes(' '),
            needsVerification: false
          },
          'single'
        );
        this.close();
      });
    }

    const mergeBtn = document.getElementById('btnMergeNextToken');
    if (mergeBtn) {
      mergeBtn.addEventListener('click', () => {
        if (StateStore.mergeWithNextToken(pageIndex, sentenceIndex, tokenIndex)) {
          this.render();
        }
      });
    }

    const splitBtn = document.getElementById('btnSplitToken');
    if (splitBtn) {
      splitBtn.addEventListener('click', () => {
        if (StateStore.splitCompoundToken(pageIndex, sentenceIndex, tokenIndex)) {
          this.close();
        }
      });
    }

    const insertBtn = document.getElementById('btnInsertTokenAfter');
    if (insertBtn) {
      insertBtn.addEventListener('click', () => {
        const newCoords = StateStore.insertTokenAfter(pageIndex, sentenceIndex, tokenIndex, 'PAROLA');
        if (newCoords) {
          this.open(newCoords.pageIndex, newCoords.sentenceIndex, newCoords.tokenIndex);
        }
      });
    }

    const deleteBtn = document.getElementById('btnDeleteCurrentToken');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', () => {
        if (StateStore.deleteToken(pageIndex, sentenceIndex, tokenIndex)) {
          this.close();
        }
      });
    }
  },

  bindArasaacChoiceCards() {
    document.querySelectorAll('[data-select-arasaac-url]').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.selectArasaacUrl;
        const id = btn.dataset.selectArasaacId;
        const scope = this.getSelectedScope();
        StateStore.updateToken(
          this.coords,
          {
            imageUrl: url,
            arasaacId: id,
            origin: scope === 'permanent' ? 'custom' : 'arasaac',
            needsVerification: false
          },
          scope
        );
        this.close();
      });
    });
  }
};
