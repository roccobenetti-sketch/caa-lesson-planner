/**
 * StickerAlbumEngine: Modulo autonomo per la creazione, gestione e stampa di
 * Album di Figurine didattici e Raccoglitori di tessere CAA in formato A4.
 *
 * Struttura a 2 Fogli Sincronizzati (Corrispondenza 1:1 automatica):
 * - Foglio 1: Raccoglitore A4 con caselle vuote sagomate e didascalia in alto.
 * - Foglio 2: Figurine A4 con linee di ritaglio (forbici ✂️) e immagini CAA.
 *
 * Supporta 3 Formati Standard di Figurine:
 * - 'large': Grande (6 per foglio, 2x3, ca. 75x75mm - Infanzia e supporto motorio)
 * - 'medium': Medio (12 per foglio, 3x4, ca. 52x52mm - Standard PECS / Raccoglitore)
 * - 'small': Piccolo (20 per foglio, 4x5, ca. 38x38mm - Vocabolario denso e agende)
 */

import { ArasaacService } from './arasaacService.js';
import { ConfigManager } from './config.js';

export const StickerAlbumEngine = {
  FORMATS: {
    large: {
      id: 'large',
      label: 'Grande (6 per foglio A4 - 2×3)',
      description: 'Consigliato per Infanzia e difficoltà motorie di presa',
      cols: 2,
      perPage: 6,
      boxClass: 'h-48 sm:h-52',
      imgSizeClass: 'w-24 h-24 sm:w-28 sm:h-28',
      gridClass: 'grid-cols-2 gap-4'
    },
    medium: {
      id: 'medium',
      label: 'Medio (12 per foglio A4 - 3×4) [Predefinito]',
      description: 'Formato standard universale PECS e quaderno CAA',
      cols: 3,
      perPage: 12,
      boxClass: 'h-36 sm:h-40',
      imgSizeClass: 'w-16 h-16 sm:w-20 sm:h-20',
      gridClass: 'grid-cols-3 gap-3'
    },
    small: {
      id: 'small',
      label: 'Piccolo (20 per foglio A4 - 4×5)',
      description: 'Ideale per vocabolario esteso e agende visive compatte',
      cols: 4,
      perPage: 20,
      boxClass: 'h-28 sm:h-32',
      imgSizeClass: 'w-12 h-12 sm:w-14 sm:h-14',
      gridClass: 'grid-cols-4 gap-2.5'
    }
  },

  /**
   * Verifica se la lezione appartiene alla tipologia Album & Figurine.
   */
  isAlbum(lesson) {
    return Boolean(lesson && (lesson.layoutType === 'album' || lesson.isAlbum));
  },

  /**
   * Normalizza e inizializza i dati specifici dell'Album.
   */
  ensureAlbumStructure(lesson) {
    if (!lesson) return;
    lesson.layoutType = 'album';
    lesson.isAlbum = true;
    if (!lesson.stickerFormat || !this.FORMATS[lesson.stickerFormat]) {
      lesson.stickerFormat = 'medium';
    }

    // Se mancano gli stickers ma ci sono cards con tokens, convertile in stickers
    if (!Array.isArray(lesson.stickers) || lesson.stickers.length === 0) {
      lesson.stickers = [];
      if (Array.isArray(lesson.cards)) {
        lesson.cards.forEach((card, cIdx) => {
          (card.tokens || []).forEach((t, tIdx) => {
            const word = typeof t === 'string' ? t : (t.displayWord || t.word || `Elemento ${cIdx + 1}`);
            lesson.stickers.push({
              id: `stk_${Date.now()}_${cIdx}_${tIdx}`,
              label: word,
              token: typeof t === 'string' ? { displayWord: t, searchTerm: t, category: 'noun' } : t
            });
          });
        });
      }
    }

    // Se ancora vuoto, inizializza con elementi base dimostrativi
    if (lesson.stickers.length === 0) {
      const defaults = ['Zaino', 'Banco', 'Matita', 'Merenda', 'Quaderno', 'Maestra'];
      lesson.stickers = defaults.map((d, i) => ({
        id: `stk_init_${i}`,
        label: d,
        token: { displayWord: d, searchTerm: d.toLowerCase(), category: 'noun' }
      }));
    }
  },

  /**
   * Esegue il rendering completo dell'Album nel contenitore DOM specificato.
   */
  render(containerElement, lesson) {
    if (!containerElement || !lesson) return;
    this.ensureAlbumStructure(lesson);

    const fmt = this.FORMATS[lesson.stickerFormat] || this.FORMATS.medium;
    const stickers = lesson.stickers || [];
    const count = stickers.length;
    const useUppercase = ConfigManager.state.useUppercase;
    const useColorBorders = ConfigManager.state.useColorBorders;

    containerElement.className = `space-y-8 sticker-album-container ${useUppercase ? 'uppercase-mode' : ''} ${!useColorBorders ? 'monochrome-mode' : ''}`;

    let html = `
      <!-- Stile dedicato per la Stampa A4 a 2 Fogli Separati -->
      <style>
        @media print {
          .sticker-album-page-break {
            page-break-before: always !important;
            break-before: page !important;
            margin-top: 2rem !important;
          }
          .sticker-cut-border {
            border: 2px dashed #64748b !important;
          }
          .sticker-paste-box {
            border: 2px dashed #94a3b8 !important;
            background-color: #f8fafc !important;
          }
        }
      </style>

      <!-- BARRA DI CONTROLLO NO-PRINT (Formato, Aggiunta e Statistiche) -->
      <div class="no-print bg-gradient-to-r from-indigo-50 via-blue-50 to-sky-50 p-4 sm:p-5 rounded-2xl border border-indigo-200/80 shadow-sm space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <span class="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-lg shadow-sm">🗂️</span>
            <div>
              <h2 class="text-base font-bold text-indigo-950 flex items-center gap-2">
                Album & Figurine da Ritaglio
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-200/70 text-indigo-800">2 Fogli A4 Sincronizzati</span>
              </h2>
              <p class="text-xs text-indigo-700">Il Raccoglitore e il Foglio Figurine sono sempre agganciati 1:1 in automatico.</p>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <button type="button"
                    class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center gap-1.5 transition"
                    onclick="window.app.addStickerToAlbum()">
              <span>➕ Aggiungi Figurina</span>
            </button>
            <button type="button"
                    class="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold shadow-sm flex items-center gap-1.5 transition"
                    onclick="window.print()">
              <span>🖨️ Stampa A4</span>
            </button>
          </div>
        </div>

        <!-- Selettore del Formato Figurine -->
        <div class="pt-3 border-t border-indigo-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="text-xs font-bold text-indigo-900">Formato Tessere:</span>
            ${Object.keys(this.FORMATS).map(k => {
              const f = this.FORMATS[k];
              const isSelected = lesson.stickerFormat === k;
              return `
                <button type="button"
                        class="px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                          isSelected 
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs' 
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-indigo-50/60'
                        }"
                        onclick="window.app.setStickerAlbumFormat('${k}')">
                  ${f.label}
                </button>
              `;
            }).join('')}
          </div>

          <div class="text-xs text-indigo-900 font-medium">
            Elementi totali: <strong class="text-indigo-700 font-bold">${count}</strong> figurine
            (<span class="text-slate-600">pagine stimate: ${Math.ceil(count / fmt.perPage)} Raccoglitore + ${Math.ceil(count / fmt.perPage)} Figurine</span>)
          </div>
        </div>
      </div>

      <!-- ========================================================================= -->
      <!-- FOGLIO 1: IL RACCOGLITORE A4 (Dove incollare le figurine)                  -->
      <!-- ========================================================================= -->
      <div class="print-sheet bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 sticker-album-collector-sheet">
        
        <!-- Intestazione Foglio 1 -->
        <div class="border-b-2 border-slate-200 pb-4 mb-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div class="flex-1 min-w-0">
              <span class="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 mb-1.5">
                FOGLIO 1 • IL MIO RACCOGLITORE CAA
              </span>
              
              <!-- Input Titolo a Video (No-Print) -->
              <div class="no-print">
                <input type="text"
                       class="w-full text-xl sm:text-2xl font-bold text-slate-900 bg-slate-50/70 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-1.5 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                       value="${this.escapeHtml(lesson.title || 'Il mio Album di Figurine CAA')}"
                       id="inputLessonTitle"
                       oninput="window.app.updateLessonTitle(this.value)"
                       placeholder="Titolo dell'album..." />
              </div>
              
              <!-- Titolo Pulito in Stampa -->
              <h1 class="print-only text-2xl font-bold text-slate-900 caa-text">${this.escapeHtml(lesson.title || 'Il mio Album di Figurine CAA')}</h1>
            </div>

            <!-- Dati Alunno per Stampa -->
            <div class="flex items-center gap-4 text-xs font-semibold text-slate-600">
              <div class="border-b border-slate-400 pb-0.5 min-w-[140px]">Alunno: ________________</div>
              <div class="border-b border-slate-400 pb-0.5 min-w-[90px]">Data: _________</div>
            </div>
          </div>

          <p class="text-xs text-slate-500 mt-2">
            Istruzioni: ritaglia le figurine dal Foglio 2 e incollale nello spazio corrispondente a ciascuna parola.
          </p>
        </div>

        <!-- GRIGLIA RACCOGLITORE (Caselle Vuote con Didascalia in Alto) -->
        <div class="grid ${fmt.gridClass}">
          ${stickers.map((stk, idx) => `
            <div class="flex flex-col rounded-xl border border-slate-200 bg-white p-2.5 shadow-2xs transition hover:border-indigo-300 relative group"
                 data-sticker-index="${idx}">
              
              <!-- Casella di Testo / Didascalia in Alto -->
              <div class="mb-2 flex items-center justify-between gap-1.5 border-b border-slate-100 pb-1.5">
                <span class="no-print w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                  ${idx + 1}
                </span>

                <!-- Input Didascalia a Video (No-Print) -->
                <input type="text"
                       class="no-print flex-1 text-xs sm:text-sm font-bold text-slate-800 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-md px-2 py-0.5 focus:outline-none text-center"
                       value="${this.escapeHtml(stk.label || '')}"
                       oninput="window.app.updateStickerLabel(${idx}, this.value)"
                       placeholder="Etichetta..." />

                <!-- Testo Stampato Pulito (Senza numeri) -->
                <span class="print-only flex-1 text-center font-bold text-xs sm:text-sm text-slate-900 caa-text">
                  ${this.escapeHtml(stk.label || '')}
                </span>

                <!-- Rimozione veloce a video (No-Print) -->
                <button type="button"
                        class="no-print opacity-0 group-hover:opacity-100 text-slate-400 hover:text-rose-600 transition p-0.5"
                        onclick="window.app.removeStickerFromAlbum(${idx})"
                        title="Elimina figurina e casella corrispondente">
                  ✕
                </button>
              </div>

              <!-- Riquadro Vuoto Sagomato per Incollare la Figurina (Senza numeri) -->
              <div class="flex-1 ${fmt.boxClass} rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/60 flex flex-col items-center justify-center p-2 text-center text-slate-400 select-none sticker-paste-box">
                <span class="text-xl sm:text-2xl mb-1 opacity-60">📎</span>
                <span class="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  Incolla qui
                </span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- ========================================================================= -->
      <!-- FOGLIO 2: LE FIGURINE DA RITAGLIARE (Linee di ritaglio + Simboli CAA)     -->
      <!-- ========================================================================= -->
      <div class="print-sheet bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 sticker-album-page-break">
        
        <!-- Intestazione Foglio 2 -->
        <div class="border-b-2 border-dashed border-slate-300 pb-4 mb-6">
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span class="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 mb-1.5">
                FOGLIO 2 • FIGURINE DA RITAGLIARE
              </span>
              <h2 class="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
                <span>✂️</span> Foglio Tessere da Ritagliare
              </h2>
            </div>
            <div class="text-xs text-slate-500 italic">
              Ritaglia lungo le linee tratteggiate esterne.
            </div>
          </div>
          <p class="text-xs text-slate-600 mt-1">
            Percorso: <strong class="text-slate-800">${this.escapeHtml(lesson.title || 'Album CAA')}</strong>
            • Formato tessere: <strong>${fmt.label}</strong>
          </p>
        </div>

        <!-- GRIGLIA FIGURINE DA RITAGLIARE -->
        <div class="grid ${fmt.gridClass}">
          ${stickers.map((stk, idx) => {
            const token = stk.token || {};
            const category = token.category || 'noun';
            const borderColClass = this.getCategoryBorderClass(category);

            return `
              <div class="flex flex-col items-center justify-between rounded-xl border-2 border-dashed border-slate-400 p-2.5 bg-white relative transition hover:border-emerald-500 sticker-cut-border group"
                   data-sticker-index="${idx}">
                
                <!-- Indicatore di Ritaglio con Forbice in Alto (Nessun numero in stampa né a video) -->
                <div class="w-full flex items-center justify-end text-[10px] text-slate-400 mb-1">
                  <span class="flex items-center gap-0.5">✂️ <span class="text-[9px]">taglio</span></span>
                </div>

                <!-- Box Immagine CAA -->
                <div class="flex-1 flex flex-col items-center justify-center p-1 w-full">
                  <div class="${fmt.imgSizeClass} flex items-center justify-center rounded-lg border-2 ${borderColClass} overflow-hidden bg-white shadow-2xs mb-1.5 relative">
                    ${this.renderTokenImage(token)}
                  </div>

                  <!-- Testo Figurina -->
                  <span class="text-xs sm:text-sm font-bold text-slate-800 caa-text text-center px-1 truncate max-w-full">
                    ${this.escapeHtml(stk.label || token.displayWord || '')}
                  </span>
                </div>

                <!-- Barra Controlli Figurina a Video (No-Print) -->
                <div class="no-print w-full pt-1.5 mt-1 border-t border-slate-100 flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <button type="button"
                          class="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[11px] font-semibold transition"
                          onclick="window.app.changeStickerImage(${idx})"
                          title="Cerca o sostituisci simbolo per questa figurina">
                    🖼️ Simbolo
                  </button>
                  <button type="button"
                          class="px-2 py-0.5 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded text-[11px] font-semibold transition"
                          onclick="window.app.generateStickerWithAi(${idx})"
                          title="Genera simbolo personalizzato con IA">
                    ✨ IA
                  </button>
                  <button type="button"
                          class="px-1.5 py-0.5 text-slate-400 hover:text-rose-600 rounded text-[11px] transition"
                          onclick="window.app.removeStickerFromAlbum(${idx})"
                          title="Elimina figurina">
                    🗑️
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    containerElement.innerHTML = html;
  },

  /**
   * Renderizza l'immagine o l'SVG del simbolo CAA per una figurina.
   */
  renderTokenImage(token) {
    if (!token) {
      return '<span class="text-xs text-slate-400">Nessun simbolo</span>';
    }

    if (token.customImage) {
      return `<img src="${token.customImage}" alt="${this.escapeHtml(token.displayWord || '')}" class="max-w-full max-h-full object-contain pointer-events-none" />`;
    }

    if (token.imageUrl) {
      return `<img src="${token.imageUrl}" alt="${this.escapeHtml(token.displayWord || '')}" class="max-w-full max-h-full object-contain pointer-events-none" loading="lazy" />`;
    }

    if (token.svgRaw) {
      return token.svgRaw;
    }

    // Fallback con prima lettera o icona
    const word = token.displayWord || token.searchTerm || '?';
    return `<span class="text-xl font-bold text-slate-600">${this.escapeHtml(word.charAt(0).toUpperCase())}</span>`;
  },

  /**
   * Restituisce la classe del colore del bordo secondo lo standard Fitzgerald Key.
   */
  getCategoryBorderClass(category) {
    switch (category) {
      case 'person': return 'border-amber-400 bg-amber-50/20';
      case 'verb': return 'border-emerald-500 bg-emerald-50/20';
      case 'noun': return 'border-orange-500 bg-orange-50/20';
      case 'adjective': return 'border-blue-500 bg-blue-50/20';
      case 'social': return 'border-pink-500 bg-pink-50/20';
      case 'misc':
      default:
        return 'border-slate-300 bg-slate-50/40';
    }
  },

  /**
   * Utility per l'escape sicuro di stringhe HTML.
   */
  escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};
