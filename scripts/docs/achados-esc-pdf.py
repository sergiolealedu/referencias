"""Gera o PDF dos achados da etapa 2: práticas de Engenharia de Software Contínua
(ESC) × fatores de QVT.

Uso:
    python scripts/docs/achados-esc-pdf.py [--dados docs/esc/triagem-busca1.json] [--out SAIDA.pdf]

Os dados vêm da triagem dos abstracts da busca 1 (ver docs/busca-esc-qvt.md).
O que cada artigo "diz" é o que o ABSTRACT afirma: a extração pelo texto
completo (skill analise-esc-fatores) vem depois. Requer reportlab e as fontes
Calibri do Windows.
"""
import argparse
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
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
ap.add_argument("--dados", default=str(REPO / "docs" / "esc" / "triagem-busca1.json"))
ap.add_argument("--out", default=str(REPO / "docs" / "achados-esc-etapa2.pdf"))
args = ap.parse_args()
D = json.loads(Path(args.dados).read_text(encoding="utf-8"))

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
TINT = colors.HexColor("#f3f5f8")
WARN = colors.HexColor("#fdf6e3")
# Cor única para o efeito: "aumenta" não é ruim por si (aumentar um fator
# positivo é bom). O sentido para o bem-estar sai da polaridade do fator.
UP = DOWN = AMB = "#1f4e79"

S = {
    "title": ParagraphStyle("title", fontName="Cal-B", fontSize=23, leading=28, textColor=INK),
    "subtitle": ParagraphStyle("subtitle", fontName="Cal", fontSize=13, leading=18, textColor=MUTED),
    "h1": ParagraphStyle("h1", fontName="Cal-B", fontSize=18, leading=22, textColor=ACCENT, spaceAfter=6),
    "h2": ParagraphStyle("h2", fontName="Cal-B", fontSize=13.5, leading=17, textColor=INK, spaceBefore=6),
    "meta": ParagraphStyle("meta", fontName="Cal", fontSize=9.5, leading=12, textColor=MUTED, spaceAfter=4),
    "body": ParagraphStyle("body", fontName="Cal", fontSize=10.5, leading=14, textColor=INK),
    "ref": ParagraphStyle("ref", fontName="Cal-B", fontSize=10, leading=13, textColor=INK),
    "refsub": ParagraphStyle("refsub", fontName="Cal-I", fontSize=9, leading=11.5, textColor=MUTED),
    "ev": ParagraphStyle("ev", fontName="Cal", fontSize=9.5, leading=12.5, textColor=INK),
    "cell": ParagraphStyle("cell", fontName="Cal", fontSize=9, leading=11, textColor=INK),
    "cellb": ParagraphStyle("cellb", fontName="Cal-B", fontSize=9, leading=11, textColor=INK),
    "bib": ParagraphStyle("bib", fontName="Cal", fontSize=9.3, leading=12, textColor=INK, leftIndent=12,
                          firstLineIndent=-12, spaceAfter=4),
    "big": ParagraphStyle("big", fontName="Cal-B", fontSize=18, leading=22, textColor=ACCENT),
}

LATEX = {r"\AA": "Å", r"\aa": "å", r"\o": "ø", r"\O": "Ø", r"\ss": "ß"}
ACC = {"'": "\u0301", "`": "\u0300", "^": "\u0302", '"': "\u0308", "~": "\u0303", "c": "\u0327"}


def delatex(s):
    s = re.sub(r"\\([`'^\"~c])\{?([A-Za-z])\}?", lambda m: unicodedata.normalize("NFC", m[2] + ACC[m[1]]), s)
    for k, v in LATEX.items():
        s = re.sub(re.escape(k) + r"(?![A-Za-z])", v, s)
    return s.replace("{", "").replace("}", "")


def x(s):
    return escape(delatex(s or ""))


