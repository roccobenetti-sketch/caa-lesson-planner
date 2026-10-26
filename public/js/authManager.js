/**
 * AuthManager: Gestione autenticazione utenti, ruoli (Admin/User),
 * credenziali, sessione e isolamento delle chiavi API Gemini.
 */

const STORAGE_USERS = 'caa_auth_users';
const STORAGE_CURRENT_USER = 'caa_auth_current_user';
const CLOUD_USERS_API = 'https://caa-api.roccobenetti.workers.dev/api/sync/users';

// Utente amministratore predefinito
const DEFAULT_ADMIN = {
  username: 'rocco',
  role: 'admin',
  createdAt: '2026-10-27T00:00:00.000Z',
  name: 'Rocco (Amministratore)'
};

const DEFAULT_ADMIN_PASS = 'rocco76@-Angy';

export const AuthManager = {
  currentUser: null,

  /**
   * Inizializza il sistema di autenticazione e carica gli utenti.
   */
  async init() {
    this.ensureAdminUser();
    this.restoreSession();
    await this.syncUsersFromCloud();
  },

  /**
   * Sincronizza l'elenco utenti dal Cloud in modo che un docente creato
   * su un PC possa accedere istantaneamente da qualsiasi altro dispositivo.
   */
  async syncUsersFromCloud() {
    try {
      const resp = await fetch(CLOUD_USERS_API, { cache: 'no-store' });
      if (resp.ok) {
        const data = await resp.json();
        const cloudUsers = data.users || [];
        if (cloudUsers.length > 0) {
          let localUsers = this.getUsersList();
          const map = new Map();
          for (const u of localUsers) map.set(u.username.toLowerCase(), u);
          for (const u of cloudUsers) map.set(u.username.toLowerCase(), u);
          const merged = Array.from(map.values());
          localStorage.setItem(STORAGE_USERS, JSON.stringify(merged));
        }
      }
    } catch (e) {}
  },

  /**
   * Assicura che l'admin predefinito sia presente nell'archivio utenti.
   */
  ensureAdminUser() {
    try {
      let users = this.getUsersList();
      const adminExists = users.some(u => u.username.toLowerCase() === DEFAULT_ADMIN.username.toLowerCase());
      if (!adminExists) {
        users.unshift({
          ...DEFAULT_ADMIN,
          password: DEFAULT_ADMIN_PASS
        });
        localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
      }
    } catch (e) {
      console.error('Errore inizializzazione utenti:', e);
    }
  },

  /**
   * Restituisce tutti gli utenti registrati.
   */
  getUsersList() {
    try {
      const data = localStorage.getItem(STORAGE_USERS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  },

  /**
   * Recupera la sessione dell'utente correntemente autenticato.
   */
  restoreSession() {
    try {
      const data = localStorage.getItem(STORAGE_CURRENT_USER);
      if (data) {
        this.currentUser = JSON.parse(data);
      } else {
        this.currentUser = null;
      }
    } catch (e) {
      this.currentUser = null;
    }
    return this.currentUser;
  },

  /**
   * Effettua il login verificando username e password.
   */
  login(username, password) {
    if (!username || !password) {
      return { success: false, message: 'Inserisci nome utente e password.' };
    }

    const cleanUser = username.trim().toLowerCase();
    const cleanPass = password.trim();

    const users = this.getUsersList();
    const found = users.find(u => u.username.toLowerCase() === cleanUser);

    if (!found) {
      return { success: false, message: 'Nome utente non trovato.' };
    }

    if (found.password !== cleanPass) {
      return { success: false, message: 'Password errata.' };
    }

    // Salva sessione attiva
    const sessionUser = {
      username: found.username,
      role: found.role || 'user',
      name: found.name || found.username,
      loginTime: new Date().toISOString()
    };

    this.currentUser = sessionUser;
    localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(sessionUser));

    return { success: true, user: sessionUser };
  },

  /**
   * Effettua il logout.
   */
  logout() {
    this.currentUser = null;
    localStorage.removeItem(STORAGE_CURRENT_USER);
  },

  /**
   * Verifica se l'utente corrente è autenticato.
   */
  isAuthenticated() {
    return Boolean(this.currentUser && this.currentUser.username);
  },

  /**
   * Verifica se l'utente corrente è amministratore.
   */
  isAdmin() {
    return Boolean(this.currentUser && this.currentUser.role === 'admin');
  },

  /**
   * Crea un nuovo utente (riservato all'amministratore).
   */
  createUser(newUsername, newPassword, displayName = '') {
    if (!this.isAdmin()) {
      return { success: false, message: 'Azione consentita solo all\'amministratore.' };
    }

    const u = (newUsername || '').trim();
    const p = (newPassword || '').trim();

    if (u.length < 3) {
      return { success: false, message: 'Il nome utente deve avere almeno 3 caratteri.' };
    }
    if (p.length < 4) {
      return { success: false, message: 'La password deve avere almeno 4 caratteri.' };
    }

    let users = this.getUsersList();
    if (users.some(existing => existing.username.toLowerCase() === u.toLowerCase())) {
      return { success: false, message: `L'utente "${u}" esiste già.` };
    }

    const newUser = {
      username: u,
      password: p,
      role: 'user',
      name: displayName.trim() || u,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    localStorage.setItem(STORAGE_USERS, JSON.stringify(users));

    // Sincronizza nel Cloud KV
    fetch(CLOUD_USERS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: newUser })
    }).catch(() => {});

    return { success: true, user: newUser };
  },

  /**
   * Elimina un utente (riservato all'amministratore).
   */
  deleteUser(usernameToDelete) {
    if (!this.isAdmin()) {
      return { success: false, message: 'Azione consentita solo all\'amministratore.' };
    }

    if (usernameToDelete.toLowerCase() === DEFAULT_ADMIN.username.toLowerCase()) {
      return { success: false, message: 'Non è possibile eliminare l\'amministratore principale.' };
    }

    let users = this.getUsersList();
    const initialLen = users.length;
    users = users.filter(u => u.username.toLowerCase() !== usernameToDelete.toLowerCase());

    if (users.length === initialLen) {
      return { success: false, message: 'Utente non trovato.' };
    }

    localStorage.setItem(STORAGE_USERS, JSON.stringify(users));

    // Rimuove dal Cloud KV
    fetch(`${CLOUD_USERS_API}?username=${encodeURIComponent(usernameToDelete)}`, {
      method: 'DELETE'
    }).catch(() => {});

    // Rimuove anche la chiave API specifica dell'utente
    localStorage.removeItem(`caa_user_gemini_key_${usernameToDelete.toLowerCase()}`);

    return { success: true };
  },

  /**
   * Gestione della chiave API Gemini specifica dell'utente corrente.
   */
  getUserApiKey() {
    if (!this.currentUser) return '';
    if (this.isAdmin()) {
      // Per l'admin, la chiave salvata specifica o quella di sistema
      return localStorage.getItem('caa_user_gemini_key_admin') || '';
    }
    return localStorage.getItem(`caa_user_gemini_key_${this.currentUser.username.toLowerCase()}`) || '';
  },

  setUserApiKey(key) {
    if (!this.currentUser) return;
    const cleanKey = (key || '').trim();
    const storageKey = this.isAdmin() 
      ? 'caa_user_gemini_key_admin' 
      : `caa_user_gemini_key_${this.currentUser.username.toLowerCase()}`;

    if (cleanKey) {
      localStorage.setItem(storageKey, cleanKey);
    } else {
      localStorage.removeItem(storageKey);
    }
  }
};
