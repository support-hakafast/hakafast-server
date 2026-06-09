# -*- coding: utf-8 -*-
"""Generate HAKAFAST quote template with concrete ILS prices (Pro example)."""
import os
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "docx", "HAKAFAST-Quote-Template.he.docx")

LICENSE_PRO = 42_000
INSTALL = 8_500
TRAINING = 4_500
SUPPORT_PRO = 7_560
VAT = 0.18


def ils(n):
    return f"₪{n:,}"


def set_rtl(paragraph, align_right=True):
    pPr = paragraph._element.get_or_add_pPr()
    bidi = OxmlElement("w:bidi")
    pPr.append(bidi)
    if align_right:
        paragraph.alignment = WD_ALIGN_PARAGRAPH.RIGHT


def heading(doc, text, level=2):
    p = doc.add_heading(text, level=level)
    set_rtl(p)
    for run in p.runs:
        run.font.name = "Arial"
        run.font.color.rgb = RGBColor(0x15, 0x65, 0xC0)


def para(doc, text, size=11, bold=False):
    p = doc.add_paragraph()
    set_rtl(p)
    r = p.add_run(text)
    r.font.name = "Arial"
    r.font.size = Pt(size)
    r.bold = bold


def table(doc, headers, rows, size=10):
    t = doc.add_table(rows=1 + len(rows), cols=len(headers))
    t.style = "Table Grid"
    for i, h in enumerate(headers):
        t.rows[0].cells[i].text = h
        for p in t.rows[0].cells[i].paragraphs:
            set_rtl(p)
            for run in p.runs:
                run.bold = True
                run.font.name = "Arial"
                run.font.size = Pt(size)
    for ri, row in enumerate(rows):
        for ci, val in enumerate(row):
            t.rows[ri + 1].cells[ci].text = str(val)
            for p in t.rows[ri + 1].cells[ci].paragraphs:
                set_rtl(p)
                for run in p.runs:
                    run.font.name = "Arial"
                    run.font.size = Pt(size)


sub = LICENSE_PRO + INSTALL + TRAINING
vat_amt = int(round(sub * VAT))
total = sub + vat_amt

os.makedirs(os.path.dirname(OUT), exist_ok=True)
doc = Document()
sec = doc.sections[0]
sec.left_margin = Cm(2)
sec.right_margin = Cm(2)

p = doc.add_paragraph()
set_rtl(p)
r = p.add_run("HAKAFAST — הצעת מחיר")
r.bold = True
r.font.size = Pt(22)
r.font.name = "Arial"
r.font.color.rgb = RGBColor(0x0D, 0x47, 0xA1)

para(doc, "רישיון לכל החיים · מסלול קארטינג · support.hakafast@gmail.com", size=10)
para(doc, "תאריך: ___ / ___ / 2026          מס' הצעה: HF-2026-___")
para(doc, "לכבוד: _________________________")
para(doc, "איש קשר: _________________________")

heading(doc, "1. מטרה")
para(doc, "רישיון HAKAFAST לכל החיים — Site אחד, התקנה, TranX, הדרכה. תפעול מקומי offline.")

heading(doc, "2. היקף")
para(doc, "מיקום: _______________   קaarטים: ___   חבילה: Pro (16–25)")

heading(doc, "3. פירוט מחיר (לפני מע\"מ)")
table(doc, ["#", "פריט", "מחיר"], [
    ["1", "רישיון Pro לכל החיים", ils(LICENSE_PRO)],
    ["2", "התקנה + TranX 160", ils(INSTALL)],
    ["3", "הדרכה — יום אחד", ils(TRAINING)],
    ["4", f"תמיכה שנתית (אופציונלי)", f"{ils(SUPPORT_PRO)} / לא נדרש"],
    ["", 'סה"כ לפני מע"מ', ils(sub)],
    ["", 'מע"מ 18%', ils(vat_amt)],
    ["", 'סה"כ כולל מע"מ', ils(total)],
])

heading(doc, "4. מחירון חבילות (לפני מע\"מ)")
table(doc, ["חבילה", "קaarטים", "רישיון"], [
    ["Standard", "עד 15", "₪28,000"],
    ["Pro", "16–25", "₪42,000"],
    ["Enterprise", "26+", "₪58,000"],
])

heading(doc, "5. תשלום")
para(doc, "50% בחתימה · 50% ב-Go-Live · חשבונית מס.")

heading(doc, "6. תוקף")
para(doc, "30 יום.")

para(doc, "חתימת המסלול: _________________   HAKAFAST: _________________", size=10)

doc.save(OUT)
print(f"Saved: {OUT}")