def surnames(author):
    names = [a.strip() for a in re.split(r"\s+and\s+", author or "") if a.strip()]
    return [n.split(",")[0].strip() if "," in n else n.split()[-1] for n in names]


def short_cite(a):
    sn = surnames(a.get("author", ""))
    y = a.get("year", "s.d.")
    if not sn:
        return f"(sem autor, {y})"
    return f"{sn[0]} e {sn[1]} ({y})" if len(sn) == 2 else (f"{sn[0]} ({y})" if len(sn) == 1 else f"{sn[0]} et al. ({y})")


def full_ref(a):
    au = "; ".join(p.strip() for p in re.split(r"\s+and\s+", a.get("author", "")) if p.strip())
    parts = [f"{x(au)} ({x(a.get('year'))}).", f"{x(a.get('title'))}."]
    if a.get("venue"):
        parts.append(f"<i>{x(a['venue'])}</i>.")
    if a.get("doi"):
        parts.append(f'DOI: <link href="https://doi.org/{x(a["doi"])}" color="#1f4e79">{x(a["doi"])}</link>')
    return " ".join(parts)


def fim(s):
    """Fecha a frase com ponto, para campos que vêm um depois do outro."""
    s = (s or "").strip()
    return s if not s or s[-1] in ".!?…" else s + "."


def anc(prefix, key):
    return prefix + re.sub(r"[^A-Za-z0-9]", "", key)


EFEITO = {
    "aumenta": f'<font color="{UP}"><b>↑ aumenta</b></font>',
    "reduz": f'<font color="{DOWN}"><b>↓ reduz</b></font>',
    "ambivalente": f'<font color="{AMB}"><b>↕ ambivalente</b></font>',
}
FATORES = D["fatores"]  # nome -> {categoria, pos, neg}


def fator_txt(e):
    if e.get("fator") is None:
        return f'<i>desfecho:</i> {x(e.get("desfecho"))}'
    nome = e["fator"]
    if e.get("fatorEmergente"):
        return f'{x(nome)} <font color="#616e7c">(fator emergente, {x(e.get("categoria"))})</font>'
    f = FATORES.get(nome)
    pol = ""
    if f:
        pol = " (fator +)" if f["pos"] > f["neg"] else " (fator −)" if f["neg"] > f["pos"] else " (fator ±)"
    return f'{x(nome)}<font color="#616e7c">{pol}</font>'


arts = D["artigos"]
aprov = [a for a in arts if a["veredito"] == "aprovado"]
talvez = [a for a in arts if a["veredito"] == "talvez"]
reprov = [a for a in arts if a["veredito"] == "reprovado"]
elos = [(a, e) for a in aprov + talvez for e in a.get("elos", [])]
por_pratica = defaultdict(list)
for a, e in elos:
    por_pratica[e["pratica"]].append((a, e))
citados = {a["key"] for a in aprov + talvez}


# ---------------------------------------------------------------- documento
def on_page(canv, doc):
    canv.saveState()
    canv.setFont("Cal", 8.5)
    canv.setFillColor(MUTED)
    if doc.page > 1:
        canv.drawString(2 * cm, 1.3 * cm, "ESC × fatores de QVT — achados da etapa 2 (preliminares)")
        canv.drawRightString(A4[0] - 2 * cm, 1.3 * cm, str(doc.page))
    canv.restoreState()


doc = BaseDocTemplate(args.out, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm,
                      bottomMargin=2 * cm, title="ESC × fatores de QVT — achados da etapa 2",
                      author="Sérgio Leal Fonseca", subject="Etapa 2: práticas de ESC × fatores de QVT")
doc.addPageTemplates([PageTemplate(id="p", frames=[Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height,
                                                          leftPadding=0, rightPadding=0, topPadding=0,
                                                          bottomPadding=0)], onPage=on_page)])
P = Paragraph
W = doc.width
story = []


