# CAA Lesson Planner

Webapp interattiva e stampabile per la creazione di percorsi e schede didattiche in **Comunicazione Aumentativa e Alternativa (CAA)** per bambini della scuola dell'infanzia e della scuola primaria.

L'applicazione sfrutta l'intelligenza artificiale (**Google Gemini**) per strutturare le tappe didattiche ed estrarre i token semantici, collegandosi in tempo reale all'API ufficiale di **ARASAAC** per associare i simboli visivi con la codifica a colori di **Fitzgerald**.

---

## Caratteristiche Principali

- **Supporto Cross-Platform (Desktop e Mobile):** Usabile su PC Windows, Mac, iPad/iPhone (iOS) e smartphone/tablet Android. PWA installabile come app sulla schermata home.
- **Supporto Infanzia e Primaria:**
  - *Infanzia (3-5 anni):* Frasi minime di 1-2 parole, tessere grandi, azioni concrete e routine quotidiane.
  - *Primaria (6-10 anni):* Frasi strutturate di 3-5 elementi, sequenze logiche a passaggi e regole scolastiche.
- **Simboli Ufficiali ARASAAC:** Ricerca e associazione automatica tramite API aperta italiana. Possibilità di cliccare su qualsiasi tessera per cercare e sostituire il simbolo con una variante preferita.
- **Codifica Colore Fitzgerald Standard:**
  - Giallo: Persone e pronomi
  - Verde: Verbi e azioni
  - Arancione: Sostantivi e oggetti
  - Blu: Aggettivi e descrittori
  - Rosa: Formule sociali e saluti
  - Grigio: Preposizioni e congiunzioni
- **Stampa e Salvataggio PDF Perfetto:** Layout CSS `@media print` ottimizzato per fogli A4.
- **Gestione Chiave API Gemini Flessibile:** 
  - Chiave di test preconfigurata via `.env`.
  - Possibilità per l'utente di inserire, modificare o ripristinare la propria chiave direttamente dall'interfaccia (salvata nel `localStorage` del browser).
- **Esportazione & Condivisione:** Salva e ricarica i progetti in formato JSON.

---

## Avvio Rapido

Il server locale utilizza esclusivamente la **libreria standard di Python** (nessun pacchetto esterno da installare tramite pip).

```bash
# Entra nella directory del progetto
cd F:\scratch\caa-lesson-planner

# Avvia il server
python server.py
```

All'avvio, la console mostrerà gli indirizzi di accesso:
- **Dal tuo computer:** `http://localhost:8080`
- **Da smartphone/tablet (stessa rete Wi-Fi):** `http://<IP_LOCALE>:8080`

---

## Configurazione della Chiave API Gemini

1. Clicca sull'icona **"Chiave & Impostazioni"** nella barra superiore dell'applicazione.
2. Incolla la tua chiave API Google Gemini.
3. Seleziona il modello desiderato (predefinito: `gemini-3.1-flash-lite`).
4. Clicca **"Salva Impostazioni"**.

---

## Attribuzione dei Simboli
I simboli pittografici utilizzati appartengono al catalogo **ARASAAC** (http://www.arasaac.org) realizzato da Sergio Palao per il Governo di Aragona e distribuiti con licenza Creative Commons (BY-NC-SA).
