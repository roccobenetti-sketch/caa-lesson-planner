#!/usr/bin/env python3
"""
Script di autotest e avvio rapido per CAA Lesson Planner.
Esegue test diagnostici su ARASAAC e Gemini API, poi avvia il server e apre il browser.
"""

import sys
import time
import json
import urllib.request
import urllib.error
import webbrowser
import threading
from pathlib import Path

# Configurazione percorsi
PROJECT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(PROJECT_DIR))

# Importazione del server locale
from server import load_env_variables, get_local_ip, run_server, PORT, DEFAULT_API_KEY, DEFAULT_MODEL

def print_separator():
    print("-" * 65)

def test_arasaac_api() -> bool:
    """Verifica la connettività e la risposta dell'API ARASAAC in italiano."""
    test_url = "https://api.arasaac.org/api/pictograms/it/search/mela"
    try:
        req = urllib.request.Request(test_url, headers={"User-Agent": "CAALessonPlanner/1.0"})
        with urllib.request.urlopen(req, timeout=8) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode("utf-8"))
                if isinstance(data, list) and len(data) > 0:
                    print(f" [OK] ARASAAC API: Connesso con successo ({len(data)} simboli trovati per 'mela')")
                    return True
        print(" [WARNING] ARASAAC API: Risposta non valida")
        return False
    except Exception as e:
        print(f" [ERRORE] ARASAAC API: {e}")
        return False

def test_gemini_api(api_key: str, model: str) -> bool:
    """Verifica la validità della chiave e la capacità di generazione di Gemini."""
    if not api_key:
        print(" [WARNING] Nessuna chiave API configurata. Verrà richiesto l'inserimento nel browser.")
        return False

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
    payload = {
        "contents": [{"parts": [{"text": "Rispondi con solo la parola OK"}]}],
        "generationConfig": {"temperature": 0.1}
    }

    try:
        data_bytes = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(url, data=data_bytes, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=12) as resp:
            if resp.status == 200:
                result = json.loads(resp.read().decode("utf-8"))
                text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
                print(f" [OK] Google Gemini API ({model}): Connesso con successo (Risposta: '{text}')")
                return True
        print(f" [WARNING] Gemini API: Codice di stato inatteso {resp.status}")
        return False
    except urllib.error.HTTPError as he:
        error_info = he.read().decode("utf-8", errors="ignore")
        print(f" [ERRORE] Gemini API HTTP {he.code}: {error_info[:150]}")
        return False
    except Exception as e:
        print(f" [ERRORE] Gemini API: {e}")
        return False

def main():
    print("=" * 65)
    print("   CAA LESSON PLANNER - DIAGNOSTICA & AVVIO RAPIDO")
    print("=" * 65)

    env_vars = load_env_variables()
    api_key = env_vars.get("DEFAULT_GEMINI_API_KEY", DEFAULT_API_KEY)
    model = env_vars.get("DEFAULT_GEMINI_MODEL", DEFAULT_MODEL)

    print("\n1. Verifica connessioni esterne:")
    arasaac_ok = test_arasaac_api()
    gemini_ok = test_gemini_api(api_key, model)

    print_separator()
    if arasaac_ok and gemini_ok:
        print(" ESITO TEST: TUTTI I COMPONENTI SONO OPERATIVI AL 100%!")
    else:
        print(" NOTA: Uno o più servizi hanno segnalato avvisi. L'app si avvia comunque.")
    print_separator()

    # Avvio browser automatico dopo 1.5 secondi
    local_url = f"http://localhost:{PORT}"
    def open_browser():
        time.sleep(1.5)
        print(f"\n Apertura automatica del browser all'indirizzo: {local_url}")
        webbrowser.open(local_url)

    threading.Thread(target=open_browser, daemon=True).start()

    # Avvio del server
    run_server()

if __name__ == "__main__":
    main()