def box(flow, bg=TINT, line=ACCENT):
    t = Table([[flow]], colWidths=[W])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), bg), ("LEFTPADDING", (0, 0), (-1, -1), 8),
                           ("RIGHTPADDING", (0, 0), (-1, -1), 8), ("TOPPADDING", (0, 0), (-1, -1), 6),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 7), ("LINEBEFORE", (0, 0), (0, -1), 2.5, line)]))
    return t


def table(rows, widths, header=True):
    t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
    st = [("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE), ("TOPPADDING", (0, 0), (-1, -1), 3),
          ("BOTTOMPADDING", (0, 0), (-1, -1), 3), ("VALIGN", (0, 0), (-1, -1), "TOP")]
    if header:
        st.append(("BACKGROUND", (0, 0), (-1, 0), TINT))
    t.setStyle(TableStyle(st))
    return t


def C(s, b=False):
    return P(s, S["cellb" if b else "cell"])


# capa
story += [Spacer(1, 2.5 * cm),
          P("Práticas de Engenharia de Software Contínua × fatores de QVT", S["title"]), Spacer(1, 8),
          P("Achados da etapa 2: o que a literatura diz sobre como CI, CD, DevOps, <i>on-call</i> e práticas "
            "afins aumentam ou reduzem os fatores de qualidade de vida no trabalho de quem produz software",
            S["subtitle"]), Spacer(1, 1 * cm)]
n_elos = len(elos)
stats = [[P(f"{D['meta']['busca1']} + {D['meta']['busca2']}", S["big"]), P(str(len(aprov)), S["big"]),
          P(str(len(talvez)), S["big"]), P(str(n_elos), S["big"])],
         [P("registros nas buscas 1 e 2", S["meta"]), P("aprovados na busca 1", S["meta"]),
          P("“talvez” na busca 1", S["meta"]), P("elos prática → fator nos abstracts", S["meta"])]]
t = Table(stats, colWidths=[W / 4] * 4)
t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
story += [t, Spacer(1, 0.8 * cm)]
story.append(box(P(
    "<b>Atenção: achados preliminares.</b> O que cada artigo “diz” neste documento é o que o <b>abstract</b> "
    "afirma. A ligação prática → fator vai ser extraída do <b>texto completo</b>, com a skill "
    "<i>analise-esc-fatores</i>, depois que os aprovados tiverem PDF no app. Só um elo deste documento já vem "
    "do texto completo: o do piloto (seção 1). A busca 2 (estudos empíricos, 790 registros) ainda não foi "
    "triada.", S["body"]), bg=WARN, line=colors.HexColor("#c9a227")))
story.append(Spacer(1, 10))
for s in [
    "<b>Pergunta.</b> Como a adoção de práticas de Engenharia de Software Contínua (ESC) aumenta ou reduz "
    "cada fator de QVT levantado na etapa 1? O que se registra é só o <b>primeiro elo</b>: o que a prática faz "
    "com a presença do fator. Se isso faz bem ou mal vem da polaridade do fator na etapa 1, mostrada entre "
    "parênteses ao lado do nome: <i>fator −</i> prejudica o bem-estar e <i>fator +</i> favorece.",
    f"<b>Como ler os efeitos.</b> {EFEITO['aumenta']} e {EFEITO['reduz']} descrevem a presença do fator, não o "
    "bem-estar. Para o efeito líquido, combine com a polaridade do fator: reduzir <i>Interrupções no "
    "trabalho</i> (fator −) é bom; aumentar <i>Reconhecimento no trabalho</i> (fator +) também.",
    f"<b>Base.</b> Busca no Scopus (CAPES) em {D['meta']['data']}; triagem dos abstracts com os critérios "
    "da skill <i>analise-esc-fatores</i>; catálogo de 64 fatores congelado em 24/09/2026. Protocolo completo "
    "em docs/busca-esc-qvt.md.",
]:
    story += [P(s, S["body"]), Spacer(1, 6)]
story.append(PageBreak())

# 1. corpus da etapa 1 e piloto
story.append(P("1. O que o corpus da etapa 1 já dizia", S["h1"]))
story.append(P("Varredura do texto completo dos 65 artigos com fatores: 37 não mencionam nenhuma prática de "
               "ESC, 22 só de passagem (referência, cargo do participante, nome de ferramenta) e 6 tocam no elo, "
               "sempre como evidência secundária.", S["body"]))
story.append(Spacer(1, 6))
rows = [[C("Artigo", True), C("O que diz sobre prática → fator", True)]]
for a, d in [
    ("Trinkenreich et al. (2023)", "<i>Postmortem</i> sem culpados e times multifuncionais levam à cultura "
     "generativa (Westrum/DORA), que reduz o <i>burnout</i> — mas a ligação prática → cultura é citada, não medida"),
    ("Trinkenreich et al. (2025)", "Recomenda <i>postmortems</i> sem culpados para reforçar a segurança "
     "psicológica e o pertencimento"),
    ("Cerqueira et al. (2024)", "Líder empático equilibra as escalas de <i>on-call</i>; <i>postmortem</i> honesto "
     "reduz a culpa — em recomendações apresentadas como além da análise"),
    ("Jafarzadeh et al. (2025)", "Ciclos de entrega contínua mantêm intensidade alta e sem pausa, caminho para o "
     "<i>burnout</i>"),
    ("Kumar et al. (2025)", "“Automatizar tudo para a entrega contínua” libera tempo para o trabalho que o "
     "desenvolvedor valoriza"),
    ("Benlian et al. (2025)", "Em projeto grande, atraso pequeno se propaga pelo <i>pipeline</i> de entrega "
     "contínua e gera estresse e sensação de fracasso"),
]:
    rows.append([C(a, True), C(d)])
story.append(table(rows, [4.2 * cm, W - 4.2 * cm]))
story.append(Spacer(1, 10))
story.append(P("Piloto da extração pelo texto completo", S["h2"]))
story.append(P("Três desses artigos foram lidos inteiros com as regras da skill. Só um elo se sustenta: "
               "recomendação apresentada além dos dados, ou com a ligação vinda de trabalho citado, não conta.",
               S["body"]))
story.append(Spacer(1, 6))
story.append(box(P(
    f"<b>Benlian et al. (2025)</b> — Entrega contínua {EFEITO['aumenta']} <i>desfecho:</i> estresse e "
    "sensação de fracasso. <b>Mecanismo:</b> em projeto grande, o <i>pipeline</i> de entrega contínua interliga "
    "o trabalho de muitos, e um atraso pequeno se propaga e é vivido como falha em escala maior. "
    "<b>Condições:</b> projetos ágeis de larga escala; em projeto pequeno o participante I30 não relata o "
    "efeito. <b>Evidência:</b> empírica direta.<br/><font color='#616e7c'>Supplementary Qualitative Insights "
    "(I15): “it creates extra stress because even minor delays have ripple effects on our continuous delivery "
    "pipeline and feel like a failure on a much larger scale”.</font>", S["ev"])))
story.append(Spacer(1, 4))
story.append(P("Cerqueira et al. (2024) e Trinkenreich et al. (2023): nenhum elo. Westrum (2004) e o relatório "
               "DORA, citados por Trinkenreich, viram candidatos ao corpus.", S["meta"]))
story.append(PageBreak())

# 2. buscas
story.append(P("2. As buscas", S["h1"]))
rows = [[C("Busca", True), C("O que pega", True), C("Registros", True)],
        [C("1 — ESC × QVT", True), C("Práticas de ESC + termos de bem-estar <b>e dos fatores</b> (carga, pressão de "
                                       "prazo, interrupção, carga cognitiva, <i>toil</i>, horas de trabalho, "
                                       "segurança psicológica…) + quem produz software"), C(str(D['meta']['busca1']))],
        [C("2 — estudos empíricos de ESC", True), C("Estudos de adoção e desafios de CI/CD/DevOps com entrevista, "
                                                    "<i>survey</i> ou estudo de caso, menos o que já cai na busca 1"),
         C(str(D['meta']['busca2']))]]
story.append(table(rows, [4.2 * cm, W - 6.2 * cm, 2 * cm]))
story.append(Spacer(1, 8))
story.append(P("Filtros: artigo, conferência, revisão ou capítulo; inglês ou português; sem Medicina e Enfermagem. "
               "Calibração com 12 artigos-semente: a união das buscas recupera 8. Os 4 que ficam fora não citam "
               "nenhuma prática de ESC no resumo e entram por <i>snowballing</i>. Só 5 registros da busca 1 já "
               "estavam no banco da etapa 1.", S["body"]))
story.append(Spacer(1, 10))
story.append(P("Triagem da busca 1", S["h2"]))
motivos = Counter(a.get("motivo", "?") for a in reprov)
rows = [[C("Veredito", True), C("Registros", True)], [C("Aprovado"), C(str(len(aprov)))],
        [C("Talvez (precisa do texto completo)"), C(str(len(talvez)))]]
for m, n in motivos.most_common():
    rows.append([C(f"Reprovado — {x(m)}"), C(str(n))])
story.append(table(rows, [W - 3 * cm, 3 * cm]))

# 3. visão prática × fator
story.append(PageBreak())
story.append(P("3. Visão geral: prática × fator", S["h1"]))
story.append(P("Cada linha é um par prática × fator afirmado em pelo menos um abstract. ↑ aumenta, ↓ reduz, "
               "↕ ambivalente; o número é a quantidade de artigos.", S["meta"]))
pares = defaultdict(lambda: Counter())
for a, e in elos:
    alvo = e["fator"] if e.get("fator") is not None else "desfecho: " + (e.get("desfecho") or "")
    pares[(e["pratica"], alvo, json.dumps(e.get("fator") is None))][e["efeito"]] += 1
rows = [[C("Prática", True), C("Fator", True), C("↑", True), C("↓", True), C("↕", True)]]
for (pr, alvo, _), cnt in sorted(pares.items(), key=lambda kv: (kv[0][0], -sum(kv[1].values()))):
    fake = {"fator": None, "desfecho": alvo[10:]} if alvo.startswith("desfecho: ") else {"fator": alvo}
    if alvo in FATORES or alvo.startswith("desfecho: "):
        ft = fator_txt(fake)
    else:
        ft = f'{x(alvo)} <font color="#616e7c">(emergente)</font>'
    rows.append([C(x(pr)), C(ft), C(str(cnt["aumenta"] or "")), C(str(cnt["reduz"] or "")),
                 C(str(cnt["ambivalente"] or ""))])
story.append(table(rows, [4.6 * cm, W - 4.6 * cm - 3 * 1.1 * cm, 1.1 * cm, 1.1 * cm, 1.1 * cm]))

# 4. achados por prática
story.append(PageBreak())
story.append(P("4. Achados por prática", S["h1"]))
story.append(P("O que cada abstract afirma, agrupado pela prática. O nome do artigo leva à ficha dele (seção 5).",
               S["meta"]))
for pr in sorted(por_pratica, key=lambda k: (-len(por_pratica[k]), k)):
    lst = por_pratica[pr]
    head = [Spacer(1, 8), P(x(pr), S["h2"]),
            P(f"{len(lst)} elo{'s' if len(lst) != 1 else ''} em {len({a['key'] for a, _ in lst})} artigo(s)",
              S["meta"])]
    blocks = []
    for a, e in sorted(lst, key=lambda ae: (ae[1].get("fator") or "~", ae[0]["year"])):
        inner = [P(f'{EFEITO.get(e["efeito"], x(e["efeito"]))} {fator_txt(e)}', S["ev"]),
                 P(f'<link href="#{anc("a-", a["key"])}" color="#1f2933"><b>{x(short_cite(a))}</b></link> — '
                   f'{x(a["title"])}', S["refsub"]),
                 P(f'<b>Mecanismo:</b> {x(fim(e.get("mecanismo")))}'
                   + (f' <b>Condições:</b> {x(fim(e["condicoes"]))}' if e.get("condicoes") else ""), S["ev"]),
                 P(f'<font color="#616e7c">Abstract: “{x(e.get("trecho"))}”</font>', S["ev"])]
        bt = Table([[inner]], colWidths=[W])
        bt.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 4),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE)]))
        blocks.append(bt)
    story.append(KeepTogether(head + blocks[:1]))
    story += blocks[1:]

