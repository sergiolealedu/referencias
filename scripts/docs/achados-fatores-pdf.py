"""Gera o PDF dos achados da etapa 1: catálogo de fatores de QVT, com a descrição
de cada fator e o que cada artigo ligado a ele diz (polaridade, termo e citação).

Uso:
    python scripts/docs/achados-fatores-pdf.py [--db CAMINHO/referencias.db] [--out SAIDA.pdf]

Padrão: lê o backup congelado da etapa 2 (somente leitura, sem alterar o arquivo,
cujo SHA-256 está em CONGELADO.md) e grava docs/achados-fatores-qvt.pdf.
Requer reportlab e as fontes Calibri do Windows.
"""
import argparse
import json
import re
import sqlite3
from collections import defaultdict
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate, Frame, KeepTogether, PageBreak, PageTemplate, Paragraph,
    Spacer, Table, TableStyle,
)

REPO = Path(__file__).resolve().parents[2]
ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
ap.add_argument("--db", default=r"G:\Meu Drive\doutorado\app\backup\server-20260924-162133\referencias.db")
ap.add_argument("--out", default=str(REPO / "docs" / "achados-fatores-qvt.pdf"))
args = ap.parse_args()
DB, OUT = Path(args.db), args.out
BASE = DB.parent.name

F = "C:/Windows/Fonts/"
pdfmetrics.registerFont(TTFont("Cal", F + "calibri.ttf"))
pdfmetrics.registerFont(TTFont("Cal-B", F + "calibrib.ttf"))
pdfmetrics.registerFont(TTFont("Cal-I", F + "calibrii.ttf"))
pdfmetrics.registerFont(TTFont("Cal-BI", F + "calibriz.ttf"))
pdfmetrics.registerFontFamily("Cal", normal="Cal", bold="Cal-B", italic="Cal-I", boldItalic="Cal-BI")

INK = colors.HexColor("#1f2933")
MUTED = colors.HexColor("#616e7c")
RULE = colors.HexColor("#d9dee4")
ACCENT = colors.HexColor("#1f4e79")
POS = colors.HexColor("#1b7a4a")
NEG = colors.HexColor("#b4342d")
TINT = colors.HexColor("#f3f5f8")

S = {
    "title": ParagraphStyle("title", fontName="Cal-B", fontSize=24, leading=29, textColor=INK),
    "subtitle": ParagraphStyle("subtitle", fontName="Cal", fontSize=13, leading=18, textColor=MUTED),
    "h1": ParagraphStyle("h1", fontName="Cal-B", fontSize=18, leading=22, textColor=ACCENT, spaceAfter=6),
    "h2": ParagraphStyle("h2", fontName="Cal-B", fontSize=14, leading=18, textColor=INK, spaceBefore=4),
    "meta": ParagraphStyle("meta", fontName="Cal", fontSize=9.5, leading=12, textColor=MUTED, spaceAfter=4),
    "body": ParagraphStyle("body", fontName="Cal", fontSize=10.5, leading=14, textColor=INK, alignment=TA_LEFT),
    "desc": ParagraphStyle("desc", fontName="Cal", fontSize=10.5, leading=14, textColor=INK),
    "ref": ParagraphStyle("ref", fontName="Cal-B", fontSize=10, leading=13, textColor=INK),
    "refsub": ParagraphStyle("refsub", fontName="Cal-I", fontSize=9, leading=11.5, textColor=MUTED),
    "ev": ParagraphStyle("ev", fontName="Cal", fontSize=9.5, leading=12.5, textColor=INK),
    "cell": ParagraphStyle("cell", fontName="Cal", fontSize=9.5, leading=11.5, textColor=INK),
    "cellb": ParagraphStyle("cellb", fontName="Cal-B", fontSize=9.5, leading=11.5, textColor=INK),
    "bib": ParagraphStyle("bib", fontName="Cal", fontSize=9.5, leading=12.5, textColor=INK, leftIndent=12,
                          firstLineIndent=-12, spaceAfter=5),
}

