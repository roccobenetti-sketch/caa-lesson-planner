"""
Generatore PDF ultra-compatto e ad alta efficienza per CAA Lesson Planner.
Utilizza ReportLab e Pillow per generare documenti PDF leggeri (< 1 MB),
con grafica vettoriale nitida e immagini compresse a risoluzione calibrata (150 DPI),
evitando qualsiasi saturazione di memoria dello spooler o crash delle stampanti fisiche (es. HP Laser MFP).
"""

import io
import json
import os
import re
import urllib.request
from pathlib import Path
from PIL import Image

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

# Tavolozza Fitzgerald Key standard CAA
FITZGERALD_COLORS = {
    'person': colors.HexColor('#FACC15'),     # Giallo
    'verb': colors.HexColor('#22C55E'),       # Verde
    'noun': colors.HexColor('#F97316'),       # Arancione
    'adjective': colors.HexColor('#3B82F6'),  # Blu
    'social': colors.HexColor('#EC4899'),     # Rosa
    'misc': colors.HexColor('#94A3B8')        # Grigio
}

# Cache delle immagini in memoria durante la sessione di generazione
_IMAGE_CACHE = {}

def get_optimized_image(url_or_data, max_dim=240):
    """
    Scarica o decodifica un'immagine, la ridimensiona a max_dim x max_dim e la converte in JPEG leggero.
    Restituisce un oggetto ImageReader pronto per ReportLab, oppure None.
    """
    if not url_or_data:
        return None

    if url_or_data in _IMAGE_CACHE:
        return _IMAGE_CACHE[url_or_data]

    img = None
    try:
        if url_or_data.startswith('http://') or url_or_data.startswith('https://'):
            req = urllib.request.Request(
                url_or_data,
                headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) CAALessonPlanner/1.0'}
            )
            with urllib.request.urlopen(req, timeout=8) as resp:
                data = resp.read()
                img = Image.open(io.BytesIO(data))
        elif url_or_data.startswith('data:image/'):
            match = re.match(r'^data:image/[^;]+;base64,(.+)$', url_or_data)
            if match:
                import base64
                data = base64.b64decode(match.group(1))
                img = Image.open(io.BytesIO(data))
    except Exception as e:
        img = None

    if img is not None:
        try:
            img.thumbnail((max_dim, max_dim), Image.Resampling.LANCZOS)
            bg = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
                bg.paste(img, mask=img.convert('RGBA').split()[3])
            else:
                bg.paste(img)

            buf = io.BytesIO()
            bg.save(buf, format='JPEG', quality=82, optimize=True)
            buf.seek(0)
            reader = ImageReader(buf)
            _IMAGE_CACHE[url_or_data] = reader
            return reader
        except Exception:
            pass

    return None

def get_token_image(token_obj, max_dim=240):
    """
    Recupera l'immagine per un token, con fallback intelligente su alternatives o catalogo ARASAAC.
    """
    if not isinstance(token_obj, dict):
        return None

    img_url = token_obj.get('imageUrl')

    # Se l'URL principale è valido e non è SVG raw non supportato da Pillow
    if img_url and not img_url.startswith('data:image/svg'):
        reader = get_optimized_image(img_url, max_dim)
        if reader:
            return reader

    # Fallback 1: Cerca tra le alternatives
    for alt in token_obj.get('alternatives', []):
        alt_url = alt.get('imageUrl') if isinstance(alt, dict) else str(alt)
        if alt_url and not alt_url.startswith('data:image/svg'):
            reader = get_optimized_image(alt_url, max_dim)
            if reader:
                return reader

    # Fallback 2: Ricerca ARASAAC tramite termine
    search_term = token_obj.get('searchTerm') or token_obj.get('displayWord')
    if search_term:
        clean_word = str(search_term).lower().strip()
        try:
            search_url = f"https://api.arasaac.org/v1/pictograms/it/bestsearch/{urllib.parse.quote(clean_word)}"
            req = urllib.request.Request(search_url, headers={'User-Agent': 'CAALessonPlanner/1.0'})
            with urllib.request.urlopen(req, timeout=5) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                if data and isinstance(data, list) and len(data) > 0:
                    pic_id = data[0].get('_id')
                    if pic_id:
                        arasaac_img_url = f"https://static.arasaac.org/pictograms/{pic_id}/{pic_id}_500.png"
                        reader = get_optimized_image(arasaac_img_url, max_dim)
                        if reader:
                            return reader
        except Exception:
            pass

    return None


