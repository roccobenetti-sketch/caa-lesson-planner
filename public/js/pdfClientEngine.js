/**
 * PdfClientEngine: Generazione diretta in-browser di PDF ultra-leggeri (< 300 KB)
 * per CAA Lesson Planner tramite pdf-lib.
 * Funziona su qualsiasi dispositivo (Windows, Mac, iOS, Android, GitHub Pages)
 * senza dipendere dal server Python.
 */

// Tavolozza Fitzgerald Key standard CAA in formato RGB (0..1)
const FITZGERALD_RGB = {
  person: [0.98, 0.80, 0.08],     // Giallo (#FACC15)
  verb: [0.13, 0.77, 0.37],       // Verde (#22C55E)
  noun: [0.98, 0.45, 0.09],       // Arancione (#F97316)
  adjective: [0.23, 0.51, 0.96],  // Blu (#3B82F6)
  social: [0.93, 0.28, 0.60],     // Rosa (#EC4899)
  misc: [0.58, 0.64, 0.72]        // Grigio (#94A3B8)
};

export const PdfClientEngine = {
  /**
   * Genera il PDF A4 leggero con tessere formato figurina da album (4 per riga),
   * morale a pagina 3 insieme al Passo 5, e lo scarica direttamente nel browser.
   */
  async generateAndDownload(lessonData) {
    if (!lessonData) throw new Error('Dati del percorso CAA mancanti.');

    // Carica dinamicamente pdf-lib se non già presente nel DOM
    await this.ensurePdfLibLoaded();

    const { PDFDocument, rgb, StandardFonts } = window.PDFLib;
    const pdfDoc = await PDFDocument.create();
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const pageW = 595.28; // A4 pt
    const pageH = 841.89;
    const marginX = 30.0;
    const marginY = 30.0;
    const contentW = pageW - (marginX * 2);

    // Parametri tessere formato FIGURINA DA ALBUM (4 per riga)
    const cardW = 122.0;
    const cardH = 154.0;
    const cardGap = 10.0;
    const cardsPerRow = 4;
    const rowH = cardH + 12.0;
    const picSize = 98.0;

    let currentPage = pdfDoc.addPage([pageW, pageH]);
    let pageNum = 1;
    let currY = pageH - marginY;

    const startNewPage = () => {
      // Disegna numero pagina
      currentPage.drawText(String(pageNum), {
        x: pageW - marginX - 10,
        y: marginY - 15,
        size: 8,
        font: fontRegular,
        color: rgb(0.58, 0.64, 0.72)
      });
      currentPage = pdfDoc.addPage([pageW, pageH]);
      pageNum++;
      return pageH - marginY - 20.0;
    };

    // --- INTESTAZIONE LEZIONE (Pagina 1) ---
    const title = (lessonData.title || 'Percorso Didattico CAA').toUpperCase();
    const grade = (lessonData.targetGrade || 'primaria').toUpperCase();
    const primClass = lessonData.primaryClass || '';

    currentPage.drawText(title.slice(0, 50), {
      x: marginX,
      y: currY - 16,
      size: 15,
      font: fontBold,
      color: rgb(0.06, 0.09, 0.16)
    });
    currY -= 26;

    // Badge scuola
    const badgeText = !primClass ? `SCUOLA ${grade}` : `SCUOLA PRIMARIA — CLASSE ${primClass}ª`;
    const badgeW = fontBold.widthOfTextAtSize(badgeText, 8) + 12;
    currentPage.drawRectangle({
      x: marginX,
      y: currY - 12,
      width: badgeW,
      height: 14,
      color: rgb(0.11, 0.31, 0.85),
      borderWidth: 0
    });
    currentPage.drawText(badgeText, {
      x: marginX + 6,
      y: currY - 9,
      size: 8,
      font: fontBold,
      color: rgb(1, 1, 1)
    });
    currY -= 24;

    // Linea divisoria
    currentPage.drawLine({
      start: { x: marginX, y: currY },
      end: { x: marginX + contentW, y: currY },
      thickness: 1,
      color: rgb(0.89, 0.91, 0.94)
    });
    currY -= 14;

    // --- PUNTI DELLA STORIA ---
    const cards = (lessonData.cards || []).filter(c => c.includeInPrint !== false);

    for (let cIdx = 0; cIdx < cards.length; cIdx++) {
      const card = cards[cIdx];
      const tokens = card.tokens || [];
      const numTokens = tokens.length;
      const numRows = Math.max(1, Math.ceil(numTokens / cardsPerRow));

      const headerH = 24.0;
      const totalCardH = headerH + (numRows * rowH) + 16.0;

      if ((currY - totalCardH) < marginY) {
        currY = startNewPage();
      }

      const boxY = currY - totalCardH;
      const boxH = totalCardH;

      // Riquadro contenitore
      currentPage.drawRectangle({
        x: marginX,
        y: boxY,
        width: contentW,
        height: boxH,
        borderColor: rgb(0.80, 0.84, 0.88),
        borderWidth: 1,
        color: rgb(1, 1, 1)
      });

      // Badge numero passo
      currentPage.drawCircle({
        x: marginX + 14,
        y: currY - 12,
        size: 8,
        color: rgb(0.15, 0.39, 0.92)
      });
      currentPage.drawText(String(cIdx + 1), {
        x: marginX + 11.5,
        y: currY - 15,
        size: 8,
        font: fontBold,
        color: rgb(1, 1, 1)
      });

      const stepLabel = (card.stepLabel || `Passo ${cIdx + 1}`).toUpperCase();
      currentPage.drawText(stepLabel.slice(0, 70), {
        x: marginX + 28,
        y: currY - 15,
        size: 9,
        font: fontBold,
        color: rgb(0.06, 0.09, 0.16)
      });

      // Tessere CAA del punto
      const tokensStartY = currY - headerH - 4.0;

      for (let tIdx = 0; tIdx < tokens.length; tIdx++) {
        const rawToken = tokens[tIdx];
        const tokenObj = typeof rawToken === 'string' ? { displayWord: rawToken } : rawToken;
        const wordStr = (tokenObj.displayWord || '').toUpperCase();
        const cat = tokenObj.category || 'misc';

        const rIdx = Math.floor(tIdx / cardsPerRow);
        const colIdx = tIdx % cardsPerRow;

        const tx = marginX + 8.0 + (colIdx * (cardW + cardGap));
        const ty = tokensStartY - (rIdx * rowH) - cardH;

        const bColor = FITZGERALD_RGB[cat] || FITZGERALD_RGB.misc;

        currentPage.drawRectangle({
          x: tx,
          y: ty,
          width: cardW,
          height: cardH,
          borderColor: rgb(bColor[0], bColor[1], bColor[2]),
          borderWidth: 2,
          color: rgb(1, 1, 1)
        });

        // Testo parola
        const fontSize = wordStr.length <= 8 ? 9.5 : (wordStr.length <= 12 ? 8.0 : 6.8);
        const textW = fontBold.widthOfTextAtSize(wordStr, fontSize);
        currentPage.drawText(wordStr, {
          x: tx + Math.max(4, (cardW - textW) / 2.0),
          y: ty + cardH - 15,
          size: fontSize,
          font: fontBold,
          color: rgb(0.06, 0.09, 0.16)
        });

        // Immagine simbolo (se disponibile)
        await this.drawTokenImage(pdfDoc, currentPage, tokenObj, tx + ((cardW - picSize) / 2.0), ty + 10.0, picSize, picSize);
      }

      currY = boxY - 12.0;
    }

    // --- SEZIONE MORALE (Se presente) ---
    if (lessonData.moral) {
      const moral = lessonData.moral;
      const moralTitle = (moral.title || 'La Morale della Storia').toUpperCase();
      const moralTokens = moral.tokens || [];
      const mNumTokens = moralTokens.length;

      // Se molti token (> 8), usiamo 5 per riga per entrare comodamente su Pagina 3 insieme al Passo 5!
      const mCardsPerRow = mNumTokens > 8 ? 5 : 4;
      const mNumRows = Math.max(1, Math.ceil(mNumTokens / mCardsPerRow));

      const mCardGap = mCardsPerRow === 5 ? 8.0 : cardGap;
      const boxInnerW = contentW - 16.0;
      const mCardW = mCardsPerRow === 5 ? (boxInnerW - (4 * mCardGap)) / 5.0 : cardW;
      const mCardH = mCardsPerRow === 5 ? 132.0 : cardH;
      const mPicSize = mCardsPerRow === 5 ? 84.0 : picSize;
      const mRowH = mCardsPerRow === 5 ? (mCardH + 10.0) : rowH;

      const mHeaderH = 24.0;
      const mTotalH = mHeaderH + (mNumRows * mRowH) + 12.0;

      if ((currY - mTotalH) < marginY) {
        currY = startNewPage();
      }

      const mBoxY = currY - mTotalH;

      // Riquadro Morale
      currentPage.drawRectangle({
        x: marginX,
        y: mBoxY,
        width: contentW,
        height: mTotalH,
        borderColor: rgb(0.99, 0.83, 0.30),
        borderWidth: 1.5,
        color: rgb(1, 0.98, 0.92)
      });

      currentPage.drawText(`* ${moralTitle}`, {
        x: marginX + 12,
        y: currY - 15,
        size: 9,
        font: fontBold,
        color: rgb(0.47, 0.21, 0.06)
      });

      const mTokensStartY = currY - mHeaderH - 4.0;

      for (let mtIdx = 0; mtIdx < moralTokens.length; mtIdx++) {
        const rawMToken = moralTokens[mtIdx];
        const mtokenObj = typeof rawMToken === 'string' ? { displayWord: rawMToken } : rawMToken;
        const mwordStr = (mtokenObj.displayWord || '').toUpperCase();
        const mcat = mtokenObj.category || 'misc';

        const rIdx = Math.floor(mtIdx / mCardsPerRow);
        const colIdx = mtIdx % mCardsPerRow;

        const tx = marginX + 8.0 + (colIdx * (mCardW + mCardGap));
        const ty = mTokensStartY - (rIdx * mRowH) - mCardH;

        const mbColor = FITZGERALD_RGB[mcat] || FITZGERALD_RGB.misc;

        currentPage.drawRectangle({
          x: tx,
          y: ty,
          width: mCardW,
          height: mCardH,
          borderColor: rgb(mbColor[0], mbColor[1], mbColor[2]),
          borderWidth: 2,
          color: rgb(1, 1, 1)
        });

        const mFontSize = mwordStr.length <= 8 ? 9.0 : (mwordStr.length <= 12 ? 7.8 : 6.5);
        const mTextW = fontBold.widthOfTextAtSize(mwordStr, mFontSize);
        currentPage.drawText(mwordStr, {
          x: tx + Math.max(3, (mCardW - mTextW) / 2.0),
          y: ty + mCardH - 14,
          size: mFontSize,
          font: fontBold,
          color: rgb(0.06, 0.09, 0.16)
        });

        await this.drawTokenImage(pdfDoc, currentPage, mtokenObj, tx + ((mCardW - mPicSize) / 2.0), ty + 8.0, mPicSize, mPicSize);
      }

      currY = mBoxY - 12.0;
    }

    // Numero sull'ultima pagina
    currentPage.drawText(String(pageNum), {
      x: pageW - marginX - 10,
      y: marginY - 15,
      size: 8,
      font: fontRegular,
      color: rgb(0.58, 0.64, 0.72)
    });

    // Salvataggio e download
    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const safeTitle = (lessonData.title || 'scheda_caa')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 30);

    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}_leggero.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return { success: true, pages: pageNum, sizeBytes: pdfBytes.length };
  },

  /**
   * Disegna l'immagine del simbolo (PNG/JPEG compressa) nel documento PDF.
   */
  async drawTokenImage(pdfDoc, page, tokenObj, x, y, width, height) {
    const url = tokenObj.imageUrl;
    if (!url) return;

    try {
      let imageBytes = null;
      let isPng = false;

      if (url.startsWith('data:image/png;base64,')) {
        imageBytes = this.base64ToUint8Array(url.replace('data:image/png;base64,', ''));
        isPng = true;
      } else if (url.startsWith('data:image/jpeg;base64,') || url.startsWith('data:image/jpg;base64,')) {
        imageBytes = this.base64ToUint8Array(url.replace(/^data:image\/jpeg;base64,/, '').replace(/^data:image\/jpg;base64,/, ''));
        isPng = false;
      } else if (url.startsWith('http://') || url.startsWith('https://')) {
        // Fetch dell'immagine
        const resp = await fetch(url);
        if (resp.ok) {
          const ab = await resp.arrayBuffer();
          imageBytes = new Uint8Array(ab);
          isPng = url.toLowerCase().includes('.png');
        }
      }

      if (imageBytes) {
        const embeddedImg = isPng ? await pdfDoc.embedPng(imageBytes) : await pdfDoc.embedJpg(imageBytes);
        page.drawImage(embeddedImg, { x, y, width, height });
      }
    } catch (e) {
      // Ignora errori di disegno singola immagine per non interrompere il documento
    }
  },

  base64ToUint8Array(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  },

  /**
   * Assicura che la libreria pdf-lib sia caricata nel browser.
   */
  async ensurePdfLibLoaded() {
    if (window.PDFLib) return;
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Impossibile caricare la libreria PDF client-side.'));
      document.head.appendChild(script);
    });
  }
};
