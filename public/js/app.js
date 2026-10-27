/**
 * Controller principale dell'applicazione CAA Lesson Planner.
 */

import { ConfigManager } from './config.js?v=2.7.5';
import { GeminiService } from './geminiService.js?v=2.7.5';
import { ArasaacService } from './arasaacService.js?v=2.7.5';
import { LessonRenderer } from './lessonRenderer.js?v=2.7.5';
import { ProjectManager } from './projectManager.js?v=2.7.5';
import { CustomPictogramsManager } from './customPictogramsManager.js?v=2.7.5';
import { AuthManager } from './authManager.js?v=2.7.5';
import { BackupManager } from './backupManager.js?v=2.7.5';
import { PdfClientEngine } from './pdfClientEngine.js?v=2.7.5';

class CAAApp {
  constructor() {
    this.selectedCardIndex = null;
    this.selectedTokenIndex = null;
    this.cachedProjects = [];
    this.cachedSharedProjects = [];
    this.cachedSharedPictograms = [];
    this.currentProjectTab = 'mine'; // 'mine' | 'shared'
    this.currentProjectFilter = 'all';
    this.lastSavedSnapshot = null;
    this.aiReferenceImages = [];
  }

  async init() {
    // 1. Ripristino immediato sessione locale o SSO sincrono per evitare flickering del modale login
    try {
      const hasSso = AuthManager.handleSsoLogin();
      if (!hasSso) {
        AuthManager.restoreSession();
      }
    } catch (e) {
      console.warn('Errore pre-init auth:', e);
    }

    // Registra listener UI e aggiorna lo stato dell'autenticazione
    this.setupUIBindings();
    this.setupAuthUI();

    // 2. Inizializzazione completa asincrona (sincronizzazione utenti e config dal Cloud)
    try {
      await AuthManager.init();
    } catch (e) {
      console.warn('Errore init auth:', e);
    }
    this.setupAuthUI();

    try {
      await ConfigManager.init();
    } catch (e) {
      console.warn('Errore init config:', e);
    }

    this.updateConfigStatusUI();
    this.populateModelSelectors();
    
    // 3. Sincronizzazioni cloud in background
    CustomPictogramsManager.syncFromCloud().catch(() => {});
    this.refreshProjectsCount().catch(() => {});
    this.refreshCustomPictosBadge();
    this.refreshSharedPictosBadge().catch(() => {});

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

    // Pulsante Download PDF Leggero (< 500 KB) Anti-Blocco Stampante
    const btnDownloadLightPdf = document.getElementById('btnDownloadLightPdf');
    if (btnDownloadLightPdf) {
      btnDownloadLightPdf.addEventListener('click', () => this.handleDownloadLightPdf());
    }

    // Pulsante Stampa Rapida Browser
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

    // Banner Configurazione Chiave per Utenti Secondari
    const btnBannerOpenSettings = document.getElementById('btnBannerOpenSettings');
    if (btnBannerOpenSettings && settingsModal) {
      btnBannerOpenSettings.addEventListener('click', () => {
        this.populateSettingsForm();
        settingsModal.classList.remove('hidden');
      });
    }

    // Login Form
    const formLogin = document.getElementById('formLogin');
    if (formLogin) {
      formLogin.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLoginSubmit();
      });
    }

    // Logout
    const btnLogout = document.getElementById('btnLogout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => this.handleLogout());
    }

    // Gestione Utenti (Admin)
    const btnOpenUsersModal = document.getElementById('btnOpenUsersModal');
    const btnCloseUsersModal = document.getElementById('btnCloseUsersModal');
    const btnCloseUsersModalBottom = document.getElementById('btnCloseUsersModalBottom');
    const usersModal = document.getElementById('usersModal');

    if (btnOpenUsersModal && usersModal) {
      btnOpenUsersModal.addEventListener('click', () => {
        this.renderUsersList();
        usersModal.classList.remove('hidden');
      });
    }
    if (btnCloseUsersModal && usersModal) {
      btnCloseUsersModal.addEventListener('click', () => usersModal.classList.add('hidden'));
    }
    if (btnCloseUsersModalBottom && usersModal) {
      btnCloseUsersModalBottom.addEventListener('click', () => usersModal.classList.add('hidden'));
    }

    const btnCreateUserSubmit = document.getElementById('btnCreateUserSubmit');
    if (btnCreateUserSubmit) {
      btnCreateUserSubmit.addEventListener('click', () => this.handleCreateUser());
    }

    // Esportazione Archivio Completo (Backup Progetti + Immagini IA)
    const btnExportFullArchive = document.getElementById('btnExportFullArchive');
    if (btnExportFullArchive) {
      btnExportFullArchive.addEventListener('click', () => this.handleExportFullArchive());
    }

    // Importazione Archivio Completo (Anti-duplicati)
    const fileImportArchiveModal = document.getElementById('fileImportArchiveModal');
    if (fileImportArchiveModal) {
      fileImportArchiveModal.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
          this.handleImportFullArchive(file);
          e.target.value = '';
        }
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

    // Gestione Tab Modale Simbolo (Catalogo ARASAAC vs I Miei Simboli vs Condivisi vs Generatore IA)
    const tabBtnArasaac = document.getElementById('tabBtnArasaac');
    const tabBtnCustomPictos = document.getElementById('tabBtnCustomPictos');
    const tabBtnSharedPictos = document.getElementById('tabBtnSharedPictos');
    const tabBtnAiGenerator = document.getElementById('tabBtnAiGenerator');

    if (tabBtnArasaac) {
      tabBtnArasaac.addEventListener('click', () => this.switchModalTab('arasaac'));
    }
    if (tabBtnCustomPictos) {
      tabBtnCustomPictos.addEventListener('click', () => {
        this.switchModalTab('custom');
        this.loadCustomPictograms();
      });
    }
    if (tabBtnSharedPictos) {
      tabBtnSharedPictos.addEventListener('click', () => {
        this.switchModalTab('shared');
        this.loadSharedPictograms();
      });
    }
    if (tabBtnAiGenerator) {
      tabBtnAiGenerator.addEventListener('click', () => this.switchModalTab('ai'));
    }

    // Ricerca e aggiornamento Simboli Personali
    const inputCustomPictoSearch = document.getElementById('inputCustomPictoSearch');
    if (inputCustomPictoSearch) {
      inputCustomPictoSearch.addEventListener('input', () => {
        const query = inputCustomPictoSearch.value;
        const filtered = CustomPictogramsManager.search(query);
        this.renderCustomPictograms(filtered);
      });
    }

    const btnRefreshCustomPictos = document.getElementById('btnRefreshCustomPictos');
    if (btnRefreshCustomPictos) {
      btnRefreshCustomPictos.addEventListener('click', () => this.loadCustomPictograms());
    }

    // Ricerca e aggiornamento Simboli Condivisi dai Colleghi
    const inputSharedPictoSearch = document.getElementById('inputSharedPictoSearch');
    if (inputSharedPictoSearch) {
      inputSharedPictoSearch.addEventListener('input', () => {
        const query = (inputSharedPictoSearch.value || '').trim().toLocaleUpperCase('it-IT');
        const filtered = (this.cachedSharedPictograms || []).filter(item => 
          (item.name && item.name.toLocaleUpperCase('it-IT').includes(query)) ||
          (item.authorName && item.authorName.toLocaleUpperCase('it-IT').includes(query)) ||
          (item.prompt && item.prompt.toLocaleUpperCase('it-IT').includes(query))
        );
        this.renderSharedPictograms(filtered);
      });
    }

    const btnRefreshSharedPictos = document.getElementById('btnRefreshSharedPictos');
    if (btnRefreshSharedPictos) {
      btnRefreshSharedPictos.addEventListener('click', () => this.loadSharedPictograms(true));
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

    // File upload immagini di riferimento per l'IA
    const inputAiRefImageFile = document.getElementById('inputAiRefImageFile');
    if (inputAiRefImageFile) {
      inputAiRefImageFile.addEventListener('change', (e) => this.handleAiRefFileUpload(e));
    }

    // Selettore dello stile grafico AI (Stilizzato CAA vs Realistico vs Fiabesco)
    document.querySelectorAll('.ai-style-option').forEach(label => {
      label.addEventListener('click', () => {
        document.querySelectorAll('.ai-style-option').forEach(l => {
          l.className = 'ai-style-option flex flex-col items-center justify-center p-2 rounded-xl border border-slate-200 bg-white cursor-pointer text-center text-xs font-bold text-slate-700 transition hover:bg-slate-50';
        });
        label.className = 'ai-style-option flex flex-col items-center justify-center p-2 rounded-xl border-2 border-indigo-600 bg-indigo-50/70 cursor-pointer text-center text-xs font-bold text-indigo-900 transition shadow-sm';
      });
    });

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

    const tabMyProjects = document.getElementById('tabMyProjects');
    const tabSharedProjects = document.getElementById('tabSharedProjects');
    if (tabMyProjects) {
      tabMyProjects.addEventListener('click', () => this.switchProjectsTab('mine'));
    }
    if (tabSharedProjects) {
      tabSharedProjects.addEventListener('click', () => this.switchProjectsTab('shared'));
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

    // Auto-conversione continua in Stampatello Maiuscolo (inclusi accenti È, Ò, À, Ù, É, Ì)
    document.addEventListener('input', (e) => {
      const target = e.target;
      if (!target || !target.value) return;

      const isCaaInput = target.id && (
        target.id.startsWith('inputPhraseCard_') ||
        target.id === 'inputPhraseMoral' ||
        target.id === 'inputNewRowPhrase' ||
        target.id === 'inputAiPictogramPrompt'
      );

      if (isCaaInput) {
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const upper = target.value.toLocaleUpperCase('it-IT');
        if (target.value !== upper) {
          target.value = upper;
          if (start !== null && end !== null) {
            target.setSelectionRange(start, end);
          }
        }
      }
    });

    // Selettore Rapido Modello nell'Header
    const selectHeaderModel = document.getElementById('selectHeaderModel');
    if (selectHeaderModel) {
      selectHeaderModel.addEventListener('change', (e) => {
        const newModel = e.target.value;
        ConfigManager.setModel(newModel);
        const selectModalModel = document.getElementById('selectModel');
        if (selectModalModel) selectModalModel.value = newModel;
        this.updateConfigStatusUI();
        this.showToast(`Modello attivo: ${selectHeaderModel.options[selectHeaderModel.selectedIndex]?.text || newModel}`);
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

    const selectHeaderModel = document.getElementById('selectHeaderModel');
    if (selectHeaderModel && ConfigManager.state.model) {
      selectHeaderModel.value = ConfigManager.state.model;
    }
  }

  /**
   * Popola dinamicamente i selettori di modello (in testata e nel modale impostazioni)
   * con tutti i modelli resi disponibili dall'API Gemini di Google.
   */
  populateModelSelectors() {
    const models = ConfigManager.state.availableModels || [];
    const selectHeader = document.getElementById('selectHeaderModel');
    const selectModal = document.getElementById('selectModel');

    if (models.length === 0) return;

    // Raggruppamento semantico dei modelli
    const groups = {
      flash: { title: '⚡ Flash & Veloci (Consigliati)', items: [] },
      pro: { title: '🧠 Pro & Ragionamento Avanzato', items: [] },
      image: { title: '🎨 Modelli Generazione Immagine', items: [] },
      other: { title: '🔬 Altri Modelli & Sperimentali', items: [] }
    };

    models.forEach(m => {
      const id = m.id;
      const lower = id.toLowerCase();
      if (lower.includes('image')) {
        groups.image.items.push(m);
      } else if (lower.includes('pro') || lower.includes('deep-research')) {
        groups.pro.items.push(m);
      } else if (lower.includes('flash')) {
        groups.flash.items.push(m);
      } else {
        groups.other.items.push(m);
      }
    });

    const currentModel = ConfigManager.state.model;

    const buildOptionsHtml = (selectedVal) => {
      let html = '';
      for (const [key, group] of Object.entries(groups)) {
        if (group.items.length === 0) continue;
        html += `<optgroup label="${group.title}">`;
        group.items.forEach(item => {
          const isSel = item.id === selectedVal ? 'selected' : '';
          html += `<option value="${item.id}" ${isSel}>${item.id}</option>`;
        });
        html += `</optgroup>`;
      }
      return html;
    };

    const optionsHtml = buildOptionsHtml(currentModel);
    if (selectHeader) {
      selectHeader.innerHTML = optionsHtml;
      selectHeader.value = currentModel;
    }
    if (selectModal) {
      selectModal.innerHTML = optionsHtml;
      selectModal.value = currentModel;
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

  async handleSaveSettings() {
    const inputKey = document.getElementById('inputApiKey');
    const selectModel = document.getElementById('selectModel');

    if (inputKey) {
      ConfigManager.setApiKey(inputKey.value.trim());
    }
    if (selectModel) {
      ConfigManager.setModel(selectModel.value);
      const selectHeaderModel = document.getElementById('selectHeaderModel');
      if (selectHeaderModel) selectHeaderModel.value = selectModel.value;
    }

    document.getElementById('settingsModal')?.classList.add('hidden');
    this.updateConfigStatusUI();
    
    // Aggiorna l'elenco dei modelli disponibili con la nuova chiave
    await ConfigManager.fetchAvailableModels();
    this.populateModelSelectors();

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

  /**
   * Cambia il tab attivo nel modale di selezione/creazione simbolo.
   * @param {'arasaac'|'custom'|'shared'|'ai'} tabName 
   */
  switchModalTab(tabName) {
    const tabBtnArasaac = document.getElementById('tabBtnArasaac');
    const tabBtnCustomPictos = document.getElementById('tabBtnCustomPictos');
    const tabBtnSharedPictos = document.getElementById('tabBtnSharedPictos');
    const tabBtnAiGenerator = document.getElementById('tabBtnAiGenerator');

    const tabContentArasaac = document.getElementById('tabContentArasaac');
    const tabContentCustomPictos = document.getElementById('tabContentCustomPictos');
    const tabContentSharedPictos = document.getElementById('tabContentSharedPictos');
    const tabContentAi = document.getElementById('tabContentAi');

    const baseInactive = 'px-3.5 py-2 text-xs font-bold border-b-2 border-transparent text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition whitespace-nowrap';

    if (tabBtnArasaac) tabBtnArasaac.className = baseInactive;
    if (tabBtnCustomPictos) tabBtnCustomPictos.className = baseInactive;
    if (tabBtnSharedPictos) tabBtnSharedPictos.className = baseInactive;
    if (tabBtnAiGenerator) tabBtnAiGenerator.className = baseInactive;

    tabContentArasaac?.classList.add('hidden');
    tabContentCustomPictos?.classList.add('hidden');
    tabContentSharedPictos?.classList.add('hidden');
    tabContentAi?.classList.add('hidden');

    if (tabName === 'arasaac') {
      if (tabBtnArasaac) tabBtnArasaac.className = 'px-3.5 py-2 text-xs font-bold border-b-2 border-blue-600 text-blue-700 flex items-center gap-1.5 transition whitespace-nowrap';
      tabContentArasaac?.classList.remove('hidden');
    } else if (tabName === 'custom') {
      if (tabBtnCustomPictos) tabBtnCustomPictos.className = 'px-3.5 py-2 text-xs font-bold border-b-2 border-amber-600 text-amber-700 flex items-center gap-1.5 transition whitespace-nowrap';
      tabContentCustomPictos?.classList.remove('hidden');
    } else if (tabName === 'shared') {
      if (tabBtnSharedPictos) tabBtnSharedPictos.className = 'px-3.5 py-2 text-xs font-bold border-b-2 border-indigo-600 text-indigo-700 flex items-center gap-1.5 transition whitespace-nowrap';
      tabContentSharedPictos?.classList.remove('hidden');
    } else if (tabName === 'ai') {
      if (tabBtnAiGenerator) tabBtnAiGenerator.className = 'px-3.5 py-2 text-xs font-bold border-b-2 border-purple-600 text-purple-700 flex items-center gap-1.5 transition whitespace-nowrap';
      tabContentAi?.classList.remove('hidden');
      document.getElementById('inputAiPictogramPrompt')?.focus();
    }
  }

  /**
   * Aggiorna il badge numerico con il totale dei simboli personali salvati.
   */
  refreshCustomPictosBadge() {
    const badge = document.getElementById('customPictosBadge');
    if (badge) {
      const count = CustomPictogramsManager.getAll().length;
      badge.textContent = String(count);
    }
  }

  /**
   * Aggiorna il badge numerico con il totale dei simboli condivisi dai colleghi.
   */
  async refreshSharedPictosBadge() {
    const badge = document.getElementById('sharedPictosBadge');
    if (!badge) return;
    try {
      if (!this.cachedSharedPictograms || this.cachedSharedPictograms.length === 0) {
        this.cachedSharedPictograms = await CustomPictogramsManager.getSharedPictograms();
      }
      badge.textContent = String((this.cachedSharedPictograms || []).length);
    } catch (e) {
      badge.textContent = '0';
    }
  }

  /**
   * Carica e visualizza l'archivio dei simboli personali salvati.
   */
  loadCustomPictograms() {
    this.refreshCustomPictosBadge();
    const query = document.getElementById('inputCustomPictoSearch')?.value;
    const items = CustomPictogramsManager.search(query || '');
    this.renderCustomPictograms(items);
  }

  /**
   * Renderizza la griglia dei simboli personali salvati con toggle/spunta di condivisione.
   * @param {Array<Object>} items 
   */
  renderCustomPictograms(items) {
    const container = document.getElementById('customPictosGrid');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-8 text-center space-y-3">
          <div class="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto text-xl">⭐</div>
          <p class="text-xs text-slate-500 max-w-sm mx-auto">
            Non hai ancora simboli salvati nel tuo archivio personale.
          </p>
          <button type="button" 
                  onclick="window.app.switchModalTab('ai')" 
                  class="px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-200 transition inline-flex items-center gap-1.5">
            <span>✨ Crea subito un simbolo con l'IA</span>
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => {
      const safeId = this.escapeHtml(item.id);
      const safeName = this.escapeHtml(item.name || 'SIMBOLO');
      const isShared = Boolean(item.isShared);

      return `
        <div class="border ${isShared ? 'border-blue-300 bg-blue-50/20' : 'border-amber-200 bg-white'} hover:border-amber-500 rounded-xl p-2.5 flex flex-col items-center justify-between cursor-pointer transition hover:shadow-md relative group select-none"
             onclick="window.app.applyNewPictogram('${safeId}', '${item.imageUrl}', true)"
             title="Clicca per assegnare questo simbolo alla parola">
          
          <!-- Bottone elimina dall'archivio personale -->
          <button type="button" 
                  class="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition shadow-sm z-10"
                  onclick="event.stopPropagation(); window.app.deleteCustomPictogram('${safeId}', '${safeName}')"
                  title="Elimina dall'archivio personale">✕</button>

          <div class="w-20 h-20 flex items-center justify-center p-1 bg-white rounded border border-slate-100 shadow-2xs">
            <img src="${item.imageUrl}" class="max-w-full max-h-full object-contain pointer-events-none" loading="lazy" alt="${safeName}" />
          </div>

          <span class="text-[10px] font-bold text-slate-800 text-center truncate w-full mt-1.5 uppercase" title="${safeName}">
            ${safeName}
          </span>

          <!-- Spunta / Toggle Condivisione con i Colleghi -->
          <label class="mt-1.5 w-full flex items-center justify-center gap-1.5 text-[10px] font-bold py-1 px-1.5 rounded-lg border transition cursor-pointer ${isShared ? 'bg-blue-100/70 border-blue-300 text-blue-900' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}"
                 onclick="event.stopPropagation();"
                 title="Spunta per decidere se condividere questo simbolo con tutti i colleghi">
            <input type="checkbox" 
                   class="w-3.5 h-3.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer" 
                   ${isShared ? 'checked' : ''} 
                   onchange="window.app.handleToggleCustomPictoShare('${safeId}', this.checked, '${safeName}')" />
            <span class="truncate">${isShared ? '🌐 Condiviso' : '🔒 Privato'}</span>
          </label>
        </div>
      `;
    }).join('');
  }

  /**
   * Attiva/disattiva la condivisione pubblica di un simbolo personale.
   */
  async handleToggleCustomPictoShare(id, isShared, name) {
    this.showToast(isShared ? `Condivisione in corso per "${name}"...` : `Rimozione condivisione...`);
    const ok = await CustomPictogramsManager.toggleShare(id, isShared);
    if (ok) {
      this.showToast(isShared 
        ? `✨ Il simbolo "${name}" è ora CONDIVISO con tutti i colleghi!` 
        : `🔒 Condivisione rimossa. Il simbolo "${name}" è ora PRIVATO.`, 'success');
      this.loadCustomPictograms();
      // Forza l'aggiornamento cache dei condivisi
      this.loadSharedPictograms(true).catch(() => {});
    } else {
      this.showToast('Errore durante l\'aggiornamento della condivisione sul Cloud.', 'error');
      this.loadCustomPictograms();
    }
  }

  /**
   * Carica i simboli condivisi dai colleghi dal Cloud.
   */
  async loadSharedPictograms(forceRefresh = false) {
    const container = document.getElementById('sharedPictosGrid');
    if (!container) return;

    if (forceRefresh || !this.cachedSharedPictograms || this.cachedSharedPictograms.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-8 text-center space-y-2">
          <div class="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p class="text-xs text-slate-500 font-medium">Caricamento simboli condivisi dai colleghi...</p>
        </div>
      `;
      this.cachedSharedPictograms = await CustomPictogramsManager.getSharedPictograms();
      this.refreshSharedPictosBadge();
    }

    const query = (document.getElementById('inputSharedPictoSearch')?.value || '').trim().toLocaleUpperCase('it-IT');
    const items = query 
      ? (this.cachedSharedPictograms || []).filter(item => 
          (item.name && item.name.toLocaleUpperCase('it-IT').includes(query)) ||
          (item.authorName && item.authorName.toLocaleUpperCase('it-IT').includes(query)) ||
          (item.prompt && item.prompt.toLocaleUpperCase('it-IT').includes(query))
        )
      : (this.cachedSharedPictograms || []);

    this.renderSharedPictograms(items);
  }

  /**
   * Renderizza la griglia dei simboli condivisi dai colleghi.
   * @param {Array<Object>} items 
   */
  renderSharedPictograms(items) {
    const container = document.getElementById('sharedPictosGrid');
    if (!container) return;

    if (!items || items.length === 0) {
      container.innerHTML = `
        <div class="col-span-full py-8 text-center space-y-3">
          <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto text-xl">🌐</div>
          <p class="text-xs text-slate-600 font-medium max-w-sm mx-auto">
            Nessun simbolo condiviso dai colleghi al momento per questa ricerca.
          </p>
          <p class="text-[11px] text-slate-400 max-w-xs mx-auto">
            Puoi condividere i tuoi simboli personalizzati con la spunta nella scheda <strong>"⭐ I Miei Simboli"</strong>!
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = items.map(item => {
      const safeId = this.escapeHtml(item.id);
      const safeName = this.escapeHtml(item.name || 'SIMBOLO');
      const safeAuthor = this.escapeHtml(item.authorName || item.authorUser || 'Collega');

      return `
        <div class="border border-blue-200 bg-white hover:border-blue-500 rounded-xl p-2.5 flex flex-col items-center justify-between cursor-pointer transition hover:shadow-md relative group select-none"
             onclick="window.app.applyNewPictogram('${safeId}', '${item.imageUrl}', true)"
             title="Clicca per assegnare questo simbolo alla parola">
          
          <div class="w-20 h-20 flex items-center justify-center p-1 bg-white rounded border border-slate-100 shadow-2xs">
            <img src="${item.imageUrl}" class="max-w-full max-h-full object-contain pointer-events-none" loading="lazy" alt="${safeName}" />
          </div>

          <span class="text-[10px] font-bold text-slate-800 text-center truncate w-full mt-1.5 uppercase" title="${safeName}">
            ${safeName}
          </span>

          <span class="text-[9px] text-blue-700 font-semibold truncate max-w-full" title="Creato da ${safeAuthor}">
            👤 ${safeAuthor}
          </span>

          <!-- Bottone Salva nei miei simboli personali -->
          <button type="button" 
                  class="mt-1.5 w-full py-1 px-1.5 text-[9px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-lg transition flex items-center justify-center gap-1"
                  onclick="event.stopPropagation(); window.app.handleCloneSharedPicto('${safeId}')"
                  title="Salva una copia di questo simbolo nel tuo archivio personale">
            <span>💾 Salva nei miei</span>
          </button>
        </div>
      `;
    }).join('');
  }

  /**
   * Salva una copia di un simbolo condiviso dai colleghi nei propri simboli personali.
   */
  handleCloneSharedPicto(id) {
    const item = (this.cachedSharedPictograms || []).find(p => p.id === id);
    if (!item) {
      this.showToast('Simbolo non trovato.', 'error');
      return;
    }

    try {
      CustomPictogramsManager.cloneSharedPictogram(item);
      this.refreshCustomPictosBadge();
      this.showToast(`Simbolo "${item.name}" salvato nei tuoi simboli personali!`, 'success');
    } catch (e) {
      this.showToast(`Errore salvataggio: ${e.message}`, 'error');
    }
  }

  /**
   * Elimina un simbolo dall'archivio personale previa conferma.
   */
  deleteCustomPictogram(id, name) {
    const ok = confirm(`Eliminare il simbolo "${name}" dal tuo archivio personale?`);
    if (!ok) return;

    CustomPictogramsManager.delete(id);
    this.refreshCustomPictosBadge();
    this.loadCustomPictograms();
    this.showToast(`Simbolo "${name}" eliminato dall'archivio.`);
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
    if (inputAiPrompt) inputAiPrompt.value = (token.displayWord || token.searchTerm || '').toLocaleUpperCase('it-IT');

    // Resetta l'anteprima IA
    if (previewArea) {
      previewArea.innerHTML = `
        <p class="text-xs text-slate-400">Nessun simbolo IA generato al momento. Personalizza la descrizione sopra e premi "Genera con IA".</p>
      `;
    }

    // Assicura che si apra sul tab ARASAAC e aggiorna badge
    this.switchModalTab('arasaac');
    this.refreshCustomPictosBadge();
    this.refreshSharedPictosBadge();
    this.initAiReferenceCarousel(token);

    modal?.classList.remove('hidden');

    // Se esiste un simbolo personale salvato che corrisponde a questo termine, includilo in testa
    const cleanWord = (token.displayWord || '').trim();
    const existingCustom = CustomPictogramsManager.findExact(cleanWord);
    let alternatives = [...(token.alternatives || [])];
    if (existingCustom) {
      alternatives.unshift({
        id: existingCustom.id,
        imageUrl: existingCustom.imageUrl,
        isCustom: true,
        label: existingCustom.name
      });
    }

    this.renderPictogramResults(alternatives);
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
      // Cerca anche tra i simboli personali corrispondenti
      const customMatches = CustomPictogramsManager.search(term).map(cp => ({
        id: cp.id,
        imageUrl: cp.imageUrl,
        isCustom: true,
        label: cp.name
      }));

      const items = await ArasaacService.searchPictograms(term);
      const mapped = items.map(r => ({
        id: r._id,
        imageUrl: ArasaacService.getPictogramImageUrl(r._id)
      }));

      const combined = [...customMatches, ...mapped];
      this.renderPictogramResults(combined);
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

    container.innerHTML = items.map(item => {
      const isCustom = item.isCustom || String(item.id).startsWith('custom_') || String(item.id).startsWith('ai_');
      const badgeHtml = isCustom
        ? `<span class="text-[9px] px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 font-bold mt-1">Personale</span>`
        : `<span class="text-[10px] text-slate-400 mt-1">ID: ${item.id}</span>`;

      return `
        <div class="border ${isCustom ? 'border-amber-300 bg-amber-50/40 hover:border-amber-500' : 'border-slate-200 hover:border-blue-500 bg-white'} rounded-xl p-2 flex flex-col items-center justify-center cursor-pointer transition hover:shadow-md"
             onclick="window.app.applyNewPictogram('${item.id}', '${item.imageUrl}', ${isCustom})">
          <img src="${item.imageUrl}" class="w-20 h-20 object-contain pointer-events-none" loading="lazy" alt="Simbolo" />
          ${badgeHtml}
        </div>
      `;
    }).join('');
  }

  /**
   * Inizializza il carosello dei riferimenti visivi dell'IA con i simboli della lezione corrente.
   * Se il token corrente possiede già un'immagine valida, lo imposta come riferimento attivo iniziale.
   * @param {Object} currentToken
   */
  initAiReferenceCarousel(currentToken) {
    this.aiReferenceImages = [];

    // Se il token corrente ha già un'immagine reale, aggiungilo come riferimento predefinito
    if (currentToken && currentToken.imageUrl && !String(currentToken.imageUrl).includes('placeholder')) {
      this.aiReferenceImages.push({
        name: (currentToken.displayWord || currentToken.searchTerm || 'PERSONAGGIO').toLocaleUpperCase('it-IT'),
        imageUrl: currentToken.imageUrl
      });
    }

    // Estrai tutti i simboli con immagine dalla lezione corrente
    const carousel = document.getElementById('aiLessonTokensCarousel');
    if (!carousel) return;

    const availableTokens = [];
    const seenUrls = new Set();

    const addTokenCandidate = (tok) => {
      if (!tok || !tok.imageUrl || String(tok.imageUrl).includes('placeholder')) return;
      if (seenUrls.has(tok.imageUrl)) return;
      seenUrls.add(tok.imageUrl);
      availableTokens.push({
        name: (tok.displayWord || tok.searchTerm || 'SIMBOLO').toLocaleUpperCase('it-IT'),
        imageUrl: tok.imageUrl
      });
    };

    if (LessonRenderer.currentLesson?.cards) {
      LessonRenderer.currentLesson.cards.forEach(c => {
        (c.tokens || []).forEach(addTokenCandidate);
      });
    }
    if (LessonRenderer.currentLesson?.moral?.tokens) {
      LessonRenderer.currentLesson.moral.tokens.forEach(addTokenCandidate);
    }

    if (availableTokens.length === 0) {
      carousel.innerHTML = '<span class="text-[11px] text-slate-400 italic py-1">Nessun altro simbolo presente nella lezione attuale. Puoi caricare foto dal PC.</span>';
    } else {
      carousel.innerHTML = availableTokens.map((item, idx) => {
        const safeName = this.escapeHtml(item.name);
        const encodedUrl = encodeURIComponent(item.imageUrl);
        return `
          <button type="button" 
                  class="ai-carousel-token-btn flex items-center gap-1.5 px-2 py-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition shrink-0 shadow-2xs group cursor-pointer text-left"
                  data-img-url="${encodedUrl}"
                  data-img-name="${safeName}"
                  onclick="window.app.toggleAiReferenceImage('${safeName}', decodeURIComponent('${encodedUrl}'))"
                  title="Clicca per aggiungere/rimuovere ${safeName} come riferimento visivo">
            <img src="${item.imageUrl}" class="w-7 h-7 object-contain rounded bg-white shrink-0 pointer-events-none" alt="${safeName}" />
            <span class="text-[11px] font-bold text-slate-700 group-hover:text-indigo-600 truncate max-w-[90px]">${safeName}</span>
          </button>
        `;
      }).join('');
    }

    this.renderAiActiveReferenceList();
  }

  /**
   * Aggiorna visivamente l'elenco dei riferimenti visivi attivi e gli stili nel carosello.
   */
  renderAiActiveReferenceList() {
    const listEl = document.getElementById('aiActiveRefList');
    const badgeCount = document.getElementById('aiRefImagesCount');
    const placeholder = document.getElementById('aiActiveRefPlaceholder');

    const count = this.aiReferenceImages.length;
    if (badgeCount) {
      badgeCount.textContent = String(count);
      if (count > 0) {
        badgeCount.classList.remove('hidden');
      } else {
        badgeCount.classList.add('hidden');
      }
    }

    if (listEl) {
      if (count === 0) {
        listEl.innerHTML = '<span id="aiActiveRefPlaceholder" class="text-[11px] text-slate-400 italic">Nessun riferimento selezionato (l\'IA inventerà la figura da zero).</span>';
      } else {
        listEl.innerHTML = this.aiReferenceImages.map((ref, idx) => {
          const safeName = this.escapeHtml(ref.name || `Riferimento ${idx + 1}`);
          return `
            <div class="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-xl border-2 border-indigo-400 bg-indigo-50 shadow-xs text-xs font-bold text-indigo-950">
              <img src="${ref.imageUrl}" class="w-6 h-6 object-contain rounded bg-white border border-indigo-200 shrink-0" alt="${safeName}" />
              <span class="truncate max-w-[120px]">${safeName}</span>
              <button type="button" 
                      class="text-indigo-600 hover:text-red-600 hover:bg-red-50 p-0.5 rounded-full text-xs font-bold transition ml-0.5" 
                      onclick="window.app.removeAiReferenceImage(${idx})"
                      title="Rimuovi questo riferimento visivo">✕</button>
            </div>
          `;
        }).join('');
      }
    }

    // Aggiorna lo stato visivo (attivo / inattivo) nei bottoni del carosello
    document.querySelectorAll('.ai-carousel-token-btn').forEach(btn => {
      const url = decodeURIComponent(btn.getAttribute('data-img-url') || '');
      const isSelected = this.aiReferenceImages.some(r => r.imageUrl === url);
      if (isSelected) {
        btn.className = 'ai-carousel-token-btn flex items-center gap-1.5 px-2 py-1 rounded-xl border-2 border-indigo-600 bg-indigo-100/70 shadow-xs shrink-0 cursor-pointer text-left';
      } else {
        btn.className = 'ai-carousel-token-btn flex items-center gap-1.5 px-2 py-1 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition shrink-0 shadow-2xs group cursor-pointer text-left';
      }
    });
  }

  /**
   * Aggiunge o rimuove un riferimento visivo per l'IA.
   * @param {string} name
   * @param {string} imageUrl
   */
  toggleAiReferenceImage(name, imageUrl) {
    if (!imageUrl) return;
    const existingIdx = this.aiReferenceImages.findIndex(r => r.imageUrl === imageUrl);
    if (existingIdx >= 0) {
      this.aiReferenceImages.splice(existingIdx, 1);
    } else {
      if (this.aiReferenceImages.length >= 5) {
        this.showToast('Puoi selezionare al massimo 5 immagini di riferimento contemporaneamente.', 'error');
        return;
      }
      this.aiReferenceImages.push({ name: name || 'RIFERIMENTO', imageUrl });
    }
    this.renderAiActiveReferenceList();
  }

  /**
   * Rimuove un riferimento visivo in base all'indice.
   * @param {number} index
   */
  removeAiReferenceImage(index) {
    if (index >= 0 && index < this.aiReferenceImages.length) {
      this.aiReferenceImages.splice(index, 1);
      this.renderAiActiveReferenceList();
    }
  }

  /**
   * Gestisce il caricamento manuale di foto/disegni dal computer dell'utente per l'IA.
   * @param {Event} e
   */
  handleAiRefFileUpload(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    files.forEach(file => {
      if (this.aiReferenceImages.length >= 5) {
        this.showToast('Limite di 5 immagini di riferimento raggiunto.', 'error');
        return;
      }
      const reader = new FileReader();
      const cleanName = file.name.replace(/\.[^/.]+$/, '').toLocaleUpperCase('it-IT');
      reader.onload = (uploadEvt) => {
        const dataUrl = uploadEvt.target.result;
        this.aiReferenceImages.push({
          name: cleanName,
          imageUrl: dataUrl
        });
        this.renderAiActiveReferenceList();
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  }

  /**
   * Genera un pittogramma SVG personalizzato tramite l'IA di Gemini.
   * Include il supporto multimodale per la continuità visiva di uno o più personaggi.
   */
  async handleGenerateAiPictogram() {
    const input = document.getElementById('inputAiPictogramPrompt');
    const promptText = input?.value?.trim();
    if (!promptText) {
      this.showToast('Inserisci una descrizione per il simbolo IA.', 'error');
      return;
    }

    const previewArea = document.getElementById('aiPictogramPreviewArea');
    const refCount = this.aiReferenceImages.length;
    const refNames = this.aiReferenceImages.map(r => r.name).join(' + ');

    if (previewArea) {
      const waitMessage = refCount > 0
        ? `Analisi visiva di "${refNames}" e generazione coerente...`
        : `Creazione del pittogramma vettoriale con l'IA...`;

      previewArea.innerHTML = `
        <div class="py-6 flex flex-col items-center justify-center space-y-3">
          <div class="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p class="text-xs font-semibold text-slate-700">${this.escapeHtml(waitMessage)}</p>
          ${refCount > 0 ? `<span class="text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full font-bold border border-indigo-200">🎭 Guida visiva attiva: ${refCount} ${refCount === 1 ? 'figura' : 'figure'}</span>` : ''}
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

      const selectedStyle = document.querySelector('input[name="aiPictogramStyle"]:checked')?.value || 'stylized';
      const svgDataUri = await GeminiService.generateAiPictogramSvg(
        promptText,
        selectedStyle,
        category,
        this.aiReferenceImages
      );
      const defaultName = promptText.toLocaleUpperCase('it-IT');
      
      if (previewArea) {
        previewArea.innerHTML = `
          <div class="flex flex-col sm:flex-row items-center gap-4 bg-white p-4 rounded-2xl border border-indigo-100 shadow-sm w-full max-w-xl mx-auto">
            <div class="w-24 h-24 border-2 border-amber-300 rounded-2xl p-1 bg-white flex items-center justify-center shrink-0 shadow-inner">
              <img src="${svgDataUri}" class="max-w-full max-h-full object-contain pointer-events-none" alt="Simbolo generato con IA" />
            </div>

            <div class="flex-1 text-left space-y-2.5 w-full">
              <div>
                <label for="inputCustomPictoSaveName" class="block text-[11px] font-bold text-slate-700 mb-1">
                  Nome / Parola chiave del simbolo:
                </label>
                <input type="text" 
                       id="inputCustomPictoSaveName" 
                       class="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 uppercase focus:ring-2 focus:ring-amber-500" 
                       value="${this.escapeHtml(defaultName)}" 
                       placeholder="Es: REGINA CATTIVA" />
              </div>

              <!-- Spunta per decidere se condividere subito con i colleghi -->
              <label class="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer pt-0.5" title="Se spuntato, il simbolo sarà immediatamente visibile anche agli altri docenti">
                <input type="checkbox" id="checkShareAiPictoNow" class="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer" />
                <span>🌐 Condividi subito con i colleghi</span>
              </label>

              <!-- Gruppo Azioni: Salva e Usa, Salva Solo, Usa Subito -->
              <div class="flex flex-wrap items-center gap-2 pt-1">
                <button type="button" 
                        id="btnSaveAndUseAiPictogram"
                        class="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-sm transition flex items-center gap-1.5"
                        title="Salva nella tua collezione personale e assegna subito alla parola">
                  <span>⭐ Salva e Usa</span>
                </button>

                <button type="button" 
                        id="btnSaveOnlyAiPictogram"
                        class="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 transition"
                        title="Salva nella tua collezione per usarlo in futuro">
                  <span>💾 Salva nell'Archivio</span>
                </button>

                <button type="button" 
                        id="btnUseOnlyAiPictogram"
                        class="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-200 transition"
                        title="Usa solo ora senza salvarlo nell'archivio">
                  <span>✅ Usa Subito</span>
                </button>
              </div>
            </div>
          </div>
        `;

        // Gestione azione "Salva e Usa"
        document.getElementById('btnSaveAndUseAiPictogram')?.addEventListener('click', () => {
          const nameInput = document.getElementById('inputCustomPictoSaveName');
          const isShared = Boolean(document.getElementById('checkShareAiPictoNow')?.checked);
          const finalName = (nameInput?.value || defaultName).trim().toLocaleUpperCase('it-IT');
          const saved = CustomPictogramsManager.save({
            name: finalName,
            imageUrl: svgDataUri,
            prompt: promptText,
            isShared
          });
          this.refreshCustomPictosBadge();
          this.applyNewPictogram(saved.id, svgDataUri, true);
          this.showToast(`Simbolo "${finalName}" salvato ${isShared ? 'e condiviso con i colleghi' : 'nel tuo archivio'}!`, 'success');
        });

        // Gestione azione "Salva Solo nell'Archivio"
        document.getElementById('btnSaveOnlyAiPictogram')?.addEventListener('click', () => {
          const nameInput = document.getElementById('inputCustomPictoSaveName');
          const isShared = Boolean(document.getElementById('checkShareAiPictoNow')?.checked);
          const finalName = (nameInput?.value || defaultName).trim().toLocaleUpperCase('it-IT');
          CustomPictogramsManager.save({
            name: finalName,
            imageUrl: svgDataUri,
            prompt: promptText,
            isShared
          });
          this.refreshCustomPictosBadge();
          this.showToast(`Simbolo "${finalName}" aggiunto ai tuoi simboli ${isShared ? 'e condiviso' : ''}!`, 'success');
          this.switchModalTab('custom');
          this.loadCustomPictograms();
        });

        // Gestione azione "Usa Subito" (senza salvare in archivio)
        document.getElementById('btnUseOnlyAiPictogram')?.addEventListener('click', () => {
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
    const cleanWord = (newWord || '').trim().toLocaleUpperCase('it-IT');
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
   * Scarica il file PDF generato dal motore nativo compatto (< 500 KB).
   * Ideale per stampanti HP e dispositivi con memoria buffer ridotta.
   */
  async handleDownloadLightPdf() {
    if (!LessonRenderer.currentLesson) {
      this.showToast('Nessun progetto da esportare in PDF.', 'error');
      return;
    }

    this.setLoadingState(true, 'Creazione PDF leggero (< 500 KB) in corso...');
    try {
      // 1. Tentativo con il server backend Python (se attivo)
      let downloadedViaServer = false;
      try {
        const resp = await fetch('/api/export-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(LessonRenderer.currentLesson)
        });

        if (resp.ok) {
          const blob = await resp.blob();
          const titleSlug = (LessonRenderer.currentLesson.title || 'lezione_caa')
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '_')
            .replace(/_+/g, '_')
            .slice(0, 30);
          
          const downloadUrl = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = downloadUrl;
          a.download = `${titleSlug}_leggero.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(downloadUrl);

          const sizeKb = Math.round(blob.size / 1024);
          this.showToast(`PDF leggero scaricato (${sizeKb} KB)! Pronto per la stampante.`);
          downloadViaServer = true;
          return;
        }
      } catch (srvErr) {
        // Server non disponibile: passa al generatore PDF client-side
      }

      // 2. Fallback universale Client-Side (funziona su Mac, iOS, Android e GitHub Pages)
      const res = await PdfClientEngine.generateAndDownload(LessonRenderer.currentLesson);
      const sizeKb = Math.round(res.sizeBytes / 1024);
      this.showToast(`PDF leggero generato direttamente nel browser (${sizeKb} KB, ${res.pages} pag.)!`);
    } catch (err) {
      console.error('Errore download PDF leggero:', err);
      this.showToast(`Errore PDF: ${err.message}`, 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  /**
   * Prepara, comprime e ridimensiona le immagini prima della stampa.
   * Riduce drasticamente il peso del file PDF e del buffer spooler della stampante
   * evitando blocchi di memoria su stampanti fisiche.
   */
  async handlePrint() {
    this.setLoadingState(true, 'Ottimizzazione e compressione immagini per la stampante...');
    const container = document.getElementById('printableArea');

    const restoreOriginalImages = () => {
      if (!container) return;
      const modifiedImages = Array.from(container.querySelectorAll('img[data-original-src]'));
      modifiedImages.forEach(img => {
        const orig = img.getAttribute('data-original-src');
        if (orig) {
          img.src = orig;
          img.removeAttribute('data-original-src');
        }
      });
    };

    try {
      if (container) {
        const images = Array.from(container.querySelectorAll('img'));
        
        // Disattiva lazy loading
        images.forEach(img => {
          img.removeAttribute('loading');
          img.loading = 'eager';
        });

        // 1. Attesa del caricamento iniziale di tutte le immagini
        await Promise.all(images.map(img => {
          if (img.complete && img.naturalWidth > 0) {
            return Promise.resolve();
          }
          return new Promise(resolve => {
            img.onload = () => resolve();
            img.onerror = () => {
              const word = img.getAttribute('alt') || 'simbolo';
              img.src = GeminiService.createProceduralSvgDataUri(word, 'misc');
              resolve();
            };
            setTimeout(resolve, 800);
          });
        }));

        // 2. Compressione e ridimensionamento a 240x240 px (formato figurina) per la stampante
        const MAX_PRINT_DIM = 240;
        await Promise.all(images.map(img => {
          return new Promise(resolve => {
            try {
              // Salva la sorgente originale se non già fatto
              if (!img.getAttribute('data-original-src')) {
                img.setAttribute('data-original-src', img.src);
              }

              const canvas = document.createElement('canvas');
              let w = img.naturalWidth || img.width || MAX_PRINT_DIM;
              let h = img.naturalHeight || img.height || MAX_PRINT_DIM;

              if (w > MAX_PRINT_DIM || h > MAX_PRINT_DIM) {
                if (w > h) {
                  h = Math.round((h * MAX_PRINT_DIM) / w);
                  w = MAX_PRINT_DIM;
                } else {
                  w = Math.round((w * MAX_PRINT_DIM) / h);
                  h = MAX_PRINT_DIM;
                }
              }

              canvas.width = Math.max(w, 40);
              canvas.height = Math.max(h, 40);
              const ctx = canvas.getContext('2d', { alpha: false });
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

              // Esporta in JPEG leggero a qualità 0.82 (riduzione peso ~90% per lo spooler)
              const lightweightDataUrl = canvas.toDataURL('image/jpeg', 0.82);
              img.src = lightweightDataUrl;
              resolve();
            } catch (err) {
              // In caso di eccezione (es. cross-origin canvas), mantieni immagine originale
              resolve();
            }
          });
        }));

        // Breve pausa per permettere al browser di aggiornare il buffer di rendering
        await new Promise(r => setTimeout(r, 150));
      }
    } catch (e) {
      console.warn('Errore pre-stampa:', e);
    } finally {
      this.setLoadingState(false);
    }

    // Registra il ripristino delle immagini originali subito dopo la chiusura del print dialog
    window.addEventListener('afterprint', restoreOriginalImages, { once: true });
    // Timer di sicurezza se afterprint non viene scatenato dal browser
    setTimeout(restoreOriginalImages, 8000);

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
    const upperWord = word.trim().toLocaleUpperCase('it-IT');

    this.setLoadingState(true, `Aggiunta del simbolo "${upperWord}"...`);
    try {
      const tokens = await GeminiService.convertSentenceToTokens(word.trim());
      const token = tokens[0] || { displayWord: upperWord, searchTerm: word.trim(), category: 'noun' };
      token.displayWord = (token.displayWord || upperWord).toLocaleUpperCase('it-IT');
      await LessonRenderer.populateToken(token);
      targetTokens.push(token);
      LessonRenderer.render(document.getElementById('printableArea'), LessonRenderer.currentLesson);
      this.showToast(`Parola "${upperWord}" aggiunta!`);
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
   * Aggiorna i contatori dei progetti personali e condivisi.
   */
  async refreshProjectsCount() {
    try {
      const [myProjects, sharedProjects] = await Promise.all([
        ProjectManager.listProjects(),
        ProjectManager.fetchSharedProjects()
      ]);

      this.cachedProjects = myProjects || [];
      this.cachedSharedProjects = sharedProjects || [];

      const myCount = this.cachedProjects.length;
      const sharedCount = this.cachedSharedProjects.length;

      const headerBadge = document.getElementById('projectsCountBadge');
      const modalBadge = document.getElementById('projectsModalCountBadge');
      const badgeMy = document.getElementById('badgeMyProjectsCount');
      const badgeShared = document.getElementById('badgeSharedProjectsCount');

      if (headerBadge) headerBadge.textContent = String(myCount);
      if (modalBadge) modalBadge.textContent = `${myCount} personali • ${sharedCount} condivisi`;
      if (badgeMy) badgeMy.textContent = String(myCount);
      if (badgeShared) badgeShared.textContent = String(sharedCount);
    } catch (e) {
      console.warn('Errore refreshProjectsCount:', e);
    }
  }

  /**
   * Passa tra la scheda dei progetti personali e quella dei progetti condivisi.
   */
  async switchProjectsTab(tab = 'mine') {
    this.currentProjectTab = tab;
    const tabMy = document.getElementById('tabMyProjects');
    const tabShared = document.getElementById('tabSharedProjects');

    if (tab === 'mine') {
      tabMy?.classList.remove('bg-slate-50', 'text-slate-600', 'border-slate-200');
      tabMy?.classList.add('bg-blue-50', 'text-blue-700', 'border-blue-200', 'shadow-sm');
      tabShared?.classList.remove('bg-blue-50', 'text-blue-700', 'border-blue-200', 'shadow-sm');
      tabShared?.classList.add('bg-slate-50', 'text-slate-600', 'border-slate-200');
    } else {
      tabShared?.classList.remove('bg-slate-50', 'text-slate-600', 'border-slate-200');
      tabShared?.classList.add('bg-blue-50', 'text-blue-700', 'border-blue-200', 'shadow-sm');
      tabMy?.classList.remove('bg-blue-50', 'text-blue-700', 'border-blue-200', 'shadow-sm');
      tabMy?.classList.add('bg-slate-50', 'text-slate-600', 'border-slate-200');
    }

    await this.refreshProjectsCount();
    this.applyProjectsFilter();
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
      container.innerHTML = '<div class="py-12 text-center text-slate-500 text-sm">Caricamento archivio progetti e condivisi...</div>';
    }

    try {
      await this.refreshProjectsCount();
      this.switchProjectsTab(this.currentProjectTab || 'mine');
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

    const sourceList = this.currentProjectTab === 'shared'
      ? this.cachedSharedProjects
      : this.cachedProjects;

    let filtered = sourceList || [];

    if (filter !== 'all') {
      filtered = filtered.filter(p => (p.targetGrade || 'infanzia').toLowerCase() === filter);
    }

    if (term) {
      filtered = filtered.filter(p => {
        const titleMatch = (p.title || '').toLowerCase().includes(term);
        const subMatch = (p.subtitle || '').toLowerCase().includes(term);
        const authorMatch = (p.authorName || p.authorUser || '').toLowerCase().includes(term);
        return titleMatch || subMatch || authorMatch;
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

    const isSharedTab = this.currentProjectTab === 'shared';

    if (!projects || projects.length === 0) {
      container.innerHTML = `
        <div class="py-12 text-center text-slate-400">
          <svg class="w-12 h-12 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path>
          </svg>
          <p class="text-sm font-medium">
            ${isSharedTab ? 'Nessun percorso condiviso trovato dai colleghi.' : 'Nessun progetto personale trovato per questa ricerca.'}
          </p>
          <p class="text-xs text-slate-400 mt-1">
            ${isSharedTab ? 'Quando un altro docente condivide un percorso o quando attivi la spunta sui tuoi, apparirà qui!' : 'Crea un nuovo percorso con l\'IA o importa un file per iniziare.'}
          </p>
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
      const isShared = Boolean(proj.isShared);

      if (isSharedTab) {
        // --- CARD PROGETTO CONDIVISO DALLA COMMUNITY ---
        return `
          <div class="p-4 rounded-xl border border-amber-200 hover:border-amber-400 hover:shadow-md bg-amber-50/20 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap mb-1.5">
                <span class="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1">
                  <span>👤 Autore:</span>
                  <span class="font-extrabold">${proj.authorName || proj.authorUser || 'Docente'}</span>
                </span>
                <span class="px-2 py-0.5 rounded-md text-[11px] font-bold border ${gradeBadgeClass}">
                  ${gradeBadgeText}
                </span>
                <span class="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
                  ${proj.cardCount || 0} passaggi
                </span>
                ${proj.hasMoral ? '<span class="px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-100 text-amber-800 border border-amber-200">✨ Morale</span>' : ''}
              </div>

              <h4 class="text-base font-bold text-slate-900 truncate">
                ${proj.title || 'Senza Titolo'}
              </h4>
              ${proj.subtitle ? `<p class="text-xs text-slate-500 line-clamp-1 mt-0.5">${proj.subtitle}</p>` : ''}
              
              <p class="text-[11px] text-slate-400 mt-1 flex items-center gap-1">
                <span>Condiviso: ${formattedDate}</span>
              </p>
            </div>

            <div class="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
              <button type="button" onclick="window.app.loadSharedProjectById('${safeId}')" class="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1.5" title="Visualizza questo percorso condiviso a video">
                <span>📂 Apri a video</span>
              </button>
              <button type="button" onclick="window.app.cloneSharedProjectById('${safeId}')" class="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition flex items-center gap-1" title="Crea una tua copia personale modificabile">
                <span>📥 Salva tra i miei</span>
              </button>
              <button type="button" onclick="window.app.exportSharedProjectById('${safeId}')" class="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg text-xs transition" title="Scarica file JSON">
                ⬇️
              </button>
            </div>
          </div>
        `;
      }

      // --- CARD PROGETTO PERSONALE CON SPUNTA CONDIVIDI ---
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
            
            <div class="flex flex-wrap items-center gap-3 mt-2">
              <p class="text-[11px] text-slate-400 flex items-center gap-1">
                <span>Modificato: ${formattedDate}</span>
              </p>

              <!-- Spunta per decidere se condividere o meno il progetto personale -->
              <label class="inline-flex items-center gap-1.5 cursor-pointer select-none px-2.5 py-0.5 rounded-lg border text-[11px] transition ${isShared ? 'bg-emerald-50 border-emerald-300 text-emerald-800 font-bold' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'}" title="Spunta per rendere visibile questo progetto a tutti i colleghi nella sezione Condivisi">
                <input type="checkbox" ${isShared ? 'checked' : ''} onchange="window.app.handleToggleProjectShare('${safeId}', this.checked)" class="w-3.5 h-3.5 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500 cursor-pointer">
                <span>${isShared ? '🌐 Condiviso con colleghi' : '🔒 Privato (non condiviso)'}</span>
              </label>
            </div>
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
   * Gestisce il cambio di stato della spunta di condivisione di un progetto.
   */
  async handleToggleProjectShare(projectId, isShared) {
    try {
      const ok = await ProjectManager.toggleShareProject(projectId, isShared);
      if (ok) {
        this.showToast(isShared ? '🌐 Progetto condiviso con tutti i colleghi!' : '🔒 Progetto reso privato.');
      } else {
        this.showToast('Aggiornato in locale (sincronizzazione cloud in corso)', 'info');
      }
      await this.refreshProjectsCount();
      this.applyProjectsFilter();
    } catch (e) {
      this.showToast(`Errore condivisione: ${e.message}`, 'error');
    }
  }

  /**
   * Richiama e visualizza a video un progetto condiviso da un altro utente.
   */
  async loadSharedProjectById(projectId) {
    if (!projectId) return;

    this.setLoadingState(true, 'Caricamento progetto condiviso...');
    try {
      const fullLesson = await ProjectManager.getSharedProject(projectId);
      
      // Assicura che i token abbiano i pittogrammi
      await LessonRenderer.prepareLesson(fullLesson);

      const container = document.getElementById('printableArea');
      LessonRenderer.render(container, fullLesson);

      document.getElementById('lessonActions')?.classList.remove('hidden');
      document.getElementById('emptyState')?.classList.add('hidden');

      this.currentLesson = fullLesson;
      this.markClean();

      this.closeProjectsModal();
      this.showToast(`Percorso condiviso "${fullLesson.title}" caricato a video!`);
      container.scrollIntoView({ behavior: 'smooth' });
    } catch (e) {
      console.error(e);
      this.showToast(`Errore caricamento: ${e.message}`, 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  /**
   * Clona un progetto condiviso salvandone una copia modificabile nei propri percorsi.
   */
  async cloneSharedProjectById(projectId) {
    if (!projectId) return;

    this.setLoadingState(true, 'Salvataggio copia nei tuoi percorsi...');
    try {
      const fullLesson = await ProjectManager.getSharedProject(projectId);
      const res = await ProjectManager.cloneSharedProject(fullLesson);

      await this.refreshProjectsCount();
      this.switchProjectsTab('mine');
      this.showToast(`Copia salvata con successo nei tuoi percorsi!`, 'success');
    } catch (e) {
      console.error(e);
      this.showToast(`Errore copia: ${e.message}`, 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  /**
   * Esporta un progetto condiviso come JSON.
   */
  async exportSharedProjectById(projectId) {
    try {
      const project = await ProjectManager.getSharedProject(projectId);
      ProjectManager.exportProjectFile(project);
    } catch (e) {
      this.showToast(`Errore download: ${e.message}`, 'error');
    }
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

  takeProjectSnapshot(lesson) {
    return lesson ? JSON.stringify(lesson) : null;
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

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

  /* ==========================================================================
     METODI DI AUTENTICAZIONE, GESTIONE UTENTI & BACKUP ARCHIVIO
     ========================================================================== */

  setupAuthUI() {
    const loginModal = document.getElementById('loginModal');
    const userBadgeName = document.getElementById('userBadgeName');
    const btnOpenUsersModal = document.getElementById('btnOpenUsersModal');
    const userKeyMissingBanner = document.getElementById('userKeyMissingBanner');

    if (!AuthManager.isAuthenticated()) {
      if (loginModal) loginModal.classList.remove('hidden');
      return;
    }

    if (loginModal) loginModal.classList.add('hidden');

    const user = AuthManager.currentUser;
    if (userBadgeName) {
      userBadgeName.textContent = user.role === 'admin' ? `${user.username} (Admin)` : user.username;
    }

    if (btnOpenUsersModal) {
      if (AuthManager.isAdmin()) {
        btnOpenUsersModal.classList.remove('hidden');
        btnOpenUsersModal.classList.add('inline-flex');
      } else {
        btnOpenUsersModal.classList.add('hidden');
        btnOpenUsersModal.classList.remove('inline-flex');
      }
    }

    // Per utenti non-admin: controlla se hanno inserito la propria chiave Gemini
    if (userKeyMissingBanner) {
      if (!AuthManager.isAdmin() && !AuthManager.getUserApiKey()) {
        userKeyMissingBanner.classList.remove('hidden');
      } else {
        userKeyMissingBanner.classList.add('hidden');
      }
    }
  }

  async handleLoginSubmit() {
    const userInput = document.getElementById('inputLoginUsername');
    const passInput = document.getElementById('inputLoginPassword');
    const errorBox = document.getElementById('loginErrorMessage');
    const submitBtn = document.querySelector('#formLogin button[type="submit"]');

    const u = userInput ? userInput.value : '';
    const p = passInput ? passInput.value : '';

    if (errorBox) errorBox.classList.add('hidden');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifica in corso...';
    }

    try {
      const res = await AuthManager.login(u, p);
      if (!res.success) {
        if (errorBox) {
          errorBox.textContent = res.message;
          errorBox.classList.remove('hidden');
        }
        return;
      }

      if (errorBox) errorBox.classList.add('hidden');
      const loginModal = document.getElementById('loginModal');
      if (loginModal) loginModal.classList.add('hidden');

      this.setupAuthUI();
      this.updateConfigStatusUI();
      await this.refreshProjectsCount();
      this.refreshCustomPictosBadge();
      this.refreshSharedPictosBadge().catch(() => {});
      this.showToast(`Benvenuto, ${res.user.name || res.user.username}!`, 'success');
    } catch (e) {
      if (errorBox) {
        errorBox.textContent = 'Errore durante l\'accesso: ' + e.message;
        errorBox.classList.remove('hidden');
      }
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Accedi alla Suite';
      }
    }
  }

  handleLogout() {
    AuthManager.logout();
    this.showToast('Disconnessione effettuata.');
    const loginModal = document.getElementById('loginModal');
    if (loginModal) {
      const userInput = document.getElementById('inputLoginUsername');
      const passInput = document.getElementById('inputLoginPassword');
      if (passInput) passInput.value = '';
      loginModal.classList.remove('hidden');
    }
    this.setupAuthUI();
  }

  renderUsersList() {
    const container = document.getElementById('usersListContainer');
    if (!container) return;

    const users = AuthManager.getUsersList();
    if (!users || users.length === 0) {
      container.innerHTML = '<p class="text-xs text-slate-400">Nessun utente registrato.</p>';
      return;
    }

    container.innerHTML = users.map(u => {
      const isAdmin = (u.role === 'admin') || (u.username.toLowerCase() === 'rocco');
      const hasKey = AuthManager.getUserApiKey() || (isAdmin ? 'Configurata (Admin)' : '');
      const userKey = !isAdmin ? localStorage.getItem(`caa_user_gemini_key_${u.username.toLowerCase()}`) : 'Default di Sistema';

      return `
        <div class="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
          <div class="flex items-center gap-2.5">
            <span class="w-8 h-8 rounded-full ${isAdmin ? 'bg-purple-600 text-white' : 'bg-blue-100 text-blue-800'} flex items-center justify-center font-bold">
              ${u.username.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <div class="flex items-center gap-1.5">
                <span class="font-bold text-slate-900">${this.escapeHtml(u.username)}</span>
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${isAdmin ? 'bg-purple-100 text-purple-800' : 'bg-slate-200 text-slate-700'}">
                  ${isAdmin ? 'Amministratore' : 'Docente'}
                </span>
              </div>
              <p class="text-[11px] text-slate-500 mt-0.5">
                Chiave IA: <span class="${userKey ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}">${userKey ? 'Presente ✓' : 'Non ancora inserita'}</span>
              </p>
            </div>
          </div>

          <div>
            ${isAdmin ? `
              <span class="text-[11px] text-slate-400 italic px-2">Principale</span>
            ` : `
              <button type="button" 
                      class="px-2.5 py-1 text-xs text-rose-700 hover:bg-rose-100 rounded-lg border border-rose-200 font-medium transition"
                      onclick="window.app.handleDeleteUser('${this.escapeHtml(u.username)}')">
                🗑️ Elimina
              </button>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  handleCreateUser() {
    const userInput = document.getElementById('inputNewUsername');
    const passInput = document.getElementById('inputNewPassword');
    const msgBox = document.getElementById('createUserMessage');

    const u = userInput ? userInput.value : '';
    const p = passInput ? passInput.value : '';

    const res = AuthManager.createUser(u, p);
    if (!res.success) {
      if (msgBox) {
        msgBox.textContent = res.message;
        msgBox.className = 'text-xs font-semibold text-rose-600';
      }
      return;
    }

    if (userInput) userInput.value = '';
    if (passInput) passInput.value = '';
    if (msgBox) {
      msgBox.textContent = `Utente "${res.user.username}" creato con successo!`;
      msgBox.className = 'text-xs font-semibold text-emerald-600';
      setTimeout(() => { msgBox.textContent = ''; }, 3000);
    }

    this.renderUsersList();
    this.showToast(`Utente "${res.user.username}" aggiunto.`);
  }

  handleDeleteUser(username) {
    if (!confirm(`Sei sicuro di voler eliminare l'account "${username}"?`)) {
      return;
    }

    const res = AuthManager.deleteUser(username);
    if (!res.success) {
      this.showToast(res.message, 'error');
      return;
    }

    this.renderUsersList();
    this.showToast(`Utente "${username}" rimosso.`);
  }

  async handleExportFullArchive() {
    this.setLoadingState(true, 'Creazione archivio completo in corso...');
    try {
      const username = AuthManager.currentUser?.username || 'utente';
      const stats = await BackupManager.exportFullArchive(username);
      this.showToast(`Archivio esportato (${stats.totalProjects} progetti, ${stats.totalCustomPictograms} simboli IA)!`);
    } catch (err) {
      this.showToast(`Errore esportazione: ${err.message}`, 'error');
    } finally {
      this.setLoadingState(false);
    }
  }

  async handleImportFullArchive(file) {
    if (!file) return;
    this.setLoadingState(true, 'Analisi e importazione archivio con deduplicazione...');
    try {
      const text = await file.text();
      const report = await BackupManager.importArchive(text);

      let msg = `Importati: ${report.projectsImported} progetti, ${report.pictogramsImported} simboli IA.`;
      if (report.projectsSkipped > 0 || report.pictogramsSkipped > 0) {
        msg += ` (${report.projectsSkipped} progetti e ${report.pictogramsSkipped} simboli già esistenti saltati senza duplicati).`;
      }

      this.showToast(msg);
      await this.refreshProjectsCount();
      this.refreshCustomPictosBadge();
      await this.openProjectsModal();
    } catch (err) {
      this.showToast(`Errore importazione: ${err.message}`, 'error');
    } finally {
      this.setLoadingState(false);
    }
  }
}

// Inizializzazione globale
window.CustomPictogramsManager = CustomPictogramsManager;
window.ProjectManager = ProjectManager;
window.app = new CAAApp();
document.addEventListener('DOMContentLoaded', () => {
  window.app.init();
});