CATS = ["Tarefa e carga de trabalho", "Técnico e ferramentas", "Processo de desenvolvimento",
        "Equipe e relações", "Organizacional", "Individual"]


LATEX = {r"\AA": "Å", r"\aa": "å", r"\o": "ø", r"\O": "Ø", r"\ss": "ß"}
ACC = {"'": "\u0301", "`": "\u0300", "^": "\u0302", '"': "\u0308", "~": "\u0303", "c": "\u0327"}


def delatex(s):
    import unicodedata
    s = re.sub(r"\\([`'^\"~c])\{?([A-Za-z])\}?", lambda m: unicodedata.normalize("NFC", m[2] + ACC[m[1]]), s)
    for k, v in LATEX.items():
        s = re.sub(re.escape(k) + r"(?![A-Za-z])", v, s)
    return s.replace("{", "").replace("}", "")


def x(s):
    return escape(delatex(s or ""))


def surnames(author):
    names = [a.strip() for a in re.split(r"\s+and\s+", author or "") if a.strip()]
    return [n.split(",")[0].strip().strip("{}") if "," in n else n.split()[-1].strip("{}") for n in names]


def short_cite(f):
    sn = surnames(f.get("author", ""))
    y = f.get("year", "s.d.")
    if not sn:
        return f"(sem autor, {y})"
    if len(sn) == 1:
        a = sn[0]
    elif len(sn) == 2:
        a = f"{sn[0]} e {sn[1]}"
    else:
        a = f"{sn[0]} et al."
    return f"{a} ({y})"


def full_ref(f):
    authors = re.split(r"\s+and\s+", f.get("author", ""))
    au = "; ".join(a.strip().strip("{}") for a in authors if a.strip())
    venue = f.get("journal") or f.get("booktitle") or f.get("publisher") or ""
    parts = [f"{x(au)} ({x(f.get('year', 's.d.'))}).", f"{x(f.get('title', '').strip('{}'))}."]
    if venue:
        vol = f", v. {x(f['volume'])}" if f.get("volume") else ""
        num = f", n. {x(f['number'])}" if f.get("number") else ""
        parts.append(f"<i>{x(venue)}</i>{vol}{num}.")
    if f.get("doi"):
        d = f["doi"]
        parts.append(f'DOI: <link href="https://doi.org/{x(d)}" color="#1f4e79">{x(d)}</link>')
    return " ".join(parts)


# ---------------------------------------------------------------- dados
con = sqlite3.connect(f"{DB.as_uri()}?mode=ro&immutable=1", uri=True)
factors = {}
for fid, name, cat, desc in con.execute("select id, name, category, description from factors"):
    factors[fid] = {"id": fid, "name": name, "cat": cat, "desc": desc or "", "occ": []}

articles = {}
for key, fj, fl in con.execute(
        "select entry_key, factors_json, fields_json from articles where factors_json != '[]'"):
    f = json.loads(fl)
    articles[key] = {"key": key, "f": f, "factors": []}
    for o in json.loads(fj):
        fac = factors[o["factorId"]]
        fac["occ"].append({"key": key, **o})
        articles[key]["factors"].append(fac["id"])

for fac in factors.values():
    fac["occ"].sort(key=lambda o: (o["polarity"] != "positive", short_cite(articles[o["key"]]["f"]).lower()))
    fac["npos"] = sum(o["polarity"] == "positive" for o in fac["occ"])
    fac["nneg"] = sum(o["polarity"] == "negative" for o in fac["occ"])
    fac["nart"] = len({o["key"] for o in fac["occ"]})

bycat = defaultdict(list)
for fac in factors.values():
    bycat[fac["cat"]].append(fac)
for c in bycat:
    bycat[c].sort(key=lambda f: (-f["nart"], f["name"]))
assert set(bycat) == set(CATS), set(bycat) ^ set(CATS)

