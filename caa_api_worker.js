/**
 * Cloudflare Worker per la sincronizzazione cloud multi-utente
 * di CAA Lesson Planner (Progetti, Simboli IA e Utenti).
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user',
      'Access-Control-Max-Age': '86400',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const jsonResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    };

    try {
      const pathname = url.pathname;

      if (pathname === '/' || pathname === '/health') {
        return jsonResponse({ status: 'ok', service: 'CAA Cloud Sync API', timestamp: new Date().toISOString() });
      }

      if (pathname === '/api/config') {
        return jsonResponse({
          defaultModel: 'gemini-3.1-flash-lite',
          defaultApiKey: env.GEMINI_API_KEY || ''
        });
      }

      if (pathname === '/api/generate' && request.method === 'POST') {
        const body = await request.json();
        const activeKey = body.apiKey || env.GEMINI_API_KEY || '';
        const model = body.model || 'gemini-3.1-flash-lite';
        const payload = body.geminiPayload;

        if (!activeKey) {
          return jsonResponse({ error: 'Chiave API Gemini mancante' }, 400);
        }

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${activeKey}`;
        const geminiResp = await fetch(geminiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const respData = await geminiResp.json();
        return jsonResponse(respData, geminiResp.status);
      }

      // --- 1. PROGETTI CAA ---
      if (pathname === '/api/sync/projects') {
        const user = (url.searchParams.get('user') || 'rocco').toLowerCase().trim();

        if (request.method === 'GET') {
          const projId = url.searchParams.get('id');
          if (projId) {
            const raw = await env.CAA_KV.get(`proj:${user}:${projId}`);
            if (!raw) return jsonResponse({ error: 'Progetto non trovato' }, 404);
            return jsonResponse({ success: true, project: JSON.parse(raw) });
          } else {
            const rawIndex = await env.CAA_KV.get(`index:proj:${user}`);
            const index = rawIndex ? JSON.parse(rawIndex) : [];
            return jsonResponse({ success: true, user, projects: index });
          }
        }

        if (request.method === 'POST') {
          const body = await request.json();
          const targetUser = (body.user || user).toLowerCase().trim();
          const project = body.project;
          if (!project || !project.id) {
            return jsonResponse({ error: 'Progetto o ID mancante' }, 400);
          }

          const isShared = Boolean(project.isShared);
          project.isShared = isShared;
          project.authorUser = targetUser;

          // 1. Salva il documento completo dell'utente
          await env.CAA_KV.put(`proj:${targetUser}:${project.id}`, JSON.stringify(project));

          // 2. Aggiorna l'indice riassuntivo dell'utente
          const rawIndex = await env.CAA_KV.get(`index:proj:${targetUser}`);
          let index = rawIndex ? JSON.parse(rawIndex) : [];
          index = index.filter(p => p.id !== project.id);
          index.unshift({
            id: project.id,
            title: project.title,
            targetGrade: project.targetGrade || 'infanzia',
            primaryClass: project.primaryClass || '',
            layoutType: project.layoutType || 'routine',
            cardCount: (project.cards || []).length,
            hasMoral: Boolean(project.moral),
            isShared: isShared,
            authorUser: targetUser,
            createdAt: project.createdAt || new Date().toISOString(),
            updatedAt: project.updatedAt || new Date().toISOString()
          });

          await env.CAA_KV.put(`index:proj:${targetUser}`, JSON.stringify(index));

          // 3. Gestisci indice globale Progetti Condivisi
          const rawShared = await env.CAA_KV.get('index:shared_projects');
          let sharedIndex = rawShared ? JSON.parse(rawShared) : [];
          sharedIndex = sharedIndex.filter(p => p.id !== project.id);

          if (isShared) {
            sharedIndex.unshift({
              id: project.id,
              title: project.title,
              targetGrade: project.targetGrade || 'infanzia',
              primaryClass: project.primaryClass || '',
              layoutType: project.layoutType || 'routine',
              cardCount: (project.cards || []).length,
              hasMoral: Boolean(project.moral),
              isShared: true,
              authorUser: targetUser,
              authorName: body.authorName || targetUser,
              createdAt: project.createdAt || new Date().toISOString(),
              updatedAt: project.updatedAt || new Date().toISOString()
            });
            await env.CAA_KV.put(`shared_proj:${project.id}`, JSON.stringify(project));
          } else {
            await env.CAA_KV.delete(`shared_proj:${project.id}`);
          }
          await env.CAA_KV.put('index:shared_projects', JSON.stringify(sharedIndex));

          return jsonResponse({ success: true, id: project.id, isShared, savedAt: new Date().toISOString() });
        }

        if (request.method === 'DELETE') {
          const projId = url.searchParams.get('id');
          if (!projId) return jsonResponse({ error: 'ID mancante' }, 400);

          await env.CAA_KV.delete(`proj:${user}:${projId}`);
          const rawIndex = await env.CAA_KV.get(`index:proj:${user}`);
          if (rawIndex) {
            let index = JSON.parse(rawIndex);
            index = index.filter(p => p.id !== projId);
            await env.CAA_KV.put(`index:proj:${user}`, JSON.stringify(index));
          }

          // Rimuovi anche dai condivisi se presente
          await env.CAA_KV.delete(`shared_proj:${projId}`);
          const rawShared = await env.CAA_KV.get('index:shared_projects');
          if (rawShared) {
            let sharedIndex = JSON.parse(rawShared);
            sharedIndex = sharedIndex.filter(p => p.id !== projId);
            await env.CAA_KV.put('index:shared_projects', JSON.stringify(sharedIndex));
          }

          return jsonResponse({ success: true, deletedId: projId });
        }
      }

      // --- TOGGLE CONDIVISIONE SINGOLO PROGETTO ---
      if (pathname === '/api/sync/projects/share-toggle' && request.method === 'POST') {
        const body = await request.json();
        const user = (body.user || 'rocco').toLowerCase().trim();
        const projId = body.id || body.projectId;
        const isShared = Boolean(body.isShared);

        if (!projId) return jsonResponse({ error: 'ID progetto mancante' }, 400);

        const raw = await env.CAA_KV.get(`proj:${user}:${projId}`);
        if (!raw) return jsonResponse({ error: 'Progetto non trovato' }, 404);

        const proj = JSON.parse(raw);
        proj.isShared = isShared;
        proj.updatedAt = new Date().toISOString();
        await env.CAA_KV.put(`proj:${user}:${projId}`, JSON.stringify(proj));

        // Aggiorna indice utente
        const rawIndex = await env.CAA_KV.get(`index:proj:${user}`);
        if (rawIndex) {
          let index = JSON.parse(rawIndex);
          const target = index.find(p => p.id === projId);
          if (target) {
            target.isShared = isShared;
            target.updatedAt = proj.updatedAt;
            await env.CAA_KV.put(`index:proj:${user}`, JSON.stringify(index));
          }
        }

        // Aggiorna indice globale condivisi
        const rawShared = await env.CAA_KV.get('index:shared_projects');
        let sharedIndex = rawShared ? JSON.parse(rawShared) : [];
        sharedIndex = sharedIndex.filter(p => p.id !== projId);

        if (isShared) {
          sharedIndex.unshift({
            id: proj.id,
            title: proj.title,
            targetGrade: proj.targetGrade || 'infanzia',
            primaryClass: proj.primaryClass || '',
            layoutType: proj.layoutType || 'routine',
            cardCount: (proj.cards || []).length,
            hasMoral: Boolean(proj.moral),
            isShared: true,
            authorUser: user,
            authorName: body.authorName || user,
            createdAt: proj.createdAt || proj.updatedAt,
            updatedAt: proj.updatedAt
          });
          await env.CAA_KV.put(`shared_proj:${proj.id}`, JSON.stringify(proj));
        } else {
          await env.CAA_KV.delete(`shared_proj:${proj.id}`);
        }
        await env.CAA_KV.put('index:shared_projects', JSON.stringify(sharedIndex));

        return jsonResponse({ success: true, projectId: projId, isShared });
      }

      // --- FEED PROGETTI CONDIVISI DA TUTTI GLI UTENTI ---
      if (pathname === '/api/sync/shared-projects' && request.method === 'GET') {
        const projId = url.searchParams.get('id');
        if (projId) {
          const raw = await env.CAA_KV.get(`shared_proj:${projId}`);
          if (!raw) return jsonResponse({ error: 'Progetto condiviso non trovato' }, 404);
          return jsonResponse({ success: true, project: JSON.parse(raw) });
        } else {
          const rawShared = await env.CAA_KV.get('index:shared_projects');
          const sharedList = rawShared ? JSON.parse(rawShared) : [];
          return jsonResponse({ success: true, sharedProjects: sharedList });
        }
      }

      // --- 2. PITTOGRAMMI E IMMAGINI IA PERSONALI E CONDIVISI ---
      if (pathname === '/api/sync/custom-pictograms') {
        const user = (url.searchParams.get('user') || 'rocco').toLowerCase().trim();

        if (request.method === 'GET') {
          const raw = await env.CAA_KV.get(`picto:${user}`);
          const items = raw ? JSON.parse(raw) : [];
          return jsonResponse({ success: true, user, pictograms: items });
        }

        if (request.method === 'POST') {
          const body = await request.json();
          const targetUser = (body.user || user).toLowerCase().trim();
          const picto = body.picto;
          if (!picto || !picto.name) return jsonResponse({ error: 'Dati simbolo non validi' }, 400);

          picto.authorUser = targetUser;
          picto.authorName = body.authorName || (targetUser === 'rocco' ? 'Rocco' : targetUser);

          const raw = await env.CAA_KV.get(`picto:${targetUser}`);
          let items = raw ? JSON.parse(raw) : [];

          // Controllo duplicato per signature nome e data
          items = items.filter(i => i.id !== picto.id && i.name !== picto.name);
          items.unshift(picto);

          await env.CAA_KV.put(`picto:${targetUser}`, JSON.stringify(items));

          // Gestione indice globale simboli condivisi
          if (picto.isShared) {
            const rawShared = await env.CAA_KV.get('index:shared_pictograms');
            let sharedList = rawShared ? JSON.parse(rawShared) : [];
            sharedList = sharedList.filter(p => p.id !== picto.id);
            sharedList.unshift({
              id: picto.id,
              name: picto.name,
              imageUrl: picto.imageUrl,
              prompt: picto.prompt || '',
              isShared: true,
              authorUser: targetUser,
              authorName: picto.authorName,
              createdAt: picto.createdAt || new Date().toISOString()
            });
            await env.CAA_KV.put('index:shared_pictograms', JSON.stringify(sharedList));
          }

          return jsonResponse({ success: true, id: picto.id });
        }

        if (request.method === 'DELETE') {
          const pictoId = url.searchParams.get('id');
          if (!pictoId) return jsonResponse({ error: 'ID mancante' }, 400);

          const raw = await env.CAA_KV.get(`picto:${user}`);
          if (raw) {
            let items = JSON.parse(raw);
            items = items.filter(i => i.id !== pictoId);
            await env.CAA_KV.put(`picto:${user}`, JSON.stringify(items));
          }

          // Rimuove da indice condivisi se presente
          const rawShared = await env.CAA_KV.get('index:shared_pictograms');
          if (rawShared) {
            let sharedList = JSON.parse(rawShared);
            sharedList = sharedList.filter(p => p.id !== pictoId);
            await env.CAA_KV.put('index:shared_pictograms', JSON.stringify(sharedList));
          }

          return jsonResponse({ success: true, deletedId: pictoId });
        }
      }

      // --- TOGGLE CONDIVISIONE SIMBOLO PERSONALIZZATO ---
      if ((pathname === '/api/sync/custom-pictograms/toggle-share' || pathname === '/api/sync/custom-pictograms/share-toggle') && 
          (request.method === 'PUT' || request.method === 'POST')) {
        const body = await request.json();
        const pictoId = body.id;
        const isShared = Boolean(body.isShared);
        const user = (body.user || 'rocco').toLowerCase().trim();
        const authorName = body.authorName || (user === 'rocco' ? 'Rocco' : user);

        if (!pictoId) return jsonResponse({ error: 'ID simbolo mancante' }, 400);

        const raw = await env.CAA_KV.get(`picto:${user}`);
        let items = raw ? JSON.parse(raw) : [];
        let targetPicto = items.find(i => i.id === pictoId);

        if (!targetPicto) {
          return jsonResponse({ error: 'Simbolo non trovato nel profilo' }, 404);
        }

        targetPicto.isShared = isShared;
        targetPicto.authorUser = user;
        targetPicto.authorName = authorName;
        await env.CAA_KV.put(`picto:${user}`, JSON.stringify(items));

        // Aggiorna indice globale simboli condivisi
        const rawShared = await env.CAA_KV.get('index:shared_pictograms');
        let sharedList = rawShared ? JSON.parse(rawShared) : [];
        sharedList = sharedList.filter(p => p.id !== pictoId);

        if (isShared) {
          sharedList.unshift({
            id: targetPicto.id,
            name: targetPicto.name,
            imageUrl: targetPicto.imageUrl,
            prompt: targetPicto.prompt || '',
            isShared: true,
            authorUser: user,
            authorName: authorName,
            createdAt: targetPicto.createdAt || new Date().toISOString()
          });
        }

        await env.CAA_KV.put('index:shared_pictograms', JSON.stringify(sharedList));
        return jsonResponse({ success: true, id: pictoId, isShared });
      }

      // --- FEED SIMBOLI CONDIVISI DA TUTTI GLI UTENTI ---
      if (pathname === '/api/sync/shared-pictograms' && request.method === 'GET') {
        const rawShared = await env.CAA_KV.get('index:shared_pictograms');
        const sharedList = rawShared ? JSON.parse(rawShared) : [];
        return jsonResponse({ success: true, sharedPictograms: sharedList });
      }

      // --- 3. AUTENTICAZIONE UNIFICATA & GESTIONE UTENTI (INTERPELLI + CAA) ---
      if (pathname === '/api/auth/login' && request.method === 'POST') {
        const body = await request.json();
        const cleanUser = String(body.username || '').toLowerCase().trim();
        const cleanPass = String(body.password || '').trim();

        if (!cleanUser || !cleanPass) {
          return jsonResponse({ success: false, message: 'Username e password sono obbligatori.' }, 400);
        }

        const isRocco = cleanUser === 'rocco';
        const isRoccoAdminPass = isRocco && (cleanPass === 'rocco76#Angy' || cleanPass === 'rocco76-Angy' || cleanPass === 'rocco');

        // 1. Verifica su Cloudflare KV locale
        const raw = await env.CAA_KV.get('system:users');
        let users = raw ? JSON.parse(raw) : [];
        let found = users.find(u => u.username.toLowerCase() === cleanUser);

        if (found) {
          if (isRoccoAdminPass || found.password === cleanPass) {
            return jsonResponse({
              success: true,
              user: {
                username: found.username,
                role: isRocco ? 'admin' : (found.role || 'user'),
                name: found.name || found.username
              }
            });
          }
        }

        // 2. Se non presente o password aggiornata, verifica con il backend di Interpelli Scuola Mobile
        try {
          const authResp = await fetch('https://interpelliscuolamobile.it/api/users', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            body: JSON.stringify({ action: 'login', username: cleanUser, password: cleanPass })
          });

          if (authResp.ok) {
            const authData = await authResp.json();
            if (authData.status === 'ok' && authData.user) {
              const registeredUser = {
                username: cleanUser,
                password: cleanPass,
                role: isRocco ? 'admin' : (authData.user.role || 'user'),
                name: authData.user.candidateProfile?.nome 
                  ? `${authData.user.candidateProfile.nome} ${authData.user.candidateProfile.cognome || ''}`.trim()
                  : (isRocco ? 'Rocco' : cleanUser),
                createdAt: new Date().toISOString()
              };

              users = users.filter(u => u.username.toLowerCase() !== cleanUser);
              users.push(registeredUser);
              await env.CAA_KV.put('system:users', JSON.stringify(users));

              return jsonResponse({
                success: true,
                user: {
                  username: registeredUser.username,
                  role: registeredUser.role,
                  name: registeredUser.name
                }
              });
            }
          }
        } catch (e) {
          console.warn('Errore verifica login su interpelli:', e);
        }

        // Se è rocco con pass corretta registralo comunque
        if (isRoccoAdminPass) {
          const roccoUser = {
            username: 'rocco',
            password: cleanPass,
            role: 'admin',
            name: 'Rocco (Amministratore)',
            createdAt: new Date().toISOString()
          };
          users = users.filter(u => u.username.toLowerCase() !== 'rocco');
          users.push(roccoUser);
          await env.CAA_KV.put('system:users', JSON.stringify(users));
          return jsonResponse({
            success: true,
            user: { username: 'rocco', role: 'admin', name: 'Rocco (Amministratore)' }
          });
        }

        return jsonResponse({ success: false, message: 'Username o password non corretti.' }, 401);
      }

      // --- 4. UTENTI E RUOLI (SYNC) ---
      if (pathname === '/api/sync/users') {
        if (request.method === 'GET') {
          const raw = await env.CAA_KV.get('system:users');
          let users = raw ? JSON.parse(raw) : [];

          // Se vuoto, auto-import da Interpelli Scuola Mobile
          if (users.length === 0) {
            try {
              const resp = await fetch('https://interpelliscuolamobile.it/api/users?fresh=1', {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                  'x-auth-user': 'rocco',
                  'x-auth-pass': 'rocco76#Angy'
                }
              });
              if (resp.ok) {
                const data = await resp.json();
                const imported = data.users || [];
                if (imported.length > 0) {
                  users = imported.map(u => ({
                    username: u.username.toLowerCase().trim(),
                    password: u.password || '',
                    role: u.username.toLowerCase().trim() === 'rocco' ? 'admin' : (u.role || 'user'),
                    name: u.username.toLowerCase().trim() === 'rocco' ? 'Rocco' : u.username,
                    createdAt: u.createdAt || new Date().toISOString()
                  }));
                  await env.CAA_KV.put('system:users', JSON.stringify(users));
                }
              }
            } catch (e) {}
          }

          return jsonResponse({ success: true, users });
        }

        if (request.method === 'POST') {
          const body = await request.json();
          const newUser = body.user;
          if (!newUser || !newUser.username) return jsonResponse({ error: 'Dati utente non validi' }, 400);

          const cleanUser = newUser.username.toLowerCase().trim();
          const raw = await env.CAA_KV.get('system:users');
          let users = raw ? JSON.parse(raw) : [];

          const existing = users.find(u => u.username.toLowerCase() === cleanUser);
          const merged = {
            username: cleanUser,
            password: newUser.password || existing?.password || '',
            role: cleanUser === 'rocco' ? 'admin' : (newUser.role || existing?.role || 'user'),
            name: newUser.name || existing?.name || cleanUser,
            createdAt: existing?.createdAt || newUser.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          users = users.filter(u => u.username.toLowerCase() !== cleanUser);
          users.push(merged);

          await env.CAA_KV.put('system:users', JSON.stringify(users));
          return jsonResponse({ success: true, user: merged });
        }

        if (request.method === 'DELETE') {
          const username = url.searchParams.get('username');
          if (!username) return jsonResponse({ error: 'Username mancante' }, 400);

          const raw = await env.CAA_KV.get('system:users');
          if (raw) {
            let users = JSON.parse(raw);
            users = users.filter(u => u.username.toLowerCase() !== username.toLowerCase());
            await env.CAA_KV.put('system:users', JSON.stringify(users));
          }
          return jsonResponse({ success: true, deletedUser: username });
        }
      }

      return jsonResponse({ error: 'Rotta non trovata' }, 404);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  }
};