# 5. fichas
story.append(PageBreak())
story.append(P("5. Artigos aprovados e “talvez”", S["h1"]))
story.append(P("Uma ficha por artigo: o que ele estuda e conclui segundo o abstract, e os elos que afirma. "
               "“Talvez” são artigos que tratam de pessoas e de ESC, mas cujo abstract não diz se há efeito: "
               "precisam do texto completo.", S["meta"]))
for grupo, lista in [("Aprovados", aprov), ("Talvez", talvez)]:
    story.append(P(f"{grupo} ({len(lista)})", S["h2"]))
    for a in sorted(lista, key=lambda a: (-int(a["year"] or 0), short_cite(a))):
        el = a.get("elos", [])
        resumo = [P(f'<a name="{anc("a-", a["key"])}"/><b>{x(short_cite(a))}</b> — {x(a["title"])}', S["ref"]),
                  P(x(a.get("venue")), S["refsub"]), P(x(a.get("resumo")), S["ev"])]
        if el:
            resumo.append(P("; ".join(f'{x(e["pratica"])} {EFEITO.get(e["efeito"], "")} {fator_txt(e)}' for e in el),
                            S["ev"]))
        bt = Table([[resumo]], colWidths=[W])
        bt.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 4),
                                ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE)]))
        story.append(bt)

