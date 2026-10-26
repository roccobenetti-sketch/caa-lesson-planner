/**
 * ProjectManager: Gestione salvataggio, richiamo e archiviazione locale/server
 * dei percorsi didattici CAA.
 */

export class ProjectManager {
  static LOCAL_STORAGE_KEY = 'caa_saved_projects_v1';

  /**
   * Recupera la lista di tutti i progetti salvati (server + fallback localStorage).
   */
  static async listProjects() {
    let serverProjects = [];
    try {
      const resp = await fetch('/api/projects');
      if (resp.ok) {
        const data = await resp.json();
        serverProjects = data.projects || [];
      }
    } catch (e) {
      console.warn('Impossibile recuperare i progetti dal server:', e);
    }

    // Lettura backup locale in localStorage
    let localProjects = [];
    try {
      const stored = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      if (stored) {
        localProjects = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Errore lettura localStorage progetti:', e);
    }

    // Unione dei progetti (priorità al server o unione per id univoco)
    const projectsMap = new Map();
    for (const p of localProjects) {
      if (p && p.id) projectsMap.set(p.id, p);
    }
    for (const p of serverProjects) {
      if (p && p.id) projectsMap.set(p.id, p);
    }

    const merged = Array.from(projectsMap.values());
    merged.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    return merged;
  }

  /**
   * Carica il file completo di un progetto a partire dal suo id.
   */
  static async getProject(projectId) {
    if (!projectId) throw new Error('ID progetto mancante.');

    // Tentativo primario via server
    try {
      const resp = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`);
      if (resp.ok) {
        const fullData = await resp.json();
        if (fullData && (fullData.cards || fullData.title)) {
          return fullData;
        }
      }
    } catch (e) {
      console.warn(`Errore caricamento server per ${projectId}:`, e);
    }

    // Fallback in localStorage
    try {
      const stored = localStorage.getItem(`caa_proj_full_${projectId}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Errore fallback localStorage:', e);
    }

    throw new Error('Progetto non trovato sul server né in memoria locale.');
  }

  /**
   * Salva o aggiorna un percorso CAA sia su disco server che in memoria locale.
   */
  static async saveProject(lessonData, customTitle = null) {
    if (!lessonData) throw new Error('Nessun progetto da salvare.');

    if (customTitle && customTitle.trim()) {
      lessonData.title = customTitle.trim();
    }

    if (!lessonData.id) {
      const raw = (lessonData.title || 'progetto').toLowerCase();
      const clean = raw.replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').slice(0, 30);
      lessonData.id = `${clean}_${Date.now()}`;
    }

    const nowIso = new Date().toISOString();
    if (!lessonData.createdAt) lessonData.createdAt = nowIso;
    lessonData.updatedAt = nowIso;

    // Salvataggio server
    let savedOnServer = false;
    try {
      const resp = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lessonData)
      });
      if (resp.ok) {
        const res = await resp.json();
        lessonData.id = res.id || lessonData.id;
        savedOnServer = true;
      }
    } catch (e) {
      console.warn('Errore salvataggio server (verrà salvato in locale):', e);
    }

    // Salvataggio di riserva in localStorage
    try {
      localStorage.setItem(`caa_proj_full_${lessonData.id}`, JSON.stringify(lessonData));

      // Aggiorna anche l'elenco riassuntivo
      const summary = {
        id: lessonData.id,
        title: lessonData.title,
        subtitle: lessonData.subtitle || '',
        targetGrade: lessonData.targetGrade || 'infanzia',
        primaryClass: lessonData.primaryClass || '',
        layoutType: lessonData.layoutType || 'routine',
        cardCount: (lessonData.cards || []).length,
        hasMoral: Boolean(lessonData.moral),
        createdAt: lessonData.createdAt,
        updatedAt: lessonData.updatedAt
      };

      const stored = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      let list = stored ? JSON.parse(stored) : [];
      list = list.filter(item => item.id !== lessonData.id);
      list.unshift(summary);
      localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Errore memorizzazione localStorage:', e);
    }

    return {
      success: true,
      id: lessonData.id,
      savedOnServer,
      project: lessonData
    };
  }

  /**
   * Elimina un progetto sia dal server che da localStorage.
   */
  static async deleteProject(projectId) {
    if (!projectId) return;

    try {
      await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.warn(`Errore cancellazione server per ${projectId}:`, e);
    }

    try {
      localStorage.removeItem(`caa_proj_full_${projectId}`);
      const stored = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      if (stored) {
        let list = JSON.parse(stored);
        list = list.filter(item => item.id !== projectId);
        localStorage.setItem(this.LOCAL_STORAGE_KEY, JSON.stringify(list));
      }
    } catch (e) {
      console.warn('Errore pulizia localStorage:', e);
    }

    return { success: true };
  }

  /**
   * Scarica il file JSON del progetto sul computer dell'utente.
   */
  static exportProjectFile(lessonData) {
    if (!lessonData) return;
    const safeTitle = (lessonData.title || 'lezione-caa')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-');
    const blob = new Blob([JSON.stringify(lessonData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
