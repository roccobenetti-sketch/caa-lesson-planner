/**
 * Cloudflare Worker per la sincronizzazione cloud multi-utente
 * di CAA Lesson Planner (Progetti, Simboli IA e Utenti).
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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

          // 1. Salva il documento completo
          await env.CAA_KV.put(`proj:${targetUser}:${project.id}`, JSON.stringify(project));

          // 2. Aggiorna l'indice riassuntivo
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
            createdAt: project.createdAt || new Date().toISOString(),
            updatedAt: project.updatedAt || new Date().toISOString()
          });

          await env.CAA_KV.put(`index:proj:${targetUser}`, JSON.stringify(index));
          return jsonResponse({ success: true, id: project.id, savedAt: new Date().toISOString() });
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
          return jsonResponse({ success: true, deletedId: projId });
        }
      }

      // --- 2. PITTOGRAMMI E IMMAGINI IA PERSONALI ---
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

          const raw = await env.CAA_KV.get(`picto:${targetUser}`);
          let items = raw ? JSON.parse(raw) : [];

          // Controllo duplicato per signature nome e data
          items = items.filter(i => i.id !== picto.id && i.name !== picto.name);
          items.unshift(picto);

          await env.CAA_KV.put(`picto:${targetUser}`, JSON.stringify(items));
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
          return jsonResponse({ success: true, deletedId: pictoId });
        }
      }

      // --- 3. UTENTI E RUOLI ---
      if (pathname === '/api/sync/users') {
        if (request.method === 'GET') {
          const raw = await env.CAA_KV.get('system:users');
          const users = raw ? JSON.parse(raw) : [];
          return jsonResponse({ success: true, users });
        }

        if (request.method === 'POST') {
          const body = await request.json();
          const newUser = body.user;
          if (!newUser || !newUser.username) return jsonResponse({ error: 'Dati utente non validi' }, 400);

          const raw = await env.CAA_KV.get('system:users');
          let users = raw ? JSON.parse(raw) : [];

          users = users.filter(u => u.username.toLowerCase() !== newUser.username.toLowerCase());
          users.push(newUser);

          await env.CAA_KV.put('system:users', JSON.stringify(users));
          return jsonResponse({ success: true, user: newUser });
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
