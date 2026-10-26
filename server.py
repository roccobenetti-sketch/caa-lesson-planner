#!/usr/bin/env python3
"""
Server HTTP per CAA Lesson Planner.
Utilizza esclusivamente la libreria standard Python (nessuna dipendenza esterna richiesta).
Fornisce il serving dei file statici della PWA e proxy sicuro per l'API Gemini.
"""

import http.server
import os
import json
import socket
import time
import urllib.request
import urllib.error
import urllib.parse
from pathlib import Path

# Percorso base del progetto
BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
PROJECTS_DIR = BASE_DIR / "saved_projects"
ENV_FILE = BASE_DIR / ".env"

# Caricamento variabili d'ambiente da file .env semplice
def load_env_variables() -> dict[str, str]:
    env_vars = {}
    if ENV_FILE.exists():
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    env_vars[key.strip()] = value.strip()
    return env_vars

ENV_DATA = load_env_variables()
DEFAULT_API_KEY = os.getenv("DEFAULT_GEMINI_API_KEY", ENV_DATA.get("DEFAULT_GEMINI_API_KEY", ""))
DEFAULT_MODEL = os.getenv("DEFAULT_GEMINI_MODEL", ENV_DATA.get("DEFAULT_GEMINI_MODEL", "gemini-3.1-flash-lite"))
PORT = int(os.getenv("PORT", ENV_DATA.get("PORT", "8080")))