n_occ = sum(len(f["occ"]) for f in factors.values())
n_pos = sum(f["npos"] for f in factors.values())


def anchor_f(fid):
    return "f-" + fid[:8]


def anchor_a(key):
    return "a-" + re.sub(r"[^A-Za-z0-9]", "", key)


# ---------------------------------------------------------------- documento
def on_page(canv, doc):
    canv.saveState()
    canv.setFont("Cal", 8.5)
    canv.setFillColor(MUTED)
    if doc.page > 1:
        canv.drawString(2 * cm, 1.3 * cm, "Fatores de QVT de quem produz software — achados da etapa 1")
        canv.drawRightString(A4[0] - 2 * cm, 1.3 * cm, str(doc.page))
    canv.restoreState()


doc = BaseDocTemplate(OUT, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm,
                      bottomMargin=2 * cm, title="Fatores de QVT — achados da etapa 1",
                      author="Sérgio Leal Fonseca", subject=f"Catálogo de fatores (base {BASE})")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="f",
              leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0)
doc.addPageTemplates([PageTemplate(id="p", frames=[frame], onPage=on_page)])

story = []
P = Paragraph

# capa / introdução
story += [Spacer(1, 3 * cm),
          P("Fatores de qualidade de vida no trabalho de quem produz software", S["title"]),
          Spacer(1, 8),
          P("Achados da etapa 1: catálogo de fatores, descrição de cada um e o que cada artigo diz sobre ele",
            S["subtitle"]),
          Spacer(1, 1.2 * cm)]

stats = [[P(f"<b>{len(factors)}</b>", S["h1"]), P(f"<b>{len(articles)}</b>", S["h1"]),
          P(f"<b>{n_occ}</b>", S["h1"]), P(f"<b>{n_pos}</b> / <b>{n_occ - n_pos}</b>", S["h1"])],
         [P("fatores", S["meta"]), P("artigos com fatores", S["meta"]), P("ocorrências", S["meta"]),
          P("positivas / negativas", S["meta"])]]
t = Table(stats, colWidths=[doc.width / 4] * 4)
t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
story += [t, Spacer(1, 1 * cm)]

intro = [
    f"Base: <b>{x(BASE)}</b>. O backup congelado da etapa 2 (server-20260924-162133) é o estado "
    "depois da auditoria das citações (docs/auditoria-fatores-2026-09-24.md): só ficaram artigos "
    "primários elegíveis e com PDF, e os 14 inelegíveis apontados pela auditoria foram retirados.",
    "<b>Como ler.</b> Os fatores estão agrupados nas seis categorias temáticas e, dentro de cada "
    "categoria, ordenados pelo número de artigos. Cada fator traz a descrição do catálogo e, em "
    "seguida, um bloco por artigo: a referência, a polaridade (<font color='#1b7a4a'><b>+ positiva</b></font>: "
    "o fator favorece o bem-estar; <font color='#b4342d'><b>− negativa</b></font>: o fator o prejudica), "
    "o termo que o próprio artigo usa e a evidência, com a localização no texto e a citação verbatim.",
    "O nome do autor em cada bloco leva às referências completas, no fim do documento, e lá cada "
    "referência lista os fatores que sustenta. Os nomes dos fatores no sumário levam à seção do fator.",
]
for i in intro:
    story += [P(i, S["body"]), Spacer(1, 6)]
story.append(PageBreak())

# sumário
story.append(P("Sumário dos fatores", S["h1"]))
story.append(P("Art. = nº de artigos · + / − = ocorrências positivas e negativas", S["meta"]))
for cat in CATS:
    rows = [[P(f"<b>{x(cat)}</b>", S["cellb"]), P("<b>Art.</b>", S["cellb"]), P("<b>+</b>", S["cellb"]),
             P("<b>−</b>", S["cellb"])]]
    for fac in bycat[cat]:
        rows.append([P(f'<link href="#{anchor_f(fac["id"])}" color="#1f4e79">{x(fac["name"])}</link>', S["cell"]),
                     P(str(fac["nart"]), S["cell"]), P(str(fac["npos"] or "–"), S["cell"]),
                     P(str(fac["nneg"] or "–"), S["cell"])])
    t = Table(rows, colWidths=[doc.width - 3 * 1.4 * cm, 1.4 * cm, 1.4 * cm, 1.4 * cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), TINT), ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    story += [Spacer(1, 6), t]

