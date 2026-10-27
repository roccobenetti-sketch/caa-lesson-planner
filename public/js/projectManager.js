/**
 * ProjectManager: Gestione salvataggio, richiamo e sincronizzazione Cloud + Locale
 * dei percorsi didattici CAA associati al profilo utente.
 */

import { AuthManager } from './authManager.js?v=2.7.0';

export class ProjectManager {
  static LOCAL_STORAGE_KEY = 'caa_saved_projects_v1';
  static CLOUD_API = 'https://caa-api.roccobenetti.workers.dev/api/sync/projects';
  static SHARED_CLOUD_API = 'https://caa-api.roccobenetti.workers.dev/api/sync/shared-projects';
  static TOGGLE_SHARE_API = 'https://caa-api.roccobenetti.workers.dev/api/sync/projects/share-toggle';

  static getUsername() {
    return AuthManager.currentUser?.username?.toLowerCase() || 'rocco';
  }

  /**
   * Recupera la lista di tutti i progetti salvati (Cloud KV + Locale).
   */
  static async listProjects() {
    const user = this.getUsername();
    let cloudProjects = [];

    // 1. Tentativo di sincronizzazione Cloud KV
    try {
      const resp = await fetch(`${this.CLOUD_API}?user=${encodeURIComponent(user)}`, {
        cache: 'no-store'
      });
      if (resp.ok) {
        const data = await resp.json();
        cloudProjects = data.projects || [];
      }
    } catch (e) {
      console.warn('Sincronizzazione Cloud non raggiungibile (uso memoria locale):', e);
    }

    // 2. Lettura progetti locali
    let localProjects = [];
    try {
      const stored = localStorage.getItem(`${this.LOCAL_STORAGE_KEY}_${user}`) || localStorage.getItem(this.LOCAL_STORAGE_KEY);
      if (stored) {
        localProjects = JSON.parse(stored);
      }
    } catch (e) {
      console.warn('Errore lettura localStorage progetti:', e);
    }

    // 3. Unione e deduplicazione
    const projectsMap = new Map();
    for (const p of localProjects) {
      if (p && p.id) projectsMap.set(p.id, p);
    }
    for (const p of cloudProjects) {
      if (p && p.id) projectsMap.set(p.id, p);
    }

    const merged = Array.from(projectsMap.values());
    merged.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return dateB - dateA;
    });

    // Salva l'unione aggiornata in locale per garantire funzionamento offline istantaneo
    try {
      localStorage.setItem(`${this.LOCAL_STORAGE_KEY}_${user}`, JSON.stringify(merged));
    } catch (e) {}

    return merged;
  }

  /**
   * Carica il file completo di un progetto a partire dal suo id.
   */
  static async getProject(projectId) {
    if (!projectId) throw new Error('ID progetto mancante.');
    const user = this.getUsername();

    // 1. Controlla prima in memoria locale (apertura istantanea a zero latenza)
    try {
      const stored = localStorage.getItem(`caa_proj_full_${projectId}`);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {}

    // 2. Recupero dal Cloud KV
    try {
      const resp = await fetch(`${this.CLOUD_API}?user=${encodeURIComponent(user)}&id=${encodeURIComponent(projectId)}`);
      if (resp.ok) {
        const fullData = await resp.json();
        if (fullData && fullData.project) {
          // Salva anche in locale per aperture future
          localStorage.setItem(`caa_proj_full_${projectId}`, JSON.stringify(fullData.project));
          return fullData.project;
        }
      }
    } catch (e) {
      console.warn(`Errore caricamento cloud per ${projectId}:`, e);
    }

    // 3. Tentativo con il server Python locale (se presente)
    try {
      const resp = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`);
      if (resp.ok) {
        const fullData = await resp.json();
        if (fullData && (fullData.cards || fullData.title)) {
          return fullData;
        }
      }
    } catch (e) {}

    throw new Error('Progetto non trovato in memoria locale né nel Cloud.');
  }

  /**
   * Salva o aggiorna un percorso CAA sia in memoria locale che su Cloud KV.
   */
  static async saveProject(lessonData, customTitle = null) {
    if (!lessonData) throw new Error('Nessun progetto da salvare.');
    const user = this.getUsername();

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
    lessonData.authorUser = user;

    // 1. Salvataggio immediato in memoria locale
    try {
      localStorage.setItem(`caa_proj_full_${lessonData.id}`, JSON.stringify(lessonData));

      const isShared = Boolean(lessonData.isShared);

      const summary = {
        id: lessonData.id,
        title: lessonData.title,
        subtitle: lessonData.subtitle || '',
        targetGrade: lessonData.targetGrade || 'infanzia',
        primaryClass: lessonData.primaryClass || '',
        layoutType: lessonData.layoutType || 'routine',
        cardCount: (lessonData.cards || []).length,
        hasMoral: Boolean(lessonData.moral),
        isShared: isShared,
        createdAt: lessonData.createdAt,
        updatedAt: lessonData.updatedAt,
        authorUser: user
      };

      const storageKey = `${this.LOCAL_STORAGE_KEY}_${user}`;
      const stored = localStorage.getItem(storageKey);
      let list = stored ? JSON.parse(stored) : [];
      list = list.filter(item => item.id !== lessonData.id);
      list.unshift(summary);
      localStorage.setItem(storageKey, JSON.stringify(list));
    } catch (e) {
      console.warn('Errore memorizzazione localStorage:', e);
    }

    // 2. Sincronizzazione Cloud KV in background
    let savedOnCloud = false;
    try {
      const resp = await fetch(this.CLOUD_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user,
          authorName: AuthManager.currentUser?.name || user,
          project: lessonData
        })
      });
      if (resp.ok) {
        savedOnCloud = true;
      }
    } catch (e) {
      console.warn('Sincronizzazione cloud non riuscita (salvato in locale):', e);
    }

    return {
      success: true,
      id: lessonData.id,
      savedOnCloud,
      project: lessonData
    };
  }

  /**
   * Modifica lo stato di condivisione pubblica di un progetto.
   */
  static async toggleShareProject(projectId, isShared) {
    if (!projectId) return false;
    const user = this.getUsername();
    const isSharedBool = Boolean(isShared);

    // 1. Aggiorna in locale il file completo
    try {
      const storedFull = localStorage.getItem(`caa_proj_full_${projectId}`);
      if (storedFull) {
        const parsed = JSON.parse(storedFull);
        parsed.isShared = isSharedBool;
        parsed.updatedAt = new Date().toISOString();
        localStorage.setItem(`caa_proj_full_${projectId}`, JSON.stringify(parsed));
      }

      // Aggiorna l'indice locale
      const storageKey = `${this.LOCAL_STORAGE_KEY}_${user}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        let list = JSON.parse(stored);
        const item = list.find(p => p.id === projectId);
        if (item) {
          item.isShared = isSharedBool;
          item.updatedAt = new Date().toISOString();
          localStorage.setItem(storageKey, JSON.stringify(list));
        }
      }
    } catch (e) {
      console.warn('Errore aggiornamento locale condivisione:', e);
    }

    // 2. Aggiorna sul Cloudflare Worker KV
    try {
      const resp = await fetch(this.TOGGLE_SHARE_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user,
          projectId,
          isShared: isSharedBool,
          authorName: AuthManager.currentUser?.name || user
        })
      });
      return resp.ok;
    } catch (e) {
      console.warn('Errore sincronizzazione cloud share-toggle:', e);
      return false;
    }
  }

  /**
   * Recupera l'elenco di tutti i progetti condivisi dagli altri utenti/docenti.
   */
  static async fetchSharedProjects() {
    try {
      const resp = await fetch(this.SHARED_CLOUD_API, {
        cache: 'no-store'
      });
      if (resp.ok) {
        const data = await resp.json();
        return data.sharedProjects || [];
      }
    } catch (e) {
      console.warn('Errore recupero progetti condivisi dal Cloud:', e);
    }
    return [];
  }

  /**
   * Recupera il file completo di un progetto condiviso da un altro utente.
   */
  static async getSharedProject(projectId) {
    if (!projectId) throw new Error('ID progetto mancante');
    
    // Controlla prima la cache locale
    try {
      const cached = localStorage.getItem(`caa_shared_full_${projectId}`);
      if (cached) return JSON.parse(cached);
    } catch (e) {}

    // Recupera dal cloud
    const resp = await fetch(`${this.SHARED_CLOUD_API}?id=${encodeURIComponent(projectId)}`, {
      cache: 'no-store'
    });
    if (!resp.ok) throw new Error('Impossibile caricare il progetto condiviso.');
    const data = await resp.json();
    if (!data.project) throw new Error('Progetto condiviso vuoto o non trovato.');

    try {
      localStorage.setItem(`caa_shared_full_${projectId}`, JSON.stringify(data.project));
    } catch (e) {}

    return data.project;
  }

  /**
   * Clona un progetto condiviso creandone una copia personale nei propri progetti.
   */
  static async cloneSharedProject(sharedProject) {
    if (!sharedProject) throw new Error('Progetto da clonare non valido');
    const user = this.getUsername();
    
    const cloned = JSON.parse(JSON.stringify(sharedProject));
    const rawTitle = cloned.title || 'Percorso Condiviso';
    cloned.title = rawTitle.startsWith('Copia di ') ? rawTitle : `Copia di ${rawTitle}`;
    cloned.id = `cloned_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    cloned.authorUser = user;
    cloned.isShared = false; // La copia nasce come privata
    cloned.createdAt = new Date().toISOString();
    cloned.updatedAt = cloned.createdAt;

    return await this.saveProject(cloned);
  }

  /**
   * Elimina un progetto sia da locale che dal Cloud.
   */
  static async deleteProject(projectId) {
    if (!projectId) return;
    const user = this.getUsername();

    // 1. Eliminazione locale
    try {
      localStorage.removeItem(`caa_proj_full_${projectId}`);
      const storageKey = `${this.LOCAL_STORAGE_KEY}_${user}`;
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        let list = JSON.parse(stored);
        list = list.filter(item => item.id !== projectId);
        localStorage.setItem(storageKey, JSON.stringify(list));
      }
    } catch (e) {}

    // 2. Eliminazione dal Cloud KV
    try {
      await fetch(`${this.CLOUD_API}?user=${encodeURIComponent(user)}&id=${encodeURIComponent(projectId)}`, {
        method: 'DELETE'
      });
    } catch (e) {
      console.warn('Errore cancellazione cloud:', e);
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