def generate_lesson_pdf(project_data, output_path):
    """
    Genera un file PDF A4 leggero e stampabile dal dizionario del progetto CAA.
    """
    page_w, page_h = A4  # 595.27 x 841.89 pt
    margin_x = 30.0      # Margine sinistro/destro
    margin_y = 30.0      # Margine inferiore
    content_w = page_w - (margin_x * 2)

    # Parametri tessere CAA formato "FIGURINA DA ALBUM" (4 per riga, larghezza ~4.3 cm, altezza ~5.4 cm)
    card_w = 122.0
    card_h = 154.0
    card_gap = 10.0
    cards_per_row = 4
    row_h = card_h + 12.0
    pic_size = 100.0     # Disegno grande ~3.5 cm x 3.5 cm

    c = canvas.Canvas(str(output_path), pagesize=A4)
    c.setTitle(project_data.get('title', 'Scheda Didattica CAA'))
    c.setAuthor('CAA Lesson Planner')

    current_page = 1
    total_pages_placeholder = []

    def start_new_page():
        nonlocal current_page
        draw_page_footer(c, current_page, page_w, margin_y)
        c.showPage()
        current_page += 1
        return page_h - margin_y - 20.0

    def draw_page_footer(canv, page_num, pw, my):
        canv.saveState()
        canv.setFont("Helvetica", 8)
        canv.setFillColor(colors.HexColor('#94A3B8'))
        canv.drawRightString(pw - margin_x, my - 15, f"{page_num}")
        canv.restoreState()

    curr_y = page_h - margin_y

    # --- INTESTAZIONE LEZIONE (Prima Pagina) ---
    title = project_data.get('title', 'Percorso CAA').upper()
    grade = project_data.get('targetGrade', 'primaria').upper()
    prim_class = project_data.get('primaryClass', '')
    summary = project_data.get('contextSummary', '').strip()
    guide = project_data.get('teacherGuide', '').strip()

    # Titolo principale
    c.setFont("Helvetica-Bold", 16)
    c.setFillColor(colors.HexColor('#0F172A'))
    c.drawString(margin_x, curr_y - 16, title)
    curr_y -= 26

    # Badge ordine scuola
    badge_text = f"SCUOLA {grade}" if not prim_class else f"SCUOLA PRIMARIA — CLASSE {prim_class}ª"
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(colors.HexColor('#1D4ED8'))
    badge_w = c.stringWidth(badge_text, "Helvetica-Bold", 8) + 12
    c.roundRect(margin_x, curr_y - 12, badge_w, 14, 4, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.drawString(margin_x + 6, curr_y - 9, badge_text)
    curr_y -= 22

    # Riquadro Obiettivo Pedagogico (se presente)
    if summary and project_data.get('includeContextSummaryInPrint', True):
        c.saveState()
        c.setFillColor(colors.HexColor('#EFF6FF'))
        c.setStrokeColor(colors.HexColor('#BFDBFE'))
        c.setLineWidth(1)
        c.roundRect(margin_x, curr_y - 34, content_w, 34, 6, fill=1, stroke=1)
        
        c.setFont("Helvetica-Bold", 8)
        c.setFillColor(colors.HexColor('#1E3A8A'))
        c.drawString(margin_x + 8, curr_y - 12, "OBIETTIVO PEDAGOGICO:")
        
        c.setFont("Helvetica", 8)
        c.setFillColor(colors.HexColor('#1E40AF'))
        # Tronca se troppo lungo per stare in 2 righe
        summ_line = summary if len(summary) < 140 else summary[:137] + "..."
        c.drawString(margin_x + 8, curr_y - 25, summ_line)
        c.restoreState()
        curr_y -= 42

    # Linea divisoria elegante
    c.setStrokeColor(colors.HexColor('#E2E8F0'))
    c.setLineWidth(1)
    c.line(margin_x, curr_y, margin_x + content_w, curr_y)
    curr_y -= 14

    # --- PUNTI DELLA STORIA (CARDS) ---
    cards = [c_item for c_item in project_data.get('cards', []) if c_item.get('includeInPrint', True) is not False]
    last_section_title = None

    for card_idx, card in enumerate(cards):
        section_title = card.get('sectionTitle')
        step_label = card.get('stepLabel') or f"Passo {card_idx + 1}"
        tokens = card.get('tokens', [])

        # Calcola numero di righe per i token
        num_tokens = len(tokens)
        num_rows = max(1, (num_tokens + cards_per_row - 1) // cards_per_row)
        
        # Altezza necessaria per questo punto della storia
        header_h = 24.0
        section_h = 26.0 if (section_title and section_title != last_section_title) else 0.0
        total_card_h = section_h + header_h + (num_rows * row_h) + 16.0

        # REGOLA IMPAGINAZIONE: Se non entra per intero, salta a pagina successiva
        if (curr_y - total_card_h) < margin_y:
            curr_y = start_new_page()

        # Banner sezione/fase se presente
        if section_title and section_title != last_section_title:
            last_section_title = section_title
            c.saveState()
            c.setFont("Helvetica-Bold", 10)
            c.setFillColor(colors.HexColor('#1E3A8A'))
            c.circle(margin_x + 5, curr_y - 8, 3, fill=1, stroke=0)
            c.drawString(margin_x + 14, curr_y - 12, section_title.upper())
            c.setStrokeColor(colors.HexColor('#DBEAFE'))
            c.setLineWidth(1)
            c.line(margin_x, curr_y - 18, margin_x + content_w, curr_y - 18)
            c.restoreState()
            curr_y -= 26

        # Riquadro contenitore del passo
        box_y = curr_y - header_h - (num_rows * row_h) - 10.0
        box_h = header_h + (num_rows * row_h) + 10.0

        c.saveState()
        c.setFillColor(colors.HexColor('#FFFFFF'))
        c.setStrokeColor(colors.HexColor('#CBD5E1'))
        c.setLineWidth(1)
        c.roundRect(margin_x, box_y, content_w, box_h, 6, fill=1, stroke=1)

        # Intestazione del Passo (Badge circolare con numero + Testo passo)
        c.setFillColor(colors.HexColor('#2563EB'))
        c.circle(margin_x + 14, curr_y - 12, 8, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 8)
        num_str = str(card_idx + 1)
        c.drawCentredString(margin_x + 14, curr_y - 15, num_str)

        c.setFillColor(colors.HexColor('#0F172A'))
        c.setFont("Helvetica-Bold", 9)
        c.drawString(margin_x + 28, curr_y - 15, step_label.upper())

        # Disegna le tessere CAA del punto
        tokens_start_y = curr_y - header_h - 4.0

        for t_idx, raw_token in enumerate(tokens):
            r_idx = t_idx // cards_per_row
            col_idx = t_idx % cards_per_row

            tx = margin_x + 8.0 + (col_idx * (card_w + card_gap))
            ty = tokens_start_y - (r_idx * row_h) - card_h

            token_obj = raw_token if isinstance(raw_token, dict) else {'displayWord': str(raw_token)}
            word_str = str(token_obj.get('displayWord', '')).upper()
            cat = token_obj.get('category', 'misc')
            img_url = token_obj.get('imageUrl')

            # Rettangolo tessera con bordo Fitzgerald Key
            border_color = FITZGERALD_COLORS.get(cat, FITZGERALD_COLORS['misc'])
            c.saveState()
            c.setFillColor(colors.white)
            c.setStrokeColor(border_color)
            c.setLineWidth(2.2)
            c.roundRect(tx, ty, card_w, card_h, 6, fill=1, stroke=1)

            # Etichetta testo in alto (alta leggibilità formato figurina)
            c.setFillColor(colors.HexColor('#0F172A'))
            font_size = 9.5 if len(word_str) <= 8 else (8.0 if len(word_str) <= 12 else 6.8)
            c.setFont("Helvetica-Bold", font_size)
            c.drawCentredString(tx + (card_w / 2.0), ty + card_h - 15, word_str)

            # Immagine simbolo grande (dimensione figurina ~3.5 cm x 3.5 cm)
            img_reader = get_token_image(token_obj, max_dim=240)
            if img_reader:
                px = tx + ((card_w - pic_size) / 2.0)
                py = ty + 10.0
                try:
                    c.drawImage(img_reader, px, py, width=pic_size, height=pic_size, mask='auto')
                except Exception as draw_err:
                    print(f"Errore disegno immagine per {word_str}: {draw_err}")
            else:
                # Placeholder pulito se immagine assente
                c.setFillColor(colors.HexColor('#F8FAFC'))
                c.setStrokeColor(colors.HexColor('#CBD5E1'))
                c.setLineWidth(1.0)
                c.roundRect(tx + 12, ty + 12, card_w - 24, card_h - 38, 4, fill=1, stroke=1)
                c.setFillColor(colors.HexColor('#94A3B8'))
                c.setFont("Helvetica-Bold", 11)
                c.drawCentredString(tx + (card_w / 2.0), ty + (card_h / 2.0) - 10, word_str[:3])

            c.restoreState()

        c.restoreState()
        curr_y = box_y - 12.0

    # --- SEZIONE MORALE (Se presente) ---
    moral = project_data.get('moral')
    if moral:
        moral_title = moral.get('title', 'La Morale e l\'Insegnamento Chiave').upper()
        moral_tokens = moral.get('tokens', [])
        m_num_tokens = len(moral_tokens)
        
        # Disposizione tessere: 5 per riga se ci sono molti token (>8), altrimenti 4
        m_cards_per_row = 5 if m_num_tokens > 8 else 4
        m_num_rows = max(1, (m_num_tokens + m_cards_per_row - 1) // m_cards_per_row)
        
        m_card_gap = 8.0 if m_cards_per_row == 5 else card_gap
        box_inner_w = content_w - 16.0
        m_card_w = (box_inner_w - ((m_cards_per_row - 1) * m_card_gap)) / float(m_cards_per_row) if m_cards_per_row == 5 else card_w
        m_card_h = 132.0 if m_cards_per_row == 5 else card_h
        m_pic_size = 86.0 if m_cards_per_row == 5 else pic_size
        m_row_h = m_card_h + 10.0 if m_cards_per_row == 5 else row_h

        m_header_h = 24.0
        m_total_h = m_header_h + (m_num_rows * m_row_h) + 12.0

        if (curr_y - m_total_h) < margin_y:
            curr_y = start_new_page()

        m_box_y = curr_y - m_total_h
        c.saveState()
        c.setFillColor(colors.HexColor('#FFFBEB'))
        c.setStrokeColor(colors.HexColor('#FCD34D'))
        c.setLineWidth(1.5)
        c.roundRect(margin_x, m_box_y, content_w, m_total_h, 6, fill=1, stroke=1)

        # Intestazione Morale essenziale (nessun testo superfluo)
        c.setFillColor(colors.HexColor('#78350F'))
        c.setFont("Helvetica-Bold", 9)
        c.drawString(margin_x + 12, curr_y - 15, f"💡 {moral_title}")

        m_tokens_start_y = curr_y - m_header_h - 4.0

        for mt_idx, raw_mtoken in enumerate(moral_tokens):
            r_idx = mt_idx // m_cards_per_row
            col_idx = mt_idx % m_cards_per_row

            tx = margin_x + 8.0 + (col_idx * (m_card_w + m_card_gap))
            ty = m_tokens_start_y - (r_idx * m_row_h) - m_card_h

            mtoken_obj = raw_mtoken if isinstance(raw_mtoken, dict) else {'displayWord': str(raw_mtoken)}
            mword_str = str(mtoken_obj.get('displayWord', '')).upper()
            mcat = mtoken_obj.get('category', 'misc')

            border_color = FITZGERALD_COLORS.get(mcat, FITZGERALD_COLORS['misc'])
            c.saveState()
            c.setFillColor(colors.white)
            c.setStrokeColor(border_color)
            c.setLineWidth(2.2)
            c.roundRect(tx, ty, m_card_w, m_card_h, 6, fill=1, stroke=1)

            c.setFillColor(colors.HexColor('#0F172A'))
            font_size = 9.0 if len(mword_str) <= 8 else (7.8 if len(mword_str) <= 12 else 6.5)
            c.setFont("Helvetica-Bold", font_size)
            c.drawCentredString(tx + (m_card_w / 2.0), ty + m_card_h - 14, mword_str)

            mimg_reader = get_token_image(mtoken_obj, max_dim=240)
            if mimg_reader:
                px = tx + ((m_card_w - m_pic_size) / 2.0)
                py = ty + 8.0
                try:
                    c.drawImage(mimg_reader, px, py, width=m_pic_size, height=m_pic_size, mask='auto')
                except Exception:
                    pass
            c.restoreState()

        c.restoreState()
        curr_y = m_box_y - 12.0

    # Chiusura ultima pagina
    draw_page_footer(c, current_page, page_w, margin_y)
    c.save()
    print(f"PDF generato con successo: {output_path} (Pagine: {current_page})")
    return output_path
