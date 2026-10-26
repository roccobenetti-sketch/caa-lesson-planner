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
import urllib.request
import urllib.error
from pathlib import Path

# Percorso base del progetto
BASE_DIR = Path(__file__).resolve().parent
PUBLIC_DIR = BASE_DIR / "public"
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
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-api-key")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        if self.path == "/api/config":
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

        # Fallback al serving file statici
        return super().do_GET()

    def do_POST(self):
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

            model_name = payload.get("model", DEFAULT_MODEL)
            gemini_payload = payload.get("geminiPayload", {})

            # Invocazione endpoint REST di Google Gemini con gestione automatica di retry per 503/429
            endpoint_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"
            
            data_bytes = json.dumps(gemini_payload).encode("utf-8")
            req = urllib.request.Request(
                endpoint_url,
                data=data_bytes,
                headers={"Content-Type": "application/json"}
            )

            max_retries = 3
            last_err = None
            for attempt in range(max_retries + 1):
                try:
                    with urllib.request.urlopen(req, timeout=30) as resp:
                        resp_data = resp.read()
                        self.send_response(resp.status)
                        self.send_header("Content-Type", "application/json; charset=utf-8")
                        self.end_headers()
                        self.wfile.write(resp_data)
                        return
                except urllib.error.HTTPError as http_err:
                    last_err = http_err
                    if http_err.code in (503, 429) and attempt < max_retries:
                        import time
                        # Attesa progressiva per rate limit (429) o sovraccarico (503)
                        delay = 5.0 * (attempt + 1) if http_err.code == 429 else 2.5 * (attempt + 1)
                        time.sleep(delay)
                        continue
                    error_body = http_err.read().decode("utf-8", errors="ignore")
                    self.send_response(http_err.code)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(error_body.encode("utf-8"))
                    return
                except Exception as err:
                    self.send_response(500)
                    self.send_header("Content-Type", "application/json; charset=utf-8")
                    self.end_headers()
                    self.wfile.write(json.dumps({"error": f"Errore di connessione: {str(err)}"}).encode("utf-8"))
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
