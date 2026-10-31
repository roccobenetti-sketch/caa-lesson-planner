/**
 * AuthManager per CAA IN-Book Studio.
 * Gestisce l'autenticazione, la sincronizzazione utenti con il Cloud e
 * il Single Sign-On automatico (SSO) dall'app Interpelli Scuola Mobile.
 */

const STORAGE_USERS = 'caa_auth_users';
const STORAGE_CURRENT_USER = 'caa_auth_current_user';
const CLOUD_USERS_API = 'https://caa-api.roccobenetti.workers.dev/api/sync/users';
const CLOUD_AUTH_LOGIN_API = 'https://caa-api.roccobenetti.workers.dev/api/auth/login';

const DEFAULT_ADMIN = {
  username: 'rocco',
  role: 'admin',
  createdAt: '2026-10-27T00:00:00.000Z',
  name: 'Rocco (Amministratore)'
};

const DEFAULT_ADMIN_PASS = 'rocco76@-Angy';

export const AuthManager = {
  currentUser: null,

  async init() {
    this.ensureAdminUser();
    if (!this.currentUser) {
      const hasSso = this.handleSsoLogin();
      if (!hasSso) {
        this.restoreSession();
      }
    }
    await this.syncUsersFromCloud();
  },

  handleSsoLogin() {
    try {
      if (typeof window === 'undefined' || !window.location) return false;
      const params = new URLSearchParams(window.location.search);
      const ssoUser = params.get('sso_user');
      const ssoPass = params.get('sso_pass');
      const ssoAuth = params.get('sso_auth');
      const ssoRole = params.get('sso_role') || 'user';
      const ssoName = params.get('sso_name');

      if (ssoUser && ssoAuth === 'ism_app_session') {
        const cleanUser = ssoUser.toLowerCase().trim();
        const isRocco = cleanUser === 'rocco';
        const displayName = isRocco
          ? 'Rocco (Amministratore)'
          : (ssoName || (cleanUser.charAt(0).toUpperCase() + cleanUser.slice(1)));

        const sessionUser = {
          username: cleanUser,
          role: isRocco ? 'admin' : (ssoRole === 'admin' ? 'admin' : 'user'),
          name: displayName,
          fromApp: true,
          loginTime: new Date().toISOString()
        };

        this.currentUser = sessionUser;
        localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(sessionUser));

        let localUsers = this.getUsersList();
        const existing = localUsers.find(u => u.username.toLowerCase() === cleanUser);
        const userToSave = {
          username: cleanUser,
          password: ssoPass || existing?.password || '',
          role: sessionUser.role,
          name: displayName,
          createdAt: existing?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        localUsers = localUsers.filter(u => u.username.toLowerCase() !== cleanUser);
        localUsers.push(userToSave);
        localStorage.setItem(STORAGE_USERS, JSON.stringify(localUsers));

        fetch(CLOUD_USERS_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user: userToSave })
        }).catch(() => {});

        const cleanUrl = window.location.pathname + (window.location.hash || '');
        window.history.replaceState({}, document.title, cleanUrl);
        return true;
      }
    } catch (e) {
      console.warn('Errore gestione SSO IN-Book:', e);
    }
    return false;
  },

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

  ensureAdminUser() {
    try {
      let users = this.getUsersList();
      const adminExists = users.some(u => u.username.toLowerCase() === DEFAULT_ADMIN.username.toLowerCase());
      if (!adminExists) {
        users.push({
          ...DEFAULT_ADMIN,
          password: DEFAULT_ADMIN_PASS
        });
        localStorage.setItem(STORAGE_USERS, JSON.stringify(users));
      }
    } catch (e) {}
  },

  restoreSession() {
    try {
      const saved = localStorage.getItem(STORAGE_CURRENT_USER);
      if (saved) {
        this.currentUser = JSON.parse(saved);
      }
    } catch (e) {
      this.currentUser = null;
    }
  },

  getUsersList() {
    try {
      const raw = localStorage.getItem(STORAGE_USERS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  async login(username, password) {
    const cleanUser = (username || '').toLowerCase().trim();
    const cleanPass = (password || '').trim();

    if (!cleanUser || !cleanPass) {
      return { success: false, message: 'Inserisci nome utente e password.' };
    }

    const isRoccoAdmin = cleanUser === DEFAULT_ADMIN.username.toLowerCase();
    const isRoccoValidPass = isRoccoAdmin && cleanPass === DEFAULT_ADMIN_PASS;

    const users = this.getUsersList();
    const found = users.find(u => u.username.toLowerCase() === cleanUser);

    if (found && (isRoccoValidPass || (found.password && found.password === cleanPass))) {
      const sessionUser = {
        username: found.username,
        role: isRoccoAdmin ? 'admin' : (found.role || 'user'),
        name: found.name || (isRoccoAdmin ? 'Rocco (Amministratore)' : found.username),
        loginTime: new Date().toISOString()
      };

      this.currentUser = sessionUser;
      localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(sessionUser));
      return { success: true, user: sessionUser };
    }

    try {
      const resp = await fetch(CLOUD_AUTH_LOGIN_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cleanUser, password: cleanPass })
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.success && data.user) {
          const remoteUser = data.user;
          const userToSave = {
            username: remoteUser.username,
            password: cleanPass,
            role: remoteUser.role || 'user',
            name: remoteUser.name || remoteUser.username,
            createdAt: new Date().toISOString()
          };

          let updatedUsers = this.getUsersList().filter(u => u.username.toLowerCase() !== cleanUser);
          updatedUsers.push(userToSave);
          localStorage.setItem(STORAGE_USERS, JSON.stringify(updatedUsers));

          const sessionUser = {
            username: userToSave.username,
            role: userToSave.role,
            name: userToSave.name,
            loginTime: new Date().toISOString()
          };

          this.currentUser = sessionUser;
          localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(sessionUser));
          return { success: true, user: sessionUser };
        }
      }
    } catch (err) {
      console.warn('Errore autenticazione Cloud:', err);
    }

    if (isRoccoValidPass) {
      const sessionUser = {
        username: 'rocco',
        role: 'admin',
        name: 'Rocco (Amministratore)',
        loginTime: new Date().toISOString()
      };
      this.currentUser = sessionUser;
      localStorage.setItem(STORAGE_CURRENT_USER, JSON.stringify(sessionUser));
      return { success: true, user: sessionUser };
    }

    return {
      success: false,
      message: 'Nome utente o password non corretti. Usa le stesse credenziali di Interpelli Scuola Mobile.'
    };
  },

  logout() {
    this.currentUser = null;
    localStorage.removeItem(STORAGE_CURRENT_USER);
  },

  isAuthenticated() {
    return Boolean(this.currentUser && this.currentUser.username);
  },

  isAdmin() {
    return Boolean(this.currentUser && this.currentUser.role === 'admin');
  },

  createUser(newUsername, newPassword, displayName = '') {
    if (!this.isAdmin()) {
      return { success: false, message: "Azione consentita solo all'amministratore." };
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

    fetch(CLOUD_USERS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: newUser })
    }).catch(() => {});

    return { success: true, user: newUser };
  },

  deleteUser(usernameToDelete) {
    if (!this.isAdmin()) {
      return { success: false, message: "Azione consentita solo all'amministratore." };
    }

    if (usernameToDelete.toLowerCase() === DEFAULT_ADMIN.username.toLowerCase()) {
      return { success: false, message: "Non è possibile eliminare l'amministratore principale." };
    }

    let users = this.getUsersList();
    users = users.filter(u => u.username.toLowerCase() !== usernameToDelete.toLowerCase());
    localStorage.setItem(STORAGE_USERS, JSON.stringify(users));

    fetch(`${CLOUD_USERS_API}?delete=${encodeURIComponent(usernameToDelete)}`, {
      method: 'DELETE'
    }).catch(() => {});

    return { success: true };
  }
};
