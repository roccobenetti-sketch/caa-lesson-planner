/**
 * DocumentExtractor: Estrazione testo e capitoli da file multiformato.
 * Supporta:
 * - PDF (.pdf): estrazione testo pagina per pagina con separatori puliti
 * - Microsoft Word (.docx): estrazione testo e titoli paragrafi da XML
 * - Word legacy (.doc): estrazione testo binario / RTF con pulizia
 * - eBook EPUB (.epub): parsing archivio OCF/OPF ed estrazione XHTML capitoli
 * - eBook MOBI / AZW / FB2 / HTML: parsing capitoli e metadati
 * - Testo (.txt, .md, .rtf)
 */

export const DocumentExtractor = {
  /**
   * Determina il formato ed estrae il testo strutturato con capitoli/pagine.
   * @param {File} file
   * @param {Function} [onProgress]
   * @returns {Promise<{ title: string, text: string, format: string, pageCount?: number }>}
   */
  async extractFromFile(file, onProgress = null) {
    if (!file) throw new Error('Nessun file selezionato.');

    const name = file.name || 'documento';
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
    const cleanTitle = name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();

    if (onProgress) onProgress(`Lettura file "${name}" (${ext})...`);

    // 1. File di testo puro (.txt, .md, .csv)
    if (['.txt', '.md', '.markdown', '.csv'].includes(ext)) {
      const text = await file.text();
      return { title: cleanTitle, text: this.cleanExtractedText(text), format: 'txt' };
    }

    // 2. File PDF (.pdf)
    if (ext === '.pdf') {
      if (onProgress) onProgress('Estrazione pagine e testo dal file PDF...');
      const result = await this.extractFromPdf(file, onProgress);
      return { title: cleanTitle, text: result.text, format: 'pdf', pageCount: result.pageCount };
    }

    // 3. Documenti Microsoft Word DOCX (.docx)
    if (ext === '.docx') {
      if (onProgress) onProgress('Estrazione testo da documento Word (.docx)...');
      const text = await this.extractFromDocx(file);
      return { title: cleanTitle, text: this.cleanExtractedText(text), format: 'docx' };
    }

    // 4. Documenti Word legacy (.doc)
    if (ext === '.doc') {
      if (onProgress) onProgress('Estrazione testo da documento Word legacy (.doc)...');
      const text = await this.extractFromLegacyDoc(file);
      return { title: cleanTitle, text: this.cleanExtractedText(text), format: 'doc' };
    }

    // 5. eBook EPUB (.epub)
    if (ext === '.epub') {
      if (onProgress) onProgress('Estrazione capitoli da eBook EPUB (.epub)...');
      const text = await this.extractFromEpub(file, onProgress);
      return { title: cleanTitle, text: this.cleanExtractedText(text), format: 'epub' };
    }

    // 6. eBook MOBI / Kindle (.mobi, .azw, .azw3)
    if (['.mobi', '.azw', '.azw3', '.prc'].includes(ext)) {
      if (onProgress) onProgress(`Estrazione testo da eBook Kindle (${ext})...`);
      const text = await this.extractFromMobi(file);
      return { title: cleanTitle, text: this.cleanExtractedText(text), format: 'mobi' };
    }

    // 7. FictionBook (.fb2) o pagine HTML/XHTML
    if (['.fb2', '.html', '.htm', '.xhtml'].includes(ext)) {
      const raw = await file.text();
      const text = this.stripHtmlTags(raw);
      return { title: cleanTitle, text: this.cleanExtractedText(text), format: ext.slice(1) };
    }

    // Fallback: tentativo di lettura testuale diretta
    try {
      const rawText = await file.text();
      return { title: cleanTitle, text: this.cleanExtractedText(rawText), format: 'raw' };
    } catch (e) {
      throw new Error(`Formato ${ext} non supportato per l'estrazione automatica.`);
    }
  },

  /**
   * Estrazione da PDF tramite PDF.js con fallback su estrazione stream di testo.
   */
  async extractFromPdf(file, onProgress = null) {
    const arrayBuffer = await file.arrayBuffer();

    // Se PDF.js è disponibile globalmente (es. via cdnjs)
    if (typeof window !== 'undefined' && window.pdfjsLib) {
      try {
        const loadingTask = window.pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        const totalPages = pdf.numPages;
        const pagesText = [];

        for (let i = 1; i <= totalPages; i++) {
          if (onProgress && i % 3 === 0) {
            onProgress(`Estrazione PDF: pagina ${i} di ${totalPages}...`);
          }
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageStrings = textContent.items.map(item => item.str).filter(Boolean);
          const merged = pageStrings.join(' ').trim();
          if (merged) {
            pagesText.push(merged);
          }
        }

        return {
          text: this.cleanExtractedText(pagesText.join('\n\n')),
          pageCount: totalPages
        };
      } catch (pdfErr) {
        console.warn('Errore PDF.js, uso fallback binario:', pdfErr);
      }
    }

    // Fallback: parsing euristico stream PDF per stringhe testuali in ASCII/UTF-8
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('latin1');
    const rawPdf = decoder.decode(bytes);

    const matches = [];
    // Cerca stringhe tra parentesi nei blocchi TJ o Tj di PDF
    const tjRegex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
    let match;
    while ((match = tjRegex.exec(rawPdf)) !== null) {
      const str = match[1].replace(/\\([()\\])/g, '$1').trim();
      if (str.length > 1 && !/^[0-9\s.]+$/.test(str)) {
        matches.push(str);
      }
    }

    if (matches.length > 10) {
      return { text: this.cleanExtractedText(matches.join(' ')), pageCount: 1 };
    }

    throw new Error('Impossibile estrarre il testo dal PDF: il file potrebbe essere una scansione (immagine) o protetto.');
  },

  /**
   * Estrazione da Microsoft Word DOCX (archivio ZIP contenente word/document.xml).
   */
  async extractFromDocx(file) {
    const arrayBuffer = await file.arrayBuffer();

    // Se JSZip è disponibile nel browser
    if (typeof window !== 'undefined' && window.JSZip) {
      const zip = await window.JSZip.loadAsync(arrayBuffer);
      const docXmlFile = zip.file('word/document.xml');
      if (docXmlFile) {
        const xmlText = await docXmlFile.async('text');
        return this.parseDocxXml(xmlText);
      }
    }

    // Fallback senza librerie esterne: scansione del pacchetto ZIP PK
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const raw = decoder.decode(bytes);

    const xmlStart = raw.indexOf('<w:document');
    if (xmlStart !== -1) {
      const xmlEnd = raw.indexOf('</w:document>', xmlStart);
      if (xmlEnd !== -1) {
        const xmlSlice = raw.slice(xmlStart, xmlEnd + 13);
        return this.parseDocxXml(xmlSlice);
      }
    }

    // Estrazione euristica dei tag <w:t>
    const wtRegex = /<w:t[^>]*>([^<]+)<\/w:t>/g;
    const tokens = [];
    let wtMatch;
    while ((wtMatch = wtRegex.exec(raw)) !== null) {
      tokens.push(wtMatch[1]);
    }

    if (tokens.length > 0) {
      return tokens.join(' ');
    }

    throw new Error('Impossibile estrarre testo dal file Word (.docx). Assicurati che non sia protetto da password.');
  },

  parseDocxXml(xmlText) {
    // Trasforma ogni paragrafo <w:p> in una riga separata
    const paragraphs = [];
    const pRegex = /<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g;
    let pMatch;

    while ((pMatch = pRegex.exec(xmlText)) !== null) {
      const pBody = pMatch[1];
      const wtRegex = /<w:t(?:\s[^>]*)?>([^<]+)<\/w:t>/g;
      const runs = [];
      let tMatch;
      while ((tMatch = wtRegex.exec(pBody)) !== null) {
        runs.push(tMatch[1]);
      }
      const paragraphText = runs.join('').trim();
      if (paragraphText) {
        paragraphs.push(paragraphText);
      }
    }

    return paragraphs.join('\n\n');
  },

  /**
   * Estrazione da file Word legacy (.doc) o RTF.
   */
  async extractFromLegacyDoc(file) {
    const raw = await file.text();
    // Se è in formato RTF
    if (raw.startsWith('{\\rtf')) {
      const cleanRtf = raw
        .replace(/\\par[d]?/gi, '\n')
        .replace(/\\line/gi, '\n')
        .replace(/\\[a-z0-9\-]+ ?/gi, '')
        .replace(/[{}]/g, '');
      return cleanRtf;
    }

    // Estrazione stringhe stampabili da formato binario Compound File
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const chars = [];
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if ((b >= 32 && b <= 126) || b === 10 || b === 13 || b >= 192) {
        chars.push(String.fromCharCode(b));
      } else if (b === 0 && chars.length > 0 && chars[chars.length - 1] !== ' ') {
        chars.push(' ');
      }
    }
    const filtered = chars.join('').replace(/\s{2,}/g, ' ');
    return filtered.slice(0, 45000);
  },

  /**
   * Estrazione da eBook EPUB (archivio ZIP con capitoli HTML/XHTML).
   */
  async extractFromEpub(file, onProgress = null) {
    const arrayBuffer = await file.arrayBuffer();

    if (typeof window !== 'undefined' && window.JSZip) {
      const zip = await window.JSZip.loadAsync(arrayBuffer);
      const htmlFiles = [];

      zip.forEach((relativePath, zipEntry) => {
        const lower = relativePath.toLowerCase();
        if ((lower.endsWith('.html') || lower.endsWith('.xhtml') || lower.endsWith('.htm')) && !lower.includes('nav') && !lower.includes('toc')) {
          htmlFiles.push({ path: relativePath, entry: zipEntry });
        }
      });

      // Ordina i file in ordine alfabetico/naturale dei capitoli
      htmlFiles.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));

      const chaptersText = [];
      for (let i = 0; i < htmlFiles.length; i++) {
        const item = htmlFiles[i];
        if (onProgress && i % 2 === 0) {
          onProgress(`Estrazione EPUB: capitolo ${i + 1} di ${htmlFiles.length}...`);
        }
        const html = await item.entry.async('text');
        const stripped = this.stripHtmlTags(html);
        if (stripped.length > 40) {
          chaptersText.push(stripped);
        }
      }

      if (chaptersText.length > 0) {
        return chaptersText.join('\n\n');
      }
    }

    // Fallback senza JSZip: estrazione euristica dei tag <p> da stream
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const raw = decoder.decode(bytes);
    return this.stripHtmlTags(raw);
  },

  /**
   * Estrazione da eBook MOBI / Kindle.
   */
  async extractFromMobi(file) {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder('latin1');
    const raw = decoder.decode(bytes);

    // Cerca blocchi HTML tipici nei formati MOBI/PalmDOC
    const htmlStart = raw.indexOf('<html');
    if (htmlStart !== -1) {
      const htmlEnd = raw.indexOf('</html>', htmlStart);
      const rawHtml = htmlEnd !== -1 ? raw.slice(htmlStart, htmlEnd + 7) : raw.slice(htmlStart, htmlStart + 80000);
      return this.stripHtmlTags(rawHtml);
    }

    // Fallback: pulizia del testo grezzo PalmDOC
    return this.stripHtmlTags(raw.slice(1024, 65000));
  },

  /**
   * Rimuove i tag HTML preservando paragrafi e interruzioni di riga.
   */
  stripHtmlTags(html) {
    if (!html) return '';
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  },

  /**
   * Normalizza e pulisce il testo estratto per l'IN-Book.
   */
  cleanExtractedText(text) {
    if (!text) return '';
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
};