# fatores
for cat in CATS:
    story.append(PageBreak())
    story.append(P(x(cat), S["h1"]))
    nart = len({o["key"] for f in bycat[cat] for o in f["occ"]})
    story.append(P(f"{len(bycat[cat])} fatores · {nart} artigos distintos", S["meta"]))
    for fac in bycat[cat]:
        head = [Spacer(1, 10),
                P(f'<a name="{anchor_f(fac["id"])}"/>{x(fac["name"])}', S["h2"]),
                P(f'{fac["nart"]} artigo{"s" if fac["nart"] != 1 else ""} · '
                  f'<font color="#1b7a4a">{fac["npos"]} positiva{"s" if fac["npos"] != 1 else ""}</font> · '
                  f'<font color="#b4342d">{fac["nneg"]} negativa{"s" if fac["nneg"] != 1 else ""}</font>',
                  S["meta"])]
        d = x(fac["desc"]) if fac["desc"] else "<i>Sem descrição no catálogo (pendência da tarefa 1.3).</i>"
        dt = Table([[P(d, S["desc"])]], colWidths=[doc.width])
        dt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), TINT), ("LEFTPADDING", (0, 0), (-1, -1), 8),
                                ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                                ("LINEBEFORE", (0, 0), (0, -1), 2.5, ACCENT)]))
        blocks = []
        for o in fac["occ"]:
            a = articles[o["key"]]["f"]
            pos = o["polarity"] == "positive"
            mark = '<font color="#1b7a4a"><b>+</b></font>' if pos else '<font color="#b4342d"><b>−</b></font>'
            venue = a.get("journal") or a.get("booktitle") or ""
            inner = [
                P(f'<link href="#{anchor_a(o["key"])}" color="#1f2933">{x(short_cite(a))}</link> — '
                  f'{x(a.get("title", "").strip("{}"))}', S["ref"]),
                P(x(venue) + (f' · termo no artigo: “{x(o["label"])}”' if o.get("label") else ""), S["refsub"]),
                Spacer(1, 2),
                P(x(o["description"]), S["ev"]),
            ]
            bt = Table([[P(mark, ParagraphStyle("m", fontName="Cal-B", fontSize=14, leading=14)), inner]],
                       colWidths=[0.7 * cm, doc.width - 0.7 * cm])
            bt.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0),
                                    ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                                    ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE)]))
            blocks.append(bt)
        story.append(KeepTogether(head + [dt, Spacer(1, 4)] + blocks[:1]))
        story += blocks[1:]

# referências
story.append(PageBreak())
story.append(P("Referências", S["h1"]))
story.append(P(f"{len(articles)} artigos · entre colchetes, os fatores que cada artigo sustenta", S["meta"]))
story.append(Spacer(1, 4))


def ref_sort(a):
    sn = surnames(a["f"].get("author", ""))
    return ((sn[0] if sn else "").lower(), a["f"].get("year", ""))


for art in sorted(articles.values(), key=ref_sort):
    links = []
    for fid in dict.fromkeys(art["factors"]):
        fac = factors[fid]
        links.append(f'<link href="#{anchor_f(fid)}" color="#1f4e79">{x(fac["name"])}</link>')
    story.append(P(f'<a name="{anchor_a(art["key"])}"/>{full_ref(art["f"])} '
                   f'<font color="#616e7c">[{"; ".join(links)}]</font>', S["bib"]))

doc.build(story)
print("ok", OUT)
