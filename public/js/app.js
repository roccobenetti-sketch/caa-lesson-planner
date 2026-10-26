/**
 * Controller principale dell'applicazione CAA Lesson Planner.
 */

import { ConfigManager } from './config.js';
import { GeminiService } from './geminiService.js';
import { ArasaacService } from './arasaacService.js';
import { LessonRenderer } from './lessonRenderer.js';
import { ProjectManager } from './projectManager.js';

class CAAApp {
  constructor() {
    this.selectedCardIndex = null;
    this.selectedTokenIndex = null;
    this.cachedProjects = [];
    this.currentProjectFilter = 'all';
    this.lastSavedSnapshot = null;
  }

  async init() {
    await ConfigManager.init();
    this.setupUIBindings();
    this.updateConfigStatusUI();
    await this.refreshProjectsCount();
    window.addEventListener('resize', () => {
      LessonRenderer.adjustAllTokenLabels(document.getElementById('printableArea'));
    });
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

    // Pulsante Stampa / PDF con pre-caricamento e rasterizzazione garantita di tutte le immagini
    const btnPrint = document.getElementById('btnPrint');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => this.handlePrint());
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

    // Gestione Tab Modale Simbolo (Catalogo ARASAAC vs Generatore IA)
    const tabBtnArasaac = document.getElementById('tabBtnArasaac');
    const tabBtnAiGenerator = document.getElementById('tabBtnAiGenerator');
    const tabContentArasaac = document.getElementById('tabContentArasaac');
    const tabContentAi = document.getElementById('tabContentAi');

    if (tabBtnArasaac && tabBtnAiGenerator && tabContentArasaac && tabContentAi) {
      tabBtnArasaac.addEventListener('click', () => {
        tabBtnArasaac.className = 'px-4 py-2 text-xs font-bold border-b-2 border-blue-600 text-blue-700 flex items-center gap-1.5 transition';
        tabBtnAiGenerator.className = 'px-4 py-2 text-xs font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition';
        tabContentArasaac.classList.remove('hidden');
        tabContentAi.classList.add('hidden');
      });

      tabBtnAiGenerator.addEventListener('click', () => {
        tabBtnAiGenerator.className = 'px-4 py-2 text-xs font-bold border-b-2 border-indigo-600 text-indigo-700 flex items-center gap-1.5 transition';
        tabBtnArasaac.className = 'px-4 py-2 text-xs font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition';
        tabContentAi.classList.remove('hidden');
        tabContentArasaac.classList.add('hidden');
        document.getElementById('inputAiPictogramPrompt')?.focus();
      });
    }

