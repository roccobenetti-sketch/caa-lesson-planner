/**
 * Controller principale dell'applicazione CAA Lesson Planner.
 */

import { ConfigManager } from './config.js';
import { GeminiService } from './geminiService.js';
import { ArasaacService } from './arasaacService.js';
import { LessonRenderer } from './lessonRenderer.js';

class CAAApp {
  constructor() {
    this.selectedCardIndex = null;
    this.selectedTokenIndex = null;
  }

  async init() {
    await ConfigManager.init();
    this.setupUIBindings();
    this.updateConfigStatusUI();
    console.log('CAA Lesson Planner inizializzato.');
  }

  setupUIBindings() {
    // Gestione visualizzazione selettore classi Primaria
    const targetGradeInputs = document.querySelectorAll('input[name="targetGrade"]');
    const primaryGradeContainer = document.getElementById('primaryGradeContainer');
    targetGradeInputs.forEach(input => {
      input.addEventListener('change', (e) => {
        if (primaryGradeContainer) {
          if (e.target.value === 'primaria') {
            primaryGradeContainer.classList.remove('hidden');
          } else {
            primaryGradeContainer.classList.add('hidden');
          }
        }
      });
    });

    // Pulsante Genera
    const btnGenerate = document.getElementById('btnGenerate');
    if (btnGenerate) {
      btnGenerate.addEventListener('click', () => this.handleGenerate());
    }

    // Pulsante Stampa
    const btnPrint = document.getElementById('btnPrint');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => window.print());
    }

    // Pulsante Impostazioni
    const btnOpenSettings = document.getElementById('btnOpenSettings');
    const btnCloseSettings = document.getElementById('btnCloseSettings');
    const settingsModal = document.getElementById('settingsModal');

    if (btnOpenSettings && settingsModal) {
      btnOpenSettings.addEventListener('click', () => {
        this.populateSettingsForm();
        settingsModal.classList.remove('hidden');
      });
    }

    if (btnCloseSettings && settingsModal) {
      btnCloseSettings.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
      });
    }

    // Salvataggio Impostazioni
    const btnSaveSettings = document.getElementById('btnSaveSettings');
    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', () => this.handleSaveSettings());
    }

    // Reset Chiave API a default
    const btnResetApiKey = document.getElementById('btnResetApiKey');
    if (btnResetApiKey) {
      btnResetApiKey.addEventListener('click', () => {
        ConfigManager.resetToDefaultApiKey();
        this.populateSettingsForm();
        this.updateConfigStatusUI();
        this.showToast('Chiave reimpostata al valore predefinito di sistema.');
      });
    }

    // Quick Idea Chips
    document.querySelectorAll('.idea-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        const text = e.target.getAttribute('data-idea');
        const input = document.getElementById('promptInput');
        if (input && text) {
          input.value = text;
          input.focus();
        }
      });
    });

    // Toggles di visualizzazione (Maiuscolo e Bordi Colorati)
    const toggleUppercase = document.getElementById('toggleUppercase');
    if (toggleUppercase) {
      toggleUppercase.checked = ConfigManager.state.useUppercase;
      toggleUppercase.addEventListener('change', (e) => {
        ConfigManager.setUppercase(e.target.checked);
        if (LessonRenderer.currentLesson) {
          LessonRenderer.render(document.getElementById('printableArea'), LessonRenderer.currentLesson);
        }
      });
    }

    const toggleColors = document.getElementById('toggleColors');
    if (toggleColors) {
      toggleColors.checked = ConfigManager.state.useColorBorders;
      toggleColors.addEventListener('change', (e) => {
        ConfigManager.setColorBorders(e.target.checked);
        if (LessonRenderer.currentLesson) {
          LessonRenderer.render(document.getElementById('printableArea'), LessonRenderer.currentLesson);
        }
      });
    }

    // Ricerca Simboli Modale
    const btnCloseSearchModal = document.getElementById('btnCloseSearchModal');
    const searchModal = document.getElementById('searchModal');
    if (btnCloseSearchModal && searchModal) {
      btnCloseSearchModal.addEventListener('click', () => {
        searchModal.classList.add('hidden');
      });
    }

    const btnSearchArasaac = document.getElementById('btnSearchArasaac');
    const inputArasaacSearch = document.getElementById('inputArasaacSearch');
    if (btnSearchArasaac && inputArasaacSearch) {
      btnSearchArasaac.addEventListener('click', () => this.executeArasaacModalSearch());
      inputArasaacSearch.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.executeArasaacModalSearch();
      });
    }

    // Esportazione e Importazione JSON
    const btnExportJson = document.getElementById('btnExportJson');
    if (btnExportJson) {
      btnExportJson.addEventListener('click', () => this.exportLessonJson());
    }

    const fileImportJson = document.getElementById('fileImportJson');
    if (fileImportJson) {
      fileImportJson.addEventListener('change', (e) => this.importLessonJson(e));
    }
  }

  updateConfigStatusUI() {
    const keyBadge = document.getElementById('keyStatusBadge');
    if (keyBadge) {
      const activeKey = ConfigManager.getActiveApiKey();
      if (!activeKey) {
        keyBadge.className = 'px-2 py-0.5 text-xs rounded font-medium bg-red-100 text-red-700';
        keyBadge.textContent = 'Chiave Mancante';
      } else if (ConfigManager.state.isCustomKey) {
        keyBadge.className = 'px-2 py-0.5 text-xs rounded font-medium bg-emerald-100 text-emerald-800';
        keyBadge.textContent = 'Chiave Utente Attiva';
      } else {
        keyBadge.className = 'px-2 py-0.5 text-xs rounded font-medium bg-blue-100 text-blue-800';
        keyBadge.textContent = 'Chiave Predefinita';
      }
    }
  }

  populateSettingsForm() {
    const inputKey = document.getElementById('inputApiKey');
    const selectModel = document.getElementById('selectModel');
    if (inputKey) {
      inputKey.value = ConfigManager.getActiveApiKey();
    }
    if (selectModel) {
      selectModel.value = ConfigManager.state.model;
    }
  }

  handleSaveSettings() {
    const inputKey = document.getElementById('inputApiKey');
    const selectModel = document.getElementById('selectModel');

    if (inputKey) {
      ConfigManager.setApiKey(inputKey.value.trim());
    }
    if (selectModel) {
      ConfigManager.setModel(selectModel.value);
    }

    document.getElementById('settingsModal')?.classList.add('hidden');
    this.updateConfigStatusUI();
    this.showToast('Impostazioni salvate con successo.');
  }

  async handleGenerate() {
    const promptInput = document.getElementById('promptInput');
    const targetGrade = document.querySelector('input[name="targetGrade"]:checked')?.value || 'infanzia';
    const primaryClass = document.querySelector('input[name="primaryClass"]:checked')?.value || '1';
    const layoutType = document.getElementById('selectLayout')?.value || 'routine';
    const detailLevel = document.getElementById('selectDetailLevel')?.value || 'detailed';
    const promptIdea = promptInput?.value?.trim();

    if (!promptIdea) {
      this.showToast('Inserisci un\'idea o un progetto da realizzare.', 'error');
      promptInput?.focus();
      return;
    }

    const activeKey = ConfigManager.getActiveApiKey();
    if (!activeKey) {
      this.showToast('Inserisci prima una chiave API Gemini nelle impostazioni.', 'error');
      document.getElementById('btnOpenSettings')?.click();
      return;
    }

    this.setLoadingState(true, 'Analisi pedagogica e generazione del percorso CAA dettagliato con Gemini...');

    try {
      const lessonPlan = await GeminiService.generateLesson({
        promptIdea,
        targetGrade,
        primaryClass,
        layoutType,
        detailLevel
      });

      this.setLoadingState(true, 'Ricerca simboli ARASAAC e creazione pittogrammi vettoriali (0%)...');

      const fullLesson = await LessonRenderer.prepareLesson(lessonPlan, (progress) => {
        this.updateLoadingMessage(`Ricerca simboli ARASAAC e creazione pittogrammi vettoriali (${progress}%)...`);
      });

      const container = document.getElementById('printableArea');
      LessonRenderer.render(container, fullLesson);

      // Mostra la sezione delle azioni di stampa ed esportazione
      document.getElementById('lessonActions')?.classList.remove('hidden');
      document.getElementById('emptyState')?.classList.add('hidden');
      
      this.showToast('Lezione CAA generata con successo!');
      container.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
      console.error(err);
      this.showToast(err.message || 'Errore durante la generazione della lezione.', 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  openPictogramSelector(cardRef, tokenIndex) {
    this.selectedCardIndex = cardRef;
    this.selectedTokenIndex = tokenIndex;

    let token = null;
    if (cardRef === 'moral') {
      token = LessonRenderer.currentLesson?.moral?.tokens?.[tokenIndex];
    } else {
      token = LessonRenderer.currentLesson?.cards?.[cardRef]?.tokens?.[tokenIndex];
    }
    if (!token) return;

    const modal = document.getElementById('searchModal');
    const input = document.getElementById('inputArasaacSearch');
    const title = document.getElementById('searchModalTokenTitle');

    if (title) title.textContent = `Cambia simbolo per: "${token.displayWord}"`;
    if (input) input.value = token.searchTerm || token.displayWord;

    modal?.classList.remove('hidden');
    this.renderPictogramResults(token.alternatives || []);
    input?.focus();
  }

  async executeArasaacModalSearch() {
    const input = document.getElementById('inputArasaacSearch');
    const term = input?.value?.trim();
    if (!term) return;

    const resultsContainer = document.getElementById('arasaacSearchResults');
    if (resultsContainer) {
      resultsContainer.innerHTML = '<div class="col-span-full py-8 text-center text-slate-500 text-sm">Ricerca nel catalogo ARASAAC in corso...</div>';
    }

    try {
      const items = await ArasaacService.searchPictograms(term);
      const mapped = items.map(r => ({
        id: r._id,
        imageUrl: ArasaacService.getPictogramImageUrl(r._id)
      }));
      this.renderPictogramResults(mapped);
    } catch (err) {
      if (resultsContainer) {
        resultsContainer.innerHTML = `<div class="col-span-full py-6 text-center text-red-500 text-sm">Errore ricerca: ${err.message}</div>`;
      }
    }
  }

  renderPictogramResults(items) {
    const container = document.getElementById('arasaacSearchResults');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = '<div class="col-span-full py-8 text-center text-slate-400 text-sm">Nessun simbolo trovato. Prova con una parola diversa o un verbo all\'infinito.</div>';
      return;
    }

    container.innerHTML = items.map(item => `
      <div class="border border-slate-200 hover:border-blue-500 rounded-xl p-2 flex flex-col items-center justify-center cursor-pointer transition hover:shadow-md bg-white"
           onclick="window.app.applyNewPictogram(${item.id}, '${item.imageUrl}')">
        <img src="${item.imageUrl}" class="w-20 h-20 object-contain pointer-events-none" loading="lazy" alt="Simbolo" />
        <span class="text-[10px] text-slate-400 mt-1">ID: ${item.id}</span>
      </div>
    `).join('');
  }

  applyNewPictogram(pictogramId, imageUrl) {
    if (this.selectedCardIndex === null || this.selectedTokenIndex === null) return;
    LessonRenderer.updateTokenPictogram(this.selectedCardIndex, this.selectedTokenIndex, pictogramId, imageUrl);
    LessonRenderer.render(document.getElementById('printableArea'), LessonRenderer.currentLesson);
    document.getElementById('searchModal')?.classList.add('hidden');
    this.showToast('Simbolo aggiornato!');
  }

  /**
   * Modifica la frase scritta di una riga e ne ricrea i simboli CAA.
   */
  async updateRowFromInput(cardIndex) {
    const input = document.getElementById(`inputPhraseCard_${cardIndex}`);
    const newPhrase = input?.value?.trim();
    if (!newPhrase) {
      this.showToast('Inserisci un testo per aggiornare la riga.', 'error');
      return;
    }

    const card = LessonRenderer.currentLesson?.cards?.[cardIndex];
    if (!card) return;

    this.setLoadingState(true, `Conversione in simboli della riga ${cardIndex + 1}...`);
    try {
      const targetGrade = LessonRenderer.currentLesson?.targetGrade || 'primaria';
      const tokens = await GeminiService.convertSentenceToTokens(newPhrase, targetGrade);
      for (const t of tokens) {
        await LessonRenderer.populateToken(t);
      }
      card.stepLabel = newPhrase;
      card.tokens = tokens;
      LessonRenderer.render(document.getElementById('printableArea'), LessonRenderer.currentLesson);
      this.showToast(`Riga ${cardIndex + 1} aggiornata con successo!`);
    } catch (e) {
      this.showToast(`Errore aggiornamento riga: ${e.message}`, 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  /**
   * Sposta una riga verso l'alto (-1) o verso il basso (+1).
   */
  moveRow(cardIndex, direction) {
    const cards = LessonRenderer.currentLesson?.cards;
    if (!cards) return;
    const targetIndex = cardIndex + direction;
    if (targetIndex < 0 || targetIndex >= cards.length) return;

    const temp = cards[cardIndex];
    cards[cardIndex] = cards[targetIndex];
    cards[targetIndex] = temp;

    LessonRenderer.render(document.getElementById('printableArea'), LessonRenderer.currentLesson);
  }

  /**
   * Elimina un passaggio/riga.
   */
  deleteRow(cardIndex) {
    const cards = LessonRenderer.currentLesson?.cards;
    if (!cards || cardIndex < 0 || cardIndex >= cards.length) return;
    cards.splice(cardIndex, 1);
    LessonRenderer.render(document.getElementById('printableArea'), LessonRenderer.currentLesson);
    this.showToast('Passaggio rimosso.');
  }

  /**
   * Aggiorna in tempo reale il titolo della sezione morale.
   */
  updateMoralTitle(newTitle) {
    if (!LessonRenderer.currentLesson) return;
    if (!LessonRenderer.currentLesson.moral) {
      LessonRenderer.currentLesson.moral = { title: '', explanation: '', tokens: [] };
    }
    LessonRenderer.currentLesson.moral.title = newTitle;
  }

  /**
   * Aggiorna in tempo reale la spiegazione educativa della morale.
   */
  updateMoralExplanation(newExplanation) {
    if (!LessonRenderer.currentLesson) return;
    if (!LessonRenderer.currentLesson.moral) {
      LessonRenderer.currentLesson.moral = { title: '', explanation: '', tokens: [] };
    }
    LessonRenderer.currentLesson.moral.explanation = newExplanation;
  }

  /**
   * Rigenera i simboli CAA della morale a partire dalla frase scritta.
   */
  async updateMoralFromInput() {
    const input = document.getElementById('inputPhraseMoral');
    const phrase = input?.value?.trim();
    if (!phrase) {
      this.showToast('Scrivi una frase per i simboli della morale.', 'error');
      return;
    }

    if (!LessonRenderer.currentLesson) return;
    if (!LessonRenderer.currentLesson.moral) {
      LessonRenderer.currentLesson.moral = { title: "La Morale e l'Insegnamento Chiave", explanation: '', tokens: [] };
    }

    this.setLoadingState(true, 'Conversione in simboli della morale...');
    try {
      const targetGrade = LessonRenderer.currentLesson.targetGrade || 'primaria';
      const tokens = await GeminiService.convertSentenceToTokens(phrase, targetGrade);
      for (const t of tokens) {
        await LessonRenderer.populateToken(t);
      }
      LessonRenderer.currentLesson.moral.tokens = tokens;
      LessonRenderer.render(document.getElementById('printableArea'), LessonRenderer.currentLesson);
      this.showToast('Simboli della morale aggiornati con successo!');
    } catch (e) {
      this.showToast(`Errore aggiornamento morale: ${e.message}`, 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  /**
   * Rimuove la sezione morale dalla lezione.
   */
  deleteMoral() {
    if (!LessonRenderer.currentLesson) return;
    LessonRenderer.currentLesson.moral = null;
    LessonRenderer.render(document.getElementById('printableArea'), LessonRenderer.currentLesson);
    this.showToast('Sezione Morale rimossa.');
  }

  /**
   * Aggiunge la sezione morale alla lezione se assente.
   */
  async addMoral() {
    if (!LessonRenderer.currentLesson) return;
    this.setLoadingState(true, 'Creazione della sezione morale...');
    try {
      const defaultPhrase = "Impegno e pazienza portano sicurezza e gioia";
      const tokens = await GeminiService.convertSentenceToTokens(defaultPhrase);
      for (const t of tokens) {
        await LessonRenderer.populateToken(t);
      }
      LessonRenderer.currentLesson.moral = {
        title: "La Morale e l'Insegnamento Chiave",
        explanation: "Cosa abbiamo imparato da questa storia",
        tokens: tokens
      };
      LessonRenderer.render(document.getElementById('printableArea'), LessonRenderer.currentLesson);
      this.showToast('Sezione Morale aggiunta!');
    } catch (e) {
      this.showToast(`Errore: ${e.message}`, 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  /**
   * Aggiunge un singolo simbolo/parola alla fine di una riga o della morale.
   */
  async promptAddToken(cardRef) {
    if (!LessonRenderer.currentLesson) return;
    let targetTokens = null;

    if (cardRef === 'moral') {
      if (!LessonRenderer.currentLesson.moral) {
        LessonRenderer.currentLesson.moral = { title: "La Morale", explanation: '', tokens: [] };
      }
      LessonRenderer.currentLesson.moral.tokens = LessonRenderer.currentLesson.moral.tokens || [];
      targetTokens = LessonRenderer.currentLesson.moral.tokens;
    } else {
      const card = LessonRenderer.currentLesson.cards?.[cardRef];
      if (!card) return;
      card.tokens = card.tokens || [];
      targetTokens = card.tokens;
    }

    const word = prompt('Inserisci la parola da aggiungere:');
    if (!word || !word.trim()) return;

    this.setLoadingState(true, `Aggiunta del simbolo "${word}"...`);
    try {
      const tokens = await GeminiService.convertSentenceToTokens(word.trim());
      const token = tokens[0] || { displayWord: word.trim(), searchTerm: word.trim(), category: 'noun' };
      await LessonRenderer.populateToken(token);
      targetTokens.push(token);
      LessonRenderer.render(document.getElementById('printableArea'), LessonRenderer.currentLesson);
      this.showToast(`Parola "${word}" aggiunta!`);
    } catch (e) {
      this.showToast(`Errore: ${e.message}`, 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  /**
   * Elimina un singolo token da una riga o dalla morale.
   */
  deleteToken(cardRef, tokenIndex) {
    if (!LessonRenderer.currentLesson) return;
    if (cardRef === 'moral') {
      const tokens = LessonRenderer.currentLesson.moral?.tokens;
      if (tokens && tokenIndex >= 0 && tokenIndex < tokens.length) {
        tokens.splice(tokenIndex, 1);
      }
    } else {
      const card = LessonRenderer.currentLesson.cards?.[cardRef];
      if (card && card.tokens && tokenIndex >= 0 && tokenIndex < card.tokens.length) {
        card.tokens.splice(tokenIndex, 1);
      }
    }
    LessonRenderer.render(document.getElementById('printableArea'), LessonRenderer.currentLesson);
  }

  /**
   * Inserisce una nuova riga/passaggio alla fine della sequenza e la converte in simboli CAA con l'IA.
   */
  async handleAddNewRow() {
    const input = document.getElementById('inputNewRowPhrase');
    const phrase = input?.value?.trim();
    if (!phrase) {
      this.showToast('Scrivi una frase per la nuova riga.', 'error');
      input?.focus();
      return;
    }

    if (!LessonRenderer.currentLesson) {
      this.showToast('Genera prima un progetto per aggiungere righe.', 'error');
      return;
    }

    this.setLoadingState(true, 'Creazione e conversione della nuova riga in simboli CAA...');
    try {
      const targetGrade = LessonRenderer.currentLesson.targetGrade || 'primaria';
      const tokens = await GeminiService.convertSentenceToTokens(phrase, targetGrade);
      for (const t of tokens) {
        await LessonRenderer.populateToken(t);
      }

      LessonRenderer.currentLesson.cards = LessonRenderer.currentLesson.cards || [];
      const newCard = {
        sectionTitle: 'Passaggi Aggiuntivi',
        stepLabel: phrase,
        pedagogicalExplanation: 'Passaggio personalizzato aggiunto dall\'insegnante',
        tokens: tokens
      };

      LessonRenderer.currentLesson.cards.push(newCard);
      LessonRenderer.render(document.getElementById('printableArea'), LessonRenderer.currentLesson);
      
      if (input) input.value = '';
      this.showToast('Nuova riga aggiunta con successo!');
      
      // Scroll sull'ultima riga aggiunta
      const container = document.getElementById('printableArea');
      container?.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      this.showToast(`Errore aggiunta riga: ${e.message}`, 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  exportLessonJson() {
    if (!LessonRenderer.currentLesson) return;
    const blob = new Blob([JSON.stringify(LessonRenderer.currentLesson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lezione-caa-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importLessonJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.cards || !data.title) {
          throw new Error('Formato JSON non riconosciuto per una lezione CAA.');
        }
        LessonRenderer.render(document.getElementById('printableArea'), data);
        document.getElementById('lessonActions')?.classList.remove('hidden');
        document.getElementById('emptyState')?.classList.add('hidden');
        this.showToast('Lezione caricata con successo!');
      } catch (err) {
        this.showToast(`Errore caricamento: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  setLoadingState(isLoading, message = '') {
    const loader = document.getElementById('loadingOverlay');
    const msgEl = document.getElementById('loadingMessage');
    const btn = document.getElementById('btnGenerate');

    if (loader) {
      if (isLoading) {
        loader.classList.remove('hidden');
        if (msgEl) msgEl.textContent = message;
      } else {
        loader.classList.add('hidden');
      }
    }
    if (btn) btn.disabled = isLoading;
  }

  updateLoadingMessage(message) {
    const msgEl = document.getElementById('loadingMessage');
    if (msgEl) msgEl.textContent = message;
  }

  showToast(message, type = 'success') {
    const toast = document.getElementById('toastNotification');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `fixed bottom-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all duration-300 ${
      type === 'error' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white'
    }`;
    toast.classList.remove('hidden', 'opacity-0');

    setTimeout(() => {
      toast.classList.add('opacity-0');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 3500);
  }
}

// Inizializzazione globale
window.app = new CAAApp();
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
