/**
 * StickerAlbumEngine: Modulo autonomo per la creazione, gestione e stampa di
 * Album di Figurine didattici e Raccoglitori di tessere CAA in formato A4.
 *
 * Principi cardine:
 * 1. Corrispondenza dimensionale 1:1 rigorosa:
 *    Il riquadro vuoto "Incolla qui" nel Raccoglitore e la tessera da ritagliare
 *    hanno le STESSE IDENTICHE dimensioni millimetriche su carta e a video.
 * 2. Paginazione automatica multi-foglio A4:
 *    Se le figurine superano la capienza del foglio A4 per il formato scelto,
 *    vengono generate automaticamente più pagine di Raccoglitore (es. Pagina 1 di 2, 2 di 2)
 *    e altrettante pagine di Figurine da ritagliare, con impaginazione A4 perfetta.
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
      boxClass: 'sticker-box-large',
      imgClass: 'sticker-img-large',
      gridClass: 'grid-cols-2 gap-x-6 gap-y-4'
    },
    medium: {
      id: 'medium',
      label: 'Medio (12 per foglio A4 - 3×4) [Predefinito]',
      description: 'Formato standard universale PECS e quaderno CAA',
      cols: 3,
      perPage: 12,
      boxClass: 'sticker-box-medium',
      imgClass: 'sticker-img-medium',
      gridClass: 'grid-cols-3 gap-x-4 gap-y-3'
    },
    small: {
      id: 'small',
      label: 'Piccolo (20 per foglio A4 - 4×5)',
      description: 'Ideale per vocabolario esteso e agende visive compatte',
      cols: 4,
      perPage: 20,
      boxClass: 'sticker-box-small',
      imgClass: 'sticker-img-small',
      gridClass: 'grid-cols-4 gap-x-3 gap-y-2'
    }
  },

  /**
   * Suddivide un array in blocchi (pagine) di dimensione massima specificata.
   */
  chunkArray(array, size) {
    if (!Array.isArray(array) || array.length === 0) {
      return [{ pageIndex: 0, startIndex: 0, items: [] }];
    }
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push({
        pageIndex: Math.floor(i / size),
        startIndex: i,
        items: array.slice(i, i + size)
      });
    }
    return chunks;
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

    // Suddivisione in pagine A4 sia per il Raccoglitore che per le Figurine
    const pages = this.chunkArray(stickers, fmt.perPage);
    const totalPages = pages.length;

    containerElement.className = `space-y-8 sticker-album-container ${useUppercase ? 'uppercase-mode' : ''} ${!useColorBorders ? 'monochrome-mode' : ''}`;

    let html = `
      <!-- STILI DEDICATI PER LA PRECISIONE 1:1 E LA STAMPA MULTI-FOGLIO A4 -->
      <style>
        /* Dimensioni millimetriche esatte 1:1 tra figurina e riquadro incolla */
        .sticker-box-large {
          width: 78mm !important;
          height: 64mm !important;
          min-width: 78mm !important;
          max-width: 78mm !important;
          min-height: 64mm !important;
          max-height: 64mm !important;
          box-sizing: border-box !important;
        }
        .sticker-img-large {
          width: 44mm !important;
          height: 44mm !important;
          min-width: 44mm !important;
          max-width: 44mm !important;
          min-height: 44mm !important;
          max-height: 44mm !important;
        }

        .sticker-box-medium {
          width: 52mm !important;
          height: 47mm !important;
          min-width: 52mm !important;
          max-width: 52mm !important;
          min-height: 47mm !important;
          max-height: 47mm !important;
          box-sizing: border-box !important;
        }
        .sticker-img-medium {
          width: 32mm !important;
          height: 32mm !important;
          min-width: 32mm !important;
          max-width: 32mm !important;
          min-height: 32mm !important;
          max-height: 32mm !important;
        }

        .sticker-box-small {
          width: 39mm !important;
          height: 36mm !important;
          min-width: 39mm !important;
          max-width: 39mm !important;
          min-height: 36mm !important;
          max-height: 36mm !important;
          box-sizing: border-box !important;
        }
        .sticker-img-small {
          width: 24mm !important;
          height: 24mm !important;
          min-width: 24mm !important;
          max-width: 24mm !important;
          min-height: 24mm !important;
          max-height: 24mm !important;
        }

        .sticker-cut-border {
          border: 2px dashed #64748b !important;
        }
        .sticker-paste-box {
          border: 2px dashed #94a3b8 !important;
          background-color: #f8fafc !important;
        }

        /* Regole di salto pagina A4 per la stampa */
        @media print {
          .album-a4-page {
            page-break-after: always !important;
            break-after: page !important;
            margin: 0 !important;
            padding: 8mm 10mm !important;
            min-height: 280mm !important;
            box-shadow: none !important;
            border: none !important;
          }
          .album-a4-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
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
                <span class="px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-200/70 text-indigo-800">
                  Dimensioni 1:1 • Paginazione Automatica
                </span>
              </h2>
              <p class="text-xs text-indigo-700">Le caselle del raccoglitore e le figurine ritagliabili hanno identiche misure al millimetro.</p>
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
            Figurine: <strong class="text-indigo-700 font-bold">${count}</strong>
            • Fogli A4 stimati: <strong class="text-indigo-800 font-bold">${totalPages * 2}</strong>
            (${totalPages} Raccoglitore + ${totalPages} Figurine)
          </div>
        </div>
      </div>

      <!-- ========================================================================= -->
      <!-- SEZIONE 1: I FOGLI RACCOGLITORE A4 (Dove incollare le figurine)           -->
      <!-- ========================================================================= -->
      ${pages.map((chunk, pIdx) => `
        <div class="print-sheet album-a4-page bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 sticker-album-collector-sheet">
          
          <!-- Intestazione Pagina Raccoglitore -->
          <div class="border-b-2 border-slate-200 pb-3 mb-5">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div class="flex-1 min-w-0">
                <span class="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800 mb-1.5">
                  FOGLIO RACCOGLITORE • PAGINA ${pIdx + 1} DI ${totalPages}
                </span>
                
                <!-- Input Titolo a Video (No-Print) solo su Pagina 1, sulle altre testo fisso -->
                ${pIdx === 0 ? `
                  <div class="no-print">
                    <input type="text"
                           class="w-full text-xl sm:text-2xl font-bold text-slate-900 bg-slate-50/70 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-1.5 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                           value="${this.escapeHtml(lesson.title || 'Il mio Album di Figurine CAA')}"
                           id="inputLessonTitle"
                           oninput="window.app.updateLessonTitle(this.value)"
                           placeholder="Titolo dell'album..." />
                  </div>
                ` : `
                  <h2 class="no-print text-xl font-bold text-slate-800">${this.escapeHtml(lesson.title || 'Il mio Album di Figurine CAA')} (Cont.)</h2>
                `}
                
                <!-- Titolo Pulito in Stampa -->
                <h1 class="print-only text-xl sm:text-2xl font-bold text-slate-900 caa-text">
                  ${this.escapeHtml(lesson.title || 'Il mio Album di Figurine CAA')}
                  ${totalPages > 1 ? `<span class="text-sm font-normal text-slate-600"> (Pag. ${pIdx + 1}/${totalPages})</span>` : ''}
                </h1>
              </div>

              <!-- Dati Alunno per Stampa -->
              <div class="flex items-center gap-3 text-xs font-semibold text-slate-600 shrink-0">
                <div class="border-b border-slate-400 pb-0.5 min-w-[130px]">Alunno: ______________</div>
                <div class="border-b border-slate-400 pb-0.5 min-w-[80px]">Data: ________</div>
              </div>
            </div>

            <p class="text-xs text-slate-500 mt-1">
              Istruzioni: ritaglia le figurine dal foglio di ritaglio e incollale nello spazio corrispondente a ciascuna parola.
            </p>
          </div>

          <!-- GRIGLIA RACCOGLITORE DELLA PAGINA (Caselle con dimensioni millimetriche fisse) -->
          <div class="grid ${fmt.gridClass} justify-items-center">
            ${chunk.items.map((stk, localIdx) => {
              const globalIdx = chunk.startIndex + localIdx;
              return `
                <div class="flex flex-col items-center rounded-xl border border-slate-200 bg-white p-2 shadow-2xs transition hover:border-indigo-300 relative group"
                     data-sticker-index="${globalIdx}">
                  
                  <!-- Casella di Testo / Didascalia in Alto -->
                  <div class="w-full mb-1.5 flex items-center justify-between gap-1 border-b border-slate-100 pb-1">
                    <span class="no-print w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                      ${globalIdx + 1}
                    </span>

                    <!-- Input Didascalia a Video (No-Print) -->
                    <input type="text"
                           class="no-print flex-1 text-xs sm:text-sm font-bold text-slate-800 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-md px-1.5 py-0.5 focus:outline-none text-center"
                           value="${this.escapeHtml(stk.label || '')}"
                           oninput="window.app.updateStickerLabel(${globalIdx}, this.value)"
                           placeholder="Etichetta..." />

                    <!-- Testo Stampato Pulito (Senza numeri) -->
                    <span class="print-only flex-1 text-center font-bold text-xs sm:text-sm text-slate-900 caa-text">
                      ${this.escapeHtml(stk.label || '')}
                    </span>

                    <!-- Rimozione veloce a video (No-Print) -->
                    <button type="button"
                            class="no-print text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full w-5 h-5 flex items-center justify-center transition p-0.5"
                            onclick="window.app.removeStickerFromAlbum(${globalIdx})"
                            title="Elimina figurina e casella corrispondente">
                      ✕
                    </button>
                  </div>

                  <!-- Riquadro Vuoto Sagomato per Incollare la Figurina (DIMENSIONI FISSE ESATTE 1:1) -->
                  <div class="${fmt.boxClass} rounded-lg border-2 border-dashed border-slate-300 bg-slate-50/70 flex flex-col items-center justify-center p-2 text-center text-slate-400 select-none sticker-paste-box">
                    <span class="text-lg sm:text-xl mb-1 opacity-60">📎</span>
                    <span class="text-[10px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Incolla qui
                    </span>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}

      <!-- ========================================================================= -->
      <!-- SEZIONE 2: I FOGLI FIGURINE DA RITAGLIARE A4                              -->
      <!-- ========================================================================= -->
      ${pages.map((chunk, pIdx) => `
        <div class="print-sheet album-a4-page bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-200 sticker-album-stickers-sheet">
          
          <!-- Intestazione Foglio Figurine -->
          <div class="border-b-2 border-dashed border-slate-300 pb-3 mb-5">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span class="inline-block px-3 py-1 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 mb-1.5">
                  FOGLIO FIGURINE DA RITAGLIARE • PAGINA ${pIdx + 1} DI ${totalPages}
                </span>
                <h2 class="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <span>✂️</span> Foglio Tessere da Ritagliare
                  ${totalPages > 1 ? `<span class="text-sm font-normal text-slate-500">(Pag. ${pIdx + 1}/${totalPages})</span>` : ''}
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

          <!-- GRIGLIA FIGURINE DA RITAGLIARE (DIMENSIONI FISSE ESATTE 1:1) -->
          <div class="grid ${fmt.gridClass} justify-items-center">
            ${chunk.items.map((stk, localIdx) => {
              const globalIdx = chunk.startIndex + localIdx;
              const token = stk.token || {};
              const category = token.category || 'noun';
              const borderColClass = this.getCategoryBorderClass(category);

              return `
                <div class="flex flex-col items-center rounded-xl p-1 relative group"
                     data-sticker-index="${globalIdx}">
                  
                  <!-- TESSERA FIGURINA DA RITAGLIARE (DIMENSIONI IDENTICHE 1:1 AL RIQUADRO INCOLLA) -->
                  <div class="${fmt.boxClass} flex flex-col items-center justify-between rounded-lg border-2 border-dashed border-slate-400 p-1.5 bg-white relative transition hover:border-emerald-500 sticker-cut-border sticker-cut-card">
                    
                    <!-- Indicatore di Ritaglio con Forbice in Alto -->
                    <div class="w-full flex items-center justify-end text-[9px] text-slate-400 leading-none">
                      <span class="flex items-center gap-0.5">✂️ <span class="text-[8px]">taglio</span></span>
                    </div>

                    <!-- Box Immagine CAA con Pulsante Rapido Svuota Immagine -->
                    <div class="flex-1 flex flex-col items-center justify-center p-0.5 w-full overflow-hidden">
                      <div class="${fmt.imgClass} flex items-center justify-center rounded border-2 ${borderColClass} overflow-hidden bg-white shadow-2xs relative group/img">
                        ${this.renderTokenImage(token)}
                        <!-- Tasto veloce cancella immagine su hover o click (No-Print) -->
                        <button type="button"
                                class="no-print absolute top-0.5 right-0.5 w-4 h-4 bg-rose-500 hover:bg-rose-600 text-white rounded-full text-[9px] flex items-center justify-center shadow-xs opacity-0 group-hover/img:opacity-100 transition"
                                onclick="window.app.clearStickerImage(${globalIdx})"
                                title="Rimuovi immagine del simbolo">
                          ✕
                        </button>
                      </div>
                    </div>

                    <!-- Testo Figurina (Editabile a video, pulito in stampa) -->
                    <div class="w-full text-center px-0.5 leading-tight">
                      <input type="text"
                             class="no-print w-full text-[11px] sm:text-xs font-bold text-slate-800 bg-slate-50 hover:bg-slate-100 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded px-1 py-0.5 focus:outline-none text-center transition"
                             value="${this.escapeHtml(stk.label || token.displayWord || '')}"
                             oninput="window.app.updateStickerLabel(${globalIdx}, this.value)"
                             placeholder="Scritta..."
                             title="Clicca per modificare la scritta della figurina" />
                      
                      <span class="print-only text-[11px] sm:text-xs font-bold text-slate-800 caa-text block truncate">
                        ${this.escapeHtml(stk.label || token.displayWord || '')}
                      </span>
                    </div>
                  </div>

                  <!-- Barra Controlli Figurina a Video (No-Print) -->
                  <div class="no-print w-full pt-1.5 mt-1 border-t border-slate-100 flex items-center justify-between gap-1 flex-wrap">
                    <div class="flex items-center gap-1">
                      <button type="button"
                              class="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-[10px] font-bold transition flex items-center gap-0.5 shadow-2xs"
                              onclick="window.app.changeStickerImage(${globalIdx})"
                              title="Cerca o sostituisci simbolo per questa figurina">
                        <span>🖼️ Simbolo</span>
                      </button>
                      <button type="button"
                              class="px-2 py-0.5 bg-violet-50 hover:bg-violet-100 text-violet-700 rounded text-[10px] font-bold transition flex items-center gap-0.5 shadow-2xs"
                              onclick="window.app.generateStickerWithAi(${globalIdx})"
                              title="Genera simbolo personalizzato con IA per questa figurina">
                        <span>✨ IA</span>
                      </button>
                    </div>
                    <div class="flex items-center gap-1">
                      <button type="button"
                              class="p-0.5 text-slate-400 hover:text-amber-600 rounded hover:bg-amber-50 transition text-[10px]"
                              onclick="window.app.clearStickerImage(${globalIdx})"
                              title="Svuota immagine del simbolo">
                        🔄
                      </button>
                      <button type="button"
                              class="p-0.5 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50 transition text-[10px]"
                              onclick="window.app.removeStickerFromAlbum(${globalIdx})"
                              title="Elimina figurina e casella corrispondente">
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
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

    const imgUrl = token.imageUrl || (typeof token.customImage === 'string' ? token.customImage : '') || '';
    if (imgUrl) {
      return `<img src="${imgUrl}" alt="${this.escapeHtml(token.displayWord || '')}" class="max-w-full max-h-full object-contain pointer-events-none" loading="lazy" />`;
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