    // Bottone Generazione Simbolo con IA
    const btnGenerateAiPictogram = document.getElementById('btnGenerateAiPictogram');
    const inputAiPictogramPrompt = document.getElementById('inputAiPictogramPrompt');
    if (btnGenerateAiPictogram) {
      btnGenerateAiPictogram.addEventListener('click', () => this.handleGenerateAiPictogram());
    }
    if (inputAiPictogramPrompt) {
      inputAiPictogramPrompt.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.handleGenerateAiPictogram();
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

    const fileImportJsonModal = document.getElementById('fileImportJsonModal');
    if (fileImportJsonModal) {
      fileImportJsonModal.addEventListener('change', (e) => this.importLessonJson(e));
    }

    // Gestione Archivio Progetti
    const btnOpenProjectsModal = document.getElementById('btnOpenProjectsModal');
    if (btnOpenProjectsModal) {
      btnOpenProjectsModal.addEventListener('click', () => this.openProjectsModal());
    }

    const btnOpenProjectsModalFromBar = document.getElementById('btnOpenProjectsModalFromBar');
    if (btnOpenProjectsModalFromBar) {
      btnOpenProjectsModalFromBar.addEventListener('click', () => this.openProjectsModal());
    }

    const btnCloseProjectsModal = document.getElementById('btnCloseProjectsModal');
    if (btnCloseProjectsModal) {
      btnCloseProjectsModal.addEventListener('click', () => this.closeProjectsModal());
    }

    const btnCloseProjectsModalBottom = document.getElementById('btnCloseProjectsModalBottom');
    if (btnCloseProjectsModalBottom) {
      btnCloseProjectsModalBottom.addEventListener('click', () => this.closeProjectsModal());
    }

    const btnSaveCurrentProject = document.getElementById('btnSaveCurrentProject');
    if (btnSaveCurrentProject) {
      btnSaveCurrentProject.addEventListener('click', () => this.handleSaveCurrentProject());
    }

    // Chiusura progetto e ritorno a foglio bianco
    const btnHeaderCloseProject = document.getElementById('btnHeaderCloseProject');
    if (btnHeaderCloseProject) {
      btnHeaderCloseProject.addEventListener('click', () => this.requestCloseCurrentProject());
    }

    const btnCloseProject = document.getElementById('btnCloseProject');
    if (btnCloseProject) {
      btnCloseProject.addEventListener('click', () => this.requestCloseCurrentProject());
    }

    // Gestione modale modifiche non salvate
    const btnCancelCloseProject = document.getElementById('btnCancelCloseProject');
    if (btnCancelCloseProject) {
      btnCancelCloseProject.addEventListener('click', () => this.closeUnsavedChangesModal());
    }

    const btnDiscardAndCloseProject = document.getElementById('btnDiscardAndCloseProject');
    if (btnDiscardAndCloseProject) {
      btnDiscardAndCloseProject.addEventListener('click', () => {
        this.closeUnsavedChangesModal();
        this.doCloseProject();
        this.showToast('Progetto chiuso senza salvare le modifiche.');
      });
    }

    const btnSaveAndCloseProject = document.getElementById('btnSaveAndCloseProject');
    if (btnSaveAndCloseProject) {
      btnSaveAndCloseProject.addEventListener('click', async () => {
        try {
          if (LessonRenderer.currentLesson) {
            const res = await ProjectManager.saveProject(LessonRenderer.currentLesson);
            await this.refreshProjectsCount();
            this.showToast(`Progetto "${res.project.title}" salvato!`);
          }
          this.closeUnsavedChangesModal();
          this.doCloseProject();
        } catch (e) {
          this.showToast(`Errore salvataggio: ${e.message}`, 'error');
        }
      });
    }

    // Ricerca istantanea progetti
    const inputProjectSearch = document.getElementById('inputProjectSearch');
    if (inputProjectSearch) {
      inputProjectSearch.addEventListener('input', () => this.applyProjectsFilter());
    }

    // Filtri per ordine scolastico
    document.querySelectorAll('.project-filter-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.project-filter-btn').forEach(b => {
          b.className = 'project-filter-btn px-3 py-2 rounded-lg bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100';
        });
        e.currentTarget.className = 'project-filter-btn px-3 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200';
        this.currentProjectFilter = e.currentTarget.getAttribute('data-filter') || 'all';
        this.applyProjectsFilter();
      });
    });
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
      
      // Salvataggio automatico nell'archivio
      try {
        await ProjectManager.saveProject(fullLesson);
        await this.refreshProjectsCount();
      } catch (saveErr) {
        console.warn('Salvataggio automatico non riuscito:', saveErr);
      }

      this.markClean();
      this.showToast('Lezione CAA generata e salvata nell\'archivio!');
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
    const inputAiPrompt = document.getElementById('inputAiPictogramPrompt');
    const previewArea = document.getElementById('aiPictogramPreviewArea');

    if (title) title.textContent = `Cambia simbolo per: "${token.displayWord}"`;
    if (input) input.value = token.searchTerm || token.displayWord;
    if (inputAiPrompt) inputAiPrompt.value = token.displayWord || token.searchTerm || '';

    // Resetta l'anteprima IA
    if (previewArea) {
      previewArea.innerHTML = `
        <p class="text-xs text-slate-400">Nessun simbolo IA generato al momento. Personalizza la descrizione sopra e premi "Genera con IA".</p>
      `;
    }

    // Assicura che si apra sul tab ARASAAC
    const tabBtnArasaac = document.getElementById('tabBtnArasaac');
    const tabBtnAiGenerator = document.getElementById('tabBtnAiGenerator');
    const tabContentArasaac = document.getElementById('tabContentArasaac');
    const tabContentAi = document.getElementById('tabContentAi');
    if (tabBtnArasaac && tabBtnAiGenerator && tabContentArasaac && tabContentAi) {
      tabBtnArasaac.className = 'px-4 py-2 text-xs font-bold border-b-2 border-blue-600 text-blue-700 flex items-center gap-1.5 transition';
      tabBtnAiGenerator.className = 'px-4 py-2 text-xs font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition';
      tabContentArasaac.classList.remove('hidden');
      tabContentAi.classList.add('hidden');
    }

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
      container.innerHTML = '<div class="col-span-full py-8 text-center text-slate-400 text-sm">Nessun simbolo trovato nel catalogo. Puoi crearlo subito con la scheda "✨ Crea con IA"!</div>';
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

  /**
   * Genera un pittogramma SVG personalizzato tramite l'IA di Gemini.
   */
  async handleGenerateAiPictogram() {
    const input = document.getElementById('inputAiPictogramPrompt');
    const promptText = input?.value?.trim();
    if (!promptText) {
      this.showToast('Inserisci una descrizione per il simbolo IA.', 'error');
      return;
    }

    const previewArea = document.getElementById('aiPictogramPreviewArea');
    if (previewArea) {
      previewArea.innerHTML = `
        <div class="py-6 flex flex-col items-center justify-center space-y-3">
          <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p class="text-xs font-semibold text-slate-700">Creazione del pittogramma vettoriale con l'IA...</p>
        </div>
      `;
    }

    try {
      let category = 'misc';
      if (this.selectedCardIndex === 'moral') {
        category = LessonRenderer.currentLesson?.moral?.tokens?.[this.selectedTokenIndex]?.category || 'misc';
      } else if (this.selectedCardIndex !== null && this.selectedTokenIndex !== null) {
        category = LessonRenderer.currentLesson?.cards?.[this.selectedCardIndex]?.tokens?.[this.selectedTokenIndex]?.category || 'misc';
      }

      const svgDataUri = await GeminiService.generateAiPictogramSvg(promptText, category);
      
      if (previewArea) {
        previewArea.innerHTML = `
          <div class="flex flex-col sm:flex-row items-center gap-4 bg-white p-3 rounded-xl border border-indigo-100 shadow-sm w-full max-w-md mx-auto">
            <div class="w-24 h-24 border border-slate-200 rounded-xl p-1 bg-white flex items-center justify-center shrink-0 shadow-inner">
              <img src="${svgDataUri}" class="max-w-full max-h-full object-contain pointer-events-none" alt="Simbolo generato con IA" />
            </div>
            <div class="flex-1 text-left space-y-2">
              <div class="text-xs font-bold text-slate-800">Simbolo creato con successo!</div>
              <p class="text-[11px] text-slate-500 leading-tight">"${promptText}"</p>
              <button type="button" 
                      id="btnApplyAiPictogram"
                      class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5">
                <span>✅ Usa Questo Simbolo</span>
              </button>
            </div>
          </div>
        `;

        document.getElementById('btnApplyAiPictogram')?.addEventListener('click', () => {
          this.applyNewPictogram(`ai_${Date.now()}`, svgDataUri, true);
        });
      }

      this.showToast('Pittogramma generato dall\'IA!');
    } catch (err) {
      console.error(err);
      if (previewArea) {
        previewArea.innerHTML = `
          <div class="py-4 text-center space-y-2">
            <div class="text-xs font-bold text-red-600">Errore durante la generazione:</div>
            <p class="text-xs text-slate-600">${err.message || 'Verifica la chiave API nelle impostazioni.'}</p>
          </div>
        `;
      }
      this.showToast(`Errore IA: ${err.message}`, 'error');
    }
  }

  applyNewPictogram(pictogramId, imageUrl, isCustom = false) {
    if (this.selectedCardIndex === null || this.selectedTokenIndex === null) return;
    LessonRenderer.updateTokenPictogram(this.selectedCardIndex, this.selectedTokenIndex, pictogramId, imageUrl, isCustom);
    LessonRenderer.render(document.getElementById('printableArea'), LessonRenderer.currentLesson);
    document.getElementById('searchModal')?.classList.add('hidden');
    this.showToast('Simbolo aggiornato!');
  }

  /**
   * Modifica in tempo reale il titolo principale della lezione.
   */
  updateLessonTitle(newTitle) {
    if (!LessonRenderer.currentLesson) return;
    LessonRenderer.currentLesson.title = newTitle;
    const printEl = document.getElementById('printLessonTitle');
    if (printEl) printEl.textContent = newTitle;
  }

  /**
   * Modifica in tempo reale l'obiettivo pedagogico della lezione.
   */
  updateLessonContextSummary(newSummary) {
    if (!LessonRenderer.currentLesson) return;
    LessonRenderer.currentLesson.contextSummary = newSummary;
    const printEl = document.getElementById('printLessonContextSummary');
    if (printEl) printEl.textContent = newSummary;
  }

  /**
   * Modifica in tempo reale la guida per l'educatore.
   */
  updateLessonTeacherGuide(newGuide) {
    if (!LessonRenderer.currentLesson) return;
    LessonRenderer.currentLesson.teacherGuide = newGuide;
    const printEl = document.getElementById('printLessonTeacherGuide');
    if (printEl) printEl.textContent = newGuide;
  }

  /**
   * Modifica in tempo reale il titolo della sezione/fase.
   */
  updateSectionTitle(cardIndex, newTitle) {
    const card = LessonRenderer.currentLesson?.cards?.[cardIndex];
    if (!card) return;
    card.sectionTitle = newTitle;
    const printEl = document.getElementById(`printSectionTitle_${cardIndex}`);
    if (printEl) printEl.textContent = newTitle;
  }

  /**
   * Modifica in tempo reale la spiegazione pedagogica del passaggio.
   */
  updateCardPedagogicalExplanation(cardIndex, newExplanation) {
    const card = LessonRenderer.currentLesson?.cards?.[cardIndex];
    if (!card) return;
    card.pedagogicalExplanation = newExplanation;
  }

  /**
   * Modifica direttamente la parola visualizzata sopra una tessera CAA.
   */
  updateTokenWord(cardRef, tokenIndex, newWord) {
    const cleanWord = (newWord || '').trim();
    if (!cleanWord) return;

    let token = null;
    if (cardRef === 'moral') {
      token = LessonRenderer.currentLesson?.moral?.tokens?.[tokenIndex];
    } else {
      token = LessonRenderer.currentLesson?.cards?.[cardRef]?.tokens?.[tokenIndex];
    }
    if (!token) return;

    token.displayWord = cleanWord;
    LessonRenderer.adjustAllTokenLabels(document.getElementById('printableArea'));
  }

  /**
   * Prepara, rasterizza e garantisce il caricamento al 100% di tutte le immagini prima di aprire il print dialog / PDF.
   */
  async handlePrint() {
    this.setLoadingState(true, 'Verifica e rasterizzazione immagini per il PDF...');
    try {
      const container = document.getElementById('printableArea');
      if (container) {
        const images = Array.from(container.querySelectorAll('img'));
        
        // Disattiva qualsiasi ritardo di caricamento lazy
        images.forEach(img => {
          img.removeAttribute('loading');
          img.loading = 'eager';
        });

        // Attesa parallela del completamento e decodifica di ogni immagine
        await Promise.all(images.map(img => {
          if (img.complete && img.naturalWidth > 0) {
            if (img.decode) {
              return img.decode().catch(() => Promise.resolve());
            }
            return Promise.resolve();
          }

          return new Promise(resolve => {
            img.onload = () => {
              if (img.decode) {
                img.decode().then(resolve).catch(resolve);
              } else {
                resolve();
              }
            };
            img.onerror = () => {
              const word = img.getAttribute('alt') || 'simbolo';
              img.src = GeminiService.createProceduralSvgDataUri(word, 'misc');
              resolve();
            };
            setTimeout(resolve, 800);
          });
        }));

        // Breve pausa per permettere al motore grafico del browser di completare la rasterizzazione
        await new Promise(r => setTimeout(r, 200));
      }
    } catch (e) {
      console.warn('Errore pre-stampa:', e);
    } finally {
      this.setLoadingState(false);
    }

    window.print();
  }

  /**
   * Attiva o disattiva l'inclusione dell'obiettivo pedagogico nella stampa o nel PDF.
   */
  toggleContextSummaryPrint(shouldInclude) {
    if (!LessonRenderer.currentLesson) return;
    LessonRenderer.currentLesson.includeContextSummaryInPrint = shouldInclude;
    const el = document.getElementById('containerContextSummary');
    if (el) {
      if (shouldInclude) {
        el.classList.remove('card-excluded-print', 'opacity-75');
      } else {
        el.classList.add('card-excluded-print', 'opacity-75');
      }
    }
    const statusText = shouldInclude ? 'incluso nella stampa/PDF' : 'escluso dalla stampa/PDF';
    this.showToast(`Obiettivo pedagogico ${statusText}.`);
  }

  /**
   * Attiva o disattiva l'inclusione della guida per l'educatore nella stampa o nel PDF.
   */
  toggleTeacherGuidePrint(shouldInclude) {
    if (!LessonRenderer.currentLesson) return;
    LessonRenderer.currentLesson.includeTeacherGuideInPrint = shouldInclude;
    const el = document.getElementById('containerTeacherGuide');
    if (el) {
      if (shouldInclude) {
        el.classList.remove('card-excluded-print', 'opacity-75');
      } else {
        el.classList.add('card-excluded-print', 'opacity-75');
      }
    }
    const statusText = shouldInclude ? 'inclusa nella stampa/PDF' : 'esclusa dalla stampa/PDF';
    this.showToast(`Guida per l'educatore ${statusText}.`);
  }

  /**
   * Attiva o disattiva l'inclusione di un passaggio nella stampa o nel file PDF.
   */
  toggleCardPrint(cardIndex, shouldInclude) {
    const card = LessonRenderer.currentLesson?.cards?.[cardIndex];
    if (!card) return;
    card.includeInPrint = shouldInclude;

    const cardContainer = document.querySelector(`[data-card-index="${cardIndex}"]`);
    if (cardContainer) {
      if (shouldInclude) {
        cardContainer.classList.remove('opacity-70', 'bg-slate-50', 'border-dashed', 'border-slate-300', 'card-excluded-print');
        cardContainer.classList.add('bg-white');
      } else {
        cardContainer.classList.add('opacity-70', 'bg-slate-50', 'border-dashed', 'border-slate-300', 'card-excluded-print');
        cardContainer.classList.remove('bg-white');
      }
    }

    const statusText = shouldInclude ? 'incluso nella stampa/PDF' : 'escluso dalla stampa/PDF';
    this.showToast(`Passaggio ${cardIndex + 1} ${statusText}.`);
  }

  /**
   * Gestisce errori di caricamento immagine sostituendoli al volo con vettoriali garantiti.
   */
  handleImageError(imgElement, word, category) {
    if (!imgElement) return;
    imgElement.onerror = null;
    imgElement.src = GeminiService.createProceduralSvgDataUri(word, category);
  }

  /**
   * Modifica in tempo reale la descrizione del passaggio in alto (dopo il numero).
   */
  updateStepLabel(cardIndex, newLabel) {
    const card = LessonRenderer.currentLesson?.cards?.[cardIndex];
    if (!card) return;
    card.stepLabel = newLabel;
    const printEl = document.getElementById(`printStepLabel_${cardIndex}`);
    if (printEl) printEl.textContent = newLabel;
  }

  /**
   * Unisce i nuovi token generati con quelli già esistenti, preservando le immagini
   * già assegnate o personalizzate con l'IA per le parole non modificate.
   */
  mergeTokensPreservingExisting(newTokens, oldTokens = []) {
    if (!oldTokens || oldTokens.length === 0) return newTokens;
    const remainingOld = [...oldTokens];

    return newTokens.map(newToken => {
      const cleanNewDisplay = (newToken.displayWord || '').trim().toLowerCase();
      const cleanNewSearch = (newToken.searchTerm || '').trim().toLowerCase();

      // Cerca nei vecchi token uno che corrisponda alla parola e abbia già un'immagine valida
      const matchIdx = remainingOld.findIndex(ot => {
        const cleanOldDisplay = (ot.displayWord || '').trim().toLowerCase();
        const cleanOldSearch = (ot.searchTerm || '').trim().toLowerCase();
        const hasValidImg = ot.imageUrl && typeof ot.imageUrl === 'string' && ot.imageUrl.length > 10;
        return hasValidImg && (
          cleanOldDisplay === cleanNewDisplay ||
          cleanOldSearch === cleanNewSearch ||
          cleanOldDisplay === cleanNewSearch ||
          cleanOldSearch === cleanNewDisplay
        );
      });

      if (matchIdx !== -1) {
        const matched = remainingOld.splice(matchIdx, 1)[0];
        return {
          ...newToken,
          pictogramId: matched.pictogramId || newToken.pictogramId,
          imageUrl: matched.imageUrl,
          alternatives: matched.alternatives || newToken.alternatives || [],
          customImage: matched.customImage || false,
          category: matched.category || newToken.category
        };
      }
      return newToken;
    });
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
      const rawTokens = await GeminiService.convertSentenceToTokens(newPhrase, targetGrade);
      
      // Preservazione intelligente delle immagini già esistenti
      const mergedTokens = this.mergeTokensPreservingExisting(rawTokens, card.tokens);

      for (const t of mergedTokens) {
        if (!t.imageUrl) {
          await LessonRenderer.populateToken(t);
        }
      }

      if (!card.stepLabel) {
        card.stepLabel = newPhrase;
      }
      card.tokens = mergedTokens;
      LessonRenderer.render(document.getElementById('printableArea'), LessonRenderer.currentLesson);
      this.showToast(`Riga ${cardIndex + 1} aggiornata (simboli esistenti preservati)!`);
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
      const rawTokens = await GeminiService.convertSentenceToTokens(phrase, targetGrade);
      const mergedTokens = this.mergeTokensPreservingExisting(rawTokens, LessonRenderer.currentLesson.moral.tokens);

      for (const t of mergedTokens) {
        if (!t.imageUrl) {
          await LessonRenderer.populateToken(t);
        }
      }
      LessonRenderer.currentLesson.moral.tokens = mergedTokens;
      LessonRenderer.render(document.getElementById('printableArea'), LessonRenderer.currentLesson);
      this.showToast('Simboli della morale aggiornati (simboli esistenti preservati)!');
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

  /**
   * Aggiorna il contatore dei progetti salvati nell'header.
   */
  async refreshProjectsCount() {
    try {
      const projects = await ProjectManager.listProjects();
      this.cachedProjects = projects;
      const count = projects.length;
      const headerBadge = document.getElementById('projectsCountBadge');
      const modalBadge = document.getElementById('projectsModalCountBadge');
      if (headerBadge) headerBadge.textContent = String(count);
      if (modalBadge) modalBadge.textContent = `${count} ${count === 1 ? 'progetto' : 'progetti'}`;
    } catch (e) {
      console.warn('Errore refreshProjectsCount:', e);
    }
  }

  /**
   * Apre la finestra modale dell'archivio progetti.
   */
  async openProjectsModal() {
    const modal = document.getElementById('projectsModal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const searchInput = document.getElementById('inputProjectSearch');
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    this.currentProjectFilter = 'all';

    const container = document.getElementById('projectsListContainer');
    if (container) {
      container.innerHTML = '<div class="py-12 text-center text-slate-500 text-sm">Caricamento archivio progetti...</div>';
    }

    try {
      await this.refreshProjectsCount();
      this.applyProjectsFilter();
    } catch (e) {
      if (container) {
        container.innerHTML = `<div class="py-8 text-center text-red-500 text-sm">Errore caricamento archivio: ${e.message}</div>`;
      }
    }
  }

  /**
   * Chiude la finestra modale dell'archivio progetti.
   */
  closeProjectsModal() {
    document.getElementById('projectsModal')?.classList.add('hidden');
  }

  /**
   * Filtra la lista dei progetti per testo di ricerca e target scolastico.
   */
  applyProjectsFilter() {
    const searchInput = document.getElementById('inputProjectSearch');
    const term = (searchInput?.value || '').toLowerCase().trim();
    const filter = this.currentProjectFilter || 'all';

    let filtered = this.cachedProjects || [];

    if (filter !== 'all') {
      filtered = filtered.filter(p => (p.targetGrade || 'infanzia').toLowerCase() === filter);
    }

    if (term) {
      filtered = filtered.filter(p => {
        const titleMatch = (p.title || '').toLowerCase().includes(term);
        const subMatch = (p.subtitle || '').toLowerCase().includes(term);
        return titleMatch || subMatch;
      });
    }

    this.renderProjectsList(filtered);
  }

  /**
   * Renderizza le card dei progetti all'interno del modale.
   */
  renderProjectsList(projects) {
    const container = document.getElementById('projectsListContainer');
    if (!container) return;

    if (!projects || projects.length === 0) {
      container.innerHTML = `
        <div class="py-12 text-center text-slate-400">
          <svg class="w-12 h-12 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path>
          </svg>
          <p class="text-sm font-medium">Nessun progetto trovato per questa ricerca.</p>
          <p class="text-xs text-slate-400 mt-1">Prova a cambiare i filtri o genera un nuovo percorso con l'IA.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = projects.map(proj => {
      const isPrimaria = proj.targetGrade === 'primaria';
      const gradeBadgeText = isPrimaria
        ? `Primaria ${proj.primaryClass ? `(Classe ${proj.primaryClass}ª)` : ''}`
        : "Scuola dell'Infanzia";
      
      const gradeBadgeClass = isPrimaria
        ? 'bg-blue-100 text-blue-800 border-blue-200'
        : 'bg-emerald-100 text-emerald-800 border-emerald-200';

      const dateStr = proj.updatedAt || proj.createdAt;
      const formattedDate = dateStr
        ? new Date(dateStr).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : 'Non disponibile';

      const safeId = String(proj.id).replace(/'/g, "\\'");
      const safeTitle = (proj.title || '').replace(/'/g, "\\'");

      return `
        <div class="p-4 rounded-xl border border-slate-200 hover:border-blue-400 hover:shadow-md bg-white transition flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 flex-wrap mb-1">
              <span class="px-2 py-0.5 rounded-md text-[11px] font-bold border ${gradeBadgeClass}">
                ${gradeBadgeText}
              </span>
              <span class="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                ${proj.cardCount || 0} passaggi
              </span>
              ${proj.hasMoral ? '<span class="px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">✨ Morale</span>' : ''}
            </div>

            <h4 class="text-base font-bold text-slate-900 truncate">
              ${proj.title || 'Senza Titolo'}
            </h4>
            ${proj.subtitle ? `<p class="text-xs text-slate-500 line-clamp-1 mt-0.5">${proj.subtitle}</p>` : ''}
            
            <p class="text-[11px] text-slate-400 mt-1.5 flex items-center gap-1">
              <span>Modificato: ${formattedDate}</span>
            </p>
          </div>

          <div class="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
            <button type="button" onclick="window.app.loadProjectById('${safeId}')" class="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1.5" title="Carica subito questo progetto a video">
              <span>📂 Apri a video</span>
            </button>
            <button type="button" onclick="window.app.exportProjectById('${safeId}')" class="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs transition" title="Scarica il file JSON">
              ⬇️
            </button>
            <button type="button" onclick="window.app.deleteProjectById('${safeId}', '${safeTitle}')" class="p-2 border border-slate-200 hover:bg-red-50 text-red-600 hover:border-red-200 rounded-lg text-xs transition" title="Elimina dall'archivio">
              🗑️
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Richiama e visualizza immediatamente a video un progetto salvato.
   */
  async loadProjectById(projectId) {
    if (!projectId) return;

    this.setLoadingState(true, 'Caricamento progetto a video...');
    try {
      const fullLesson = await ProjectManager.getProject(projectId);
      
      // Assicura che i token abbiano i pittogrammi
      await LessonRenderer.prepareLesson(fullLesson);

      const container = document.getElementById('printableArea');
      LessonRenderer.render(container, fullLesson);

      document.getElementById('lessonActions')?.classList.remove('hidden');
      document.getElementById('emptyState')?.classList.add('hidden');

      this.closeProjectsModal();
      this.markClean();
      this.showToast(`Progetto "${fullLesson.title}" richiamato a video!`);

      // Scroll fluido verso la scheda didattica a video
      container.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      console.error(e);
      this.showToast(`Errore apertura progetto: ${e.message}`, 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  /**
   * Salva il progetto attualmente visualizzato a video nell'archivio.
   */
  async handleSaveCurrentProject() {
    if (!LessonRenderer.currentLesson) {
      this.showToast('Nessun percorso didattico attivo a video da salvare.', 'error');
      return;
    }

    this.setLoadingState(true, 'Salvataggio progetto in archivio...');
    try {
      const res = await ProjectManager.saveProject(LessonRenderer.currentLesson);
      await this.refreshProjectsCount();
      this.markClean();
      this.showToast(`Progetto "${res.project.title}" salvato nell'archivio!`);
    } catch (e) {
      this.showToast(`Errore salvataggio: ${e.message}`, 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  /**
   * Esporta un progetto specifico dall'archivio come file JSON.
   */
  async exportProjectById(projectId) {
    try {
      const project = await ProjectManager.getProject(projectId);
      ProjectManager.exportProjectFile(project);
      this.showToast(`Progetto "${project.title}" scaricato!`);
    } catch (e) {
      this.showToast(`Errore esportazione: ${e.message}`, 'error');
    }
  }

  /**
   * Elimina un progetto dall'archivio previa conferma.
   */
  async deleteProjectById(projectId, projectTitle) {
    const ok = confirm(`Sei sicuro di voler eliminare il progetto "${projectTitle || projectId}" dall'archivio?`);
    if (!ok) return;

    try {
      await ProjectManager.deleteProject(projectId);
      await this.refreshProjectsCount();
      this.applyProjectsFilter();
      this.showToast(`Progetto eliminato dall'archivio.`);
    } catch (e) {
      this.showToast(`Errore eliminazione: ${e.message}`, 'error');
    }
  }

  exportLessonJson() {
    if (!LessonRenderer.currentLesson) return;
    ProjectManager.exportProjectFile(LessonRenderer.currentLesson);
  }

  importLessonJson(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = JSON.parse(e.target.result);
        if (!data.cards || !data.title) {
          throw new Error('Formato JSON non riconosciuto per una lezione CAA.');
        }
        
        await LessonRenderer.prepareLesson(data);
        LessonRenderer.render(document.getElementById('printableArea'), data);
        document.getElementById('lessonActions')?.classList.remove('hidden');
        document.getElementById('emptyState')?.classList.add('hidden');
        
        // Salva anche nell'archivio
        await ProjectManager.saveProject(data);
        await this.refreshProjectsCount();
        this.markClean();

        this.closeProjectsModal();
        this.showToast(`Progetto "${data.title}" importato e salvato!`);
      } catch (err) {
        this.showToast(`Errore caricamento: ${err.message}`, 'error');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  /**
   * Salva uno snapshot dello stato del progetto per il rilevamento delle modifiche pendenti.
   */
  markClean() {
    if (LessonRenderer.currentLesson) {
      this.lastSavedSnapshot = JSON.stringify(LessonRenderer.currentLesson);
    } else {
      this.lastSavedSnapshot = null;
    }
    this.updateCloseButtonVisibility();
  }

  /**
   * Verifica se il progetto attualmente a video è stato modificato rispetto all'ultimo salvataggio.
   */
  isProjectDirty() {
    if (!LessonRenderer.currentLesson) return false;
    if (!this.lastSavedSnapshot) return true;
    return JSON.stringify(LessonRenderer.currentLesson) !== this.lastSavedSnapshot;
  }

  /**
   * Aggiorna la visibilità del pulsante rapido di chiusura nella barra di navigazione in alto.
   */
  updateCloseButtonVisibility() {
    const btnHeaderClose = document.getElementById('btnHeaderCloseProject');
    if (btnHeaderClose) {
      if (LessonRenderer.currentLesson) {
        btnHeaderClose.classList.remove('hidden');
        btnHeaderClose.classList.add('flex');
      } else {
        btnHeaderClose.classList.add('hidden');
        btnHeaderClose.classList.remove('flex');
      }
    }
  }

  /**
   * Chiude il modale di conferma per modifiche pendenti.
   */
  closeUnsavedChangesModal() {
    const modal = document.getElementById('unsavedChangesModal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  /**
   * Richiede la chiusura del progetto a video.
   * Se vi sono modifiche non salvate, interroga l'utente con l'apposito modale.
   */
  requestCloseCurrentProject() {
    if (!LessonRenderer.currentLesson) {
      this.showToast('Nessun progetto aperto a video.');
      return;
    }

    if (this.isProjectDirty()) {
      const modal = document.getElementById('unsavedChangesModal');
      if (modal) {
        modal.classList.remove('hidden');
        return;
      }
    }

    // Se non ci sono modifiche pendenti, chiude direttamente tornando a foglio bianco
    this.doCloseProject();
  }

  /**
   * Esegue la chiusura effettiva del progetto attivo, ripristinando il foglio bianco iniziale.
   */
  doCloseProject() {
    LessonRenderer.currentLesson = null;
    this.lastSavedSnapshot = null;

    document.getElementById('lessonActions')?.classList.add('hidden');
    this.updateCloseButtonVisibility();

    const container = document.getElementById('printableArea');
    if (container) {
      container.innerHTML = `
        <div id="emptyState" class="text-center py-20 px-4 border-2 border-dashed border-slate-200 rounded-3xl bg-white/50">
          <div class="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
            </svg>
          </div>
          <h3 class="text-base font-bold text-slate-800 mb-1">Nessun percorso CAA aperto a video</h3>
          <p class="text-xs text-slate-500 max-w-md mx-auto mb-6">
            Descrivi un tema o una fiaba nel pannello a sinistra per generare un nuovo percorso con l'Intelligenza Artificiale, apri un progetto salvato dall'archivio, oppure crea subito un foglio bianco.
          </p>
          <div class="flex flex-wrap items-center justify-center gap-3">
            <button type="button" onclick="window.app.startBlankProject()" class="px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 text-xs font-bold transition flex items-center gap-2 shadow-sm">
              <span>📄 Nuovo Foglio Bianco</span>
            </button>
            <button type="button" onclick="window.app.openProjectsModal()" class="px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold transition flex items-center gap-2 shadow-sm">
              <span>📁 I Miei Progetti</span>
            </button>
          </div>
        </div>
      `;
    }

    const promptInput = document.getElementById('promptInput');
    if (promptInput) {
      promptInput.value = '';
    }

    this.showToast('Progetto chiuso. Foglio bianco pronto.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Crea un nuovo foglio bianco CAA completamente editabile direttamente a video.
   */
  async startBlankProject() {
    if (LessonRenderer.currentLesson && this.isProjectDirty()) {
      this.requestCloseCurrentProject();
      return;
    }

    this.setLoadingState(true, 'Creazione nuovo foglio bianco...');
    try {
      const blankLesson = {
        id: 'project_' + Date.now(),
        title: 'Nuovo Percorso Didattico CAA',
        targetGrade: 'infanzia',
        gradeDetails: 'Progetto personalizzato',
        pedagogicalObjective: 'Inserisci qui l\'obiettivo pedagogico e didattico...',
        educatorGuide: 'Guida per l\'educatore: personalizza liberamente i passaggi e i simboli.',
        cards: [
          {
            stepNumber: 1,
            actionTitle: 'Primo Passaggio',
            pedagogicalExplanation: 'Descrizione dell\'azione per il primo passaggio.',
            rawSentence: 'io inizio lavoro',
            tokens: []
          }
        ],
        moral: {
          text: 'Bravissimo! Percorso completato con successo!',
          tokens: []
        }
      };

      await LessonRenderer.prepareLesson(blankLesson);
      const container = document.getElementById('printableArea');
      LessonRenderer.render(container, blankLesson);

      document.getElementById('lessonActions')?.classList.remove('hidden');
      this.updateCloseButtonVisibility();
      this.markClean();
      this.showToast('Nuovo foglio bianco pronto per la personalizzazione!');
      container.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      this.showToast(`Errore creazione foglio: ${e.message}`, 'error');
    } finally {
      this.setLoadingState(false);
    }
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