def get_local_ip() -> str:
    """Restituisce l'indirizzo IP locale della macchina per connessioni da smartphone."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

class CAARequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def end_headers(self):
        # Header CORS e cache control per sviluppo
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)

        if parsed_url.path == "/api/config":
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            response_payload = {
                "hasDefaultKey": bool(DEFAULT_API_KEY),
                "defaultKeyMasked": (DEFAULT_API_KEY[:6] + "..." + DEFAULT_API_KEY[-4:]) if len(DEFAULT_API_KEY) > 10 else "",
                "defaultApiKey": DEFAULT_API_KEY,
                "defaultModel": DEFAULT_MODEL
            }
            self.wfile.write(json.dumps(response_payload).encode("utf-8"))
            return

        if parsed_url.path == "/api/models":
            query_params = urllib.parse.parse_qs(parsed_url.query)
            client_key = query_params.get("key", [None])[0]
            api_key = client_key or DEFAULT_API_KEY
            if not api_key:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Chiave API mancante per il recupero dei modelli."}).encode("utf-8"))
                return

            google_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
            try:
                with urllib.request.urlopen(google_url, timeout=20) as resp:
                    data = json.loads(resp.read().decode("utf-8"))
                    models = []
                    for m in data.get("models", []):
                        methods = m.get("supportedGenerationMethods", [])
                        if "generateContent" in methods:
                            clean_id = m.get("name", "").replace("models/", "")
                            models.append({
                                "id": clean_id,
                                "displayName": m.get("displayName", clean_id),
                                "description": m.get("description", ""),
                                "inputTokenLimit": m.get("inputTokenLimit"),
                                "outputTokenLimit": m.get("outputTokenLimit")
                            })
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({"models": models, "count": len(models)}).encode("utf-8"))
                    return
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Errore recupero modelli da Google: {str(e)}"}).encode("utf-8"))
                return

        if parsed_url.path == "/api/projects":
            query_params = urllib.parse.parse_qs(parsed_url.query)
            project_id = query_params.get("id", [None])[0]
            if project_id:
                safe_id = "".join(c for c in project_id if c.isalnum() or c in ("-", "_"))
                target_file = PROJECTS_DIR / f"{safe_id}.json"
                if target_file.exists():
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    with open(target_file, "rb") as f:
                        self.wfile.write(f.read())
                    return
                else:
                    self.send_response(404)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": "Progetto non trovato"}).encode("utf-8"))
                    return
            else:
                projects = []
                if PROJECTS_DIR.exists():
                    for f in PROJECTS_DIR.glob("*.json"):
                        try:
                            with open(f, "r", encoding="utf-8") as pf:
                                pdata = json.load(pf)
                                projects.append({
                                    "id": pdata.get("id", f.stem),
                                    "title": pdata.get("title", f.stem),
                                    "subtitle": pdata.get("subtitle", ""),
                                    "targetGrade": pdata.get("targetGrade", "infanzia"),
                                    "primaryClass": pdata.get("primaryClass", ""),
                                    "layoutType": pdata.get("layoutType", "routine"),
                                    "cardCount": len(pdata.get("cards", [])),
                                    "hasMoral": bool(pdata.get("moral")),
                                    "createdAt": pdata.get("createdAt", ""),
                                    "updatedAt": pdata.get("updatedAt", "")
                                })
                        except Exception:
                            continue
                projects.sort(key=lambda x: x.get("updatedAt", "") or x.get("createdAt", ""), reverse=True)
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"projects": projects}).encode("utf-8"))
                return

        # Fallback al serving file statici
        return super().do_GET()

    def do_POST(self):
        if self.path == "/api/projects":
            content_length = int(self.headers.get("Content-Length", 0))
            request_body = self.rfile.read(content_length)
            try:
                payload = json.loads(request_body.decode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"JSON non valido: {str(e)}"}).encode("utf-8"))
                return

            project_id = payload.get("id")
            if not project_id:
                raw_title = (payload.get("title") or "progetto").lower().strip()
                title_slug = "".join(c if c.isalnum() else "_" for c in raw_title)
                title_slug = "_".join(filter(None, title_slug.split("_")))[:30]
                project_id = f"{title_slug}_{int(time.time())}"

            safe_id = "".join(c for c in project_id if c.isalnum() or c in ("-", "_"))
            payload["id"] = safe_id
            now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            if "createdAt" not in payload:
                payload["createdAt"] = now_iso
            payload["updatedAt"] = now_iso

            PROJECTS_DIR.mkdir(parents=True, exist_ok=True)
            target_file = PROJECTS_DIR / f"{safe_id}.json"
            tmp_file = PROJECTS_DIR / f"{safe_id}.tmp"

            try:
                with open(tmp_file, "w", encoding="utf-8") as f:
                    json.dump(payload, f, ensure_ascii=False, indent=2)
                os.replace(tmp_file, target_file)
            except Exception as write_err:
                if tmp_file.exists():
                    tmp_file.unlink(missing_ok=True)
                self.send_response(500)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Errore scrittura file: {str(write_err)}"}).encode("utf-8"))
                return

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "id": safe_id, "project": payload}).encode("utf-8"))
            return

        if self.path == "/api/generate":
            content_length = int(self.headers.get("Content-Length", 0))
            request_body = self.rfile.read(content_length)

            try:
                payload = json.loads(request_body.decode("utf-8"))
            except Exception as e:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"JSON non valido: {str(e)}"}).encode("utf-8"))
                return

            api_key = payload.get("apiKey") or DEFAULT_API_KEY
            if not api_key:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Nessuna chiave API Gemini fornita né configurata nel server."}).encode("utf-8"))
                return

            model_name = payload.get("model") or DEFAULT_MODEL

            gemini_payload = payload.get("geminiPayload", {})

            # Invocazione endpoint REST di Google Gemini con gestione automatica di retry per 503/429/404
            def build_request(target_model):
                endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{target_model}:generateContent?key={api_key}"
                data_b = json.dumps(gemini_payload).encode("utf-8")
                return urllib.request.Request(endpoint, data=data_b, headers={"Content-Type": "application/json"})

            current_model = model_name
            max_retries = 3
            for attempt in range(max_retries + 1):
                try:
                    req = build_request(current_model)
                    with urllib.request.urlopen(req, timeout=90) as resp:
                        resp_data = resp.read()
                        self.send_response(resp.status)
                        self.send_header("Content-Type", "application/json; charset=utf-8")
                        self.end_headers()
                        self.wfile.write(resp_data)
                        return
                except urllib.error.HTTPError as http_err:
                    # Se il modello non esiste (404), passa al modello predefinito
                    if http_err.code == 404 and current_model != DEFAULT_MODEL:
                        current_model = DEFAULT_MODEL
                        continue

                    if http_err.code in (503, 429) and attempt < max_retries:
                        delay = 4.0 * (attempt + 1) if http_err.code == 429 else 2.0 * (attempt + 1)
                        time.sleep(delay)
                        continue

                    error_body = http_err.read().decode("utf-8", errors="ignore")
                    self.send_response(http_err.code)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(error_body.encode("utf-8"))
                    return
                except Exception as err:
                    err_msg = str(err)
                    if "timed out" in err_msg.lower() or isinstance(err, TimeoutError):
                        err_msg = "Tempo di attesa esaurito (Timeout). Seleziona il modello ultra-rapido 'Gemini 3.1 Flash Lite' in alto per generazioni istantanee."
                    self.send_response(504 if "timed out" in str(err).lower() else 500)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": f"Errore di connessione: {err_msg}"}).encode("utf-8"))
                    return

        self.send_response(404)
        self.end_headers()

    def do_DELETE(self):
        parsed_url = urllib.parse.urlparse(self.path)
        if parsed_url.path == "/api/projects":
            query_params = urllib.parse.parse_qs(parsed_url.query)
            project_id = query_params.get("id", [None])[0]
            if not project_id:
                self.send_response(400)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Parametro id mancante"}).encode("utf-8"))
                return

            safe_id = "".join(c for c in project_id if c.isalnum() or c in ("-", "_"))
            target_file = PROJECTS_DIR / f"{safe_id}.json"
            if target_file.exists():
                try:
                    target_file.unlink()
                except Exception as del_err:
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": str(del_err)}).encode("utf-8"))
                    return

            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.end_headers()
            self.wfile.write(json.dumps({"success": True, "id": safe_id}).encode("utf-8"))
            return

        self.send_response(404)
        self.end_headers()

def run_server():
    local_ip = get_local_ip()
    print("=" * 65)
    print("  CAA LESSON PLANNER - Server di Sviluppo & Produzione Locale")
    print("=" * 65)
    print(f"  Accesso da questo PC:          http://localhost:{PORT}")
    print(f"  Accesso da smartphone/tablet:  http://{local_ip}:{PORT}")
    print(f"  Modello Gemini predefinito:    {DEFAULT_MODEL}")
    print(f"  Chiave API preconfigurata:     {'Presente' if DEFAULT_API_KEY else 'Assente'}")
    print("=" * 65)
    print("Premi Ctrl+C per arrestare il server.")
    
    with http.server.ThreadingHTTPServer(("", PORT), CAARequestHandler) as httpd:
        httpd.allow_reuse_address = True
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nArresto del server in corso...")
            httpd.server_close()

if __name__ == "__main__":
    run_server()