# 6. snowballing
sec = [a for a in reprov if a.get("motivo", "").startswith("secund") and a.get("resumo")]
story.append(PageBreak())
story.append(P("6. Para o <i>snowballing</i>", S["h1"]))
story.append(P("Estudos secundários não entram na análise, mas os primários que eles resenham são candidatos ao "
               "corpus. Somam-se a eles as quatro sementes que nenhuma string alcança e os trabalhos citados pelo "
               "corpus da etapa 1.", S["body"]))
story.append(Spacer(1, 6))
rows = [[C("Fonte", True), C("Por quê", True)]]
for a in sec:
    rows.append([C(f'<b>{x(short_cite(a))}</b><br/>{x(a["title"])}'), C(x(a.get("resumo")))])
for f, why in [
    ("Westrum (2004), <i>A typology of organisational cultures</i>", "Base da ligação práticas → cultura generativa "
     "citada por Trinkenreich et al. (2023)"),
    ("Relatórios DORA / <i>Accelerate</i>", "Dor do <i>deploy</i>, retrabalho e <i>burnout</i> associados às "
     "capacidades de entrega contínua"),
    ("Hilton et al. (2017); Fagerholm et al. (2017); Greiler et al. (2022)", "Sementes sem prática de ESC no "
     "resumo; nenhuma string as recupera"),
]:
    rows.append([C(f), C(why)])
story.append(table(rows, [6 * cm, W - 6 * cm]))

# 7. referências
story.append(PageBreak())
story.append(P("7. Referências (aprovados e “talvez”)", S["h1"]))
for a in sorted(aprov + talvez, key=lambda a: ((surnames(a.get("author", "")) or [""])[0].lower(), a["year"])):
    story.append(P(full_ref(a), S["bib"]))

doc.build(story)
print("ok", args.out, "| aprovados", len(aprov), "talvez", len(talvez), "elos", n_elos)
