"""Gera o PDF dos achados da etapa 2: práticas de Engenharia de Software Contínua
(ESC) × fatores de QVT.

Uso:
    python scripts/docs/achados-esc-pdf.py [--dados docs/esc/triagem-busca1.json]
        [--efeitos docs/esc/efeitos-texto-busca1.json] [--out SAIDA.pdf]

Dois insumos: a triagem dos abstracts da busca 1 (metadados, vereditos, polaridade
dos fatores) e os efeitos prática → fator extraídos do TEXTO COMPLETO com a skill
analise-esc-fatores (citações conferidas por script contra o texto do PDF). A
matriz, os achados e as fichas vêm do texto completo. Requer reportlab e as
fontes Calibri do Windows.
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
ap.add_argument("--efeitos", default=str(REPO / "docs" / "esc" / "efeitos-texto-busca1.json"))
ap.add_argument("--out", default=str(REPO / "docs" / "achados-esc-etapa2.pdf"))
args = ap.parse_args()
D = json.loads(Path(args.dados).read_text(encoding="utf-8"))
E = json.loads(Path(args.efeitos).read_text(encoding="utf-8"))

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
    if nome in NOME_NEUTRO:
        pol = pol[:-1] + ", nome neutro*)"
    return f'{x(nome)}<font color="#616e7c">{pol}</font>'


# Fatores cujo nome descreve uma dimensão (não o caso ruim) mas que só têm
# polaridade negativa na etapa 1. Pendência da tarefa 1.3 (nomes dos fatores).
NOME_NEUTRO = {
    "Desenho do trabalho": "a descrição é neutra (variedade, autonomia, retorno), mas na etapa 1 só aparece o caso "
                           "ruim (4 artigos, todos negativos). Nos elos desta etapa, “aumenta” quer dizer trabalho "
                           "<b>mais bem desenhado</b> — o que atenua o fator negativo, ao contrário do que a "
                           "polaridade sugere.",
    "Interação com clientes": "o nome é neutro, mas a descrição e a polaridade da etapa 1 (8 negativos) tratam do "
                              "desgaste com o cliente. Nos elos desta etapa o efeito se refere a esse desgaste: "
                              "“reduz” quer dizer menos retrabalho e espera pelo cliente.",
}


META = {a["key"]: a for a in D["artigos"]}  # metadados e veredito da triagem dos abstracts
arts = D["artigos"]
aprov = [a for a in arts if a["veredito"] == "aprovado"]
talvez = [a for a in arts if a["veredito"] == "talvez"]
reprov = [a for a in arts if a["veredito"] == "reprovado"]
elos_abs = sum(len(a.get("elos", [])) for a in aprov + talvez)

# texto completo
LIDOS = {a["key"]: a for a in E["artigos"]}
SEM_PDF = {s["key"]: s["motivo"] for s in E.get("semPdf", [])}
efeitos = [(META[i["key"]], e) for i in E["items"] for e in i["efeitos"]]
com_efeito = [META[k] for k in dict.fromkeys(i["key"] for i in E["items"])]
sem_efeito = [META[k] for k, a in LIDOS.items() if a["veredito"] == "aprovado" and not a["efeitos"]]
reprov_texto = [META[k] for k, a in LIDOS.items() if a["veredito"] != "aprovado"]
por_pratica = defaultdict(list)
for a, e in efeitos:
    por_pratica[e["pratica"]].append((a, e))
EVID = {"empírica direta": "D", "empírica indireta": "I", "inferida": "F"}


def alvo(e):
    return e["fator"] if e.get("fator") is not None else "desfecho: " + (e.get("desfecho") or "")


# ---------------------------------------------------------------- documento
def on_page(canv, doc):
    canv.saveState()
    canv.setFont("Cal", 8.5)
    canv.setFillColor(MUTED)
    if doc.page > 1:
        canv.drawString(2 * cm, 1.3 * cm, "ESC × fatores de QVT — achados da etapa 2 (texto completo, busca 1)")
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


def cite_link(a):
    return f'<link href="#{anc("a-", a["key"])}" color="#1f2933"><b>{x(short_cite(a))}</b></link>'


def linha(flows):
    bt = Table([[flows]], colWidths=[W])
    bt.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 4),
                            ("BOTTOMPADDING", (0, 0), (-1, -1), 6), ("LINEBELOW", (0, 0), (-1, -1), 0.4, RULE)]))
    return bt


# capa
story += [Spacer(1, 2.5 * cm),
          P("Práticas de Engenharia de Software Contínua × fatores de QVT", S["title"]), Spacer(1, 8),
          P("Achados da etapa 2: como CI, CD, DevOps, <i>on-call</i> e práticas afins aumentam ou reduzem os "
            "fatores de qualidade de vida no trabalho de quem produz software, segundo o texto completo dos artigos",
            S["subtitle"]), Spacer(1, 1 * cm)]
stats = [[P(str(len(aprov) + len(talvez)), S["big"]), P(str(len(LIDOS)), S["big"]),
          P(str(len(com_efeito)), S["big"]), P(str(len(efeitos)), S["big"])],
         [P("candidatos da busca 1 (aprovados e “talvez” no abstract)", S["meta"]),
          P("lidos no texto completo", S["meta"]), P("com elo prática → fator", S["meta"]),
          P("elos prática → fator, todos com citação conferida", S["meta"])]]
t = Table(stats, colWidths=[W / 4] * 4)
t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
story += [t, Spacer(1, 0.8 * cm)]
story.append(box(P(
    "<b>De onde vêm os elos.</b> Cada elo foi extraído do <b>texto completo</b> do artigo com as regras da skill "
    "<i>analise-esc-fatores</i>: só conta o que sai dos dados do próprio estudo; recomendação e trabalho citado "
    "não contam. Toda citação foi conferida por script contra o texto do PDF. "
    f"<b>O que falta:</b> {len(SEM_PDF)} candidatos ficaram sem PDF (seção 5), a busca 2 (790 registros) ainda "
    "não foi triada e os artigos ainda não estão no app.", S["body"]), bg=WARN, line=colors.HexColor("#c9a227")))
story.append(Spacer(1, 10))
for s in [
    "<b>Pergunta.</b> Como a adoção de práticas de Engenharia de Software Contínua (ESC) aumenta ou reduz "
    "cada fator de QVT levantado na etapa 1? O que se registra é só o <b>primeiro elo</b>: o que a prática faz "
    "com a presença do fator. Se isso faz bem ou mal vem da polaridade do fator na etapa 1, mostrada entre "
    "parênteses ao lado do nome: <i>fator −</i> prejudica o bem-estar e <i>fator +</i> favorece.",
    f"<b>Como ler os efeitos.</b> {EFEITO['aumenta']} e {EFEITO['reduz']} descrevem a presença do fator, não o "
    "bem-estar. Reduzir <i>Interrupções no trabalho</i> (fator −) é bom; aumentar <i>Relações no trabalho</i> "
    "(fator +) também. <b>Evidência:</b> D = empírica direta (os dados ligam prática e fator: fala de "
    "participante, antes/depois, modelo); I = empírica indireta (co-ocorrência, interpretação dos autores); "
    "F = inferida (conclusão da discussão, sem dado que ligue os dois).",
    f"<b>Base.</b> Busca no Scopus (CAPES) em {D['meta']['data']}; triagem dos abstracts e leitura do texto "
    f"completo em {E['geradoEm']}; catálogo de 64 fatores congelado em 24/09/2026. Protocolo em "
    "docs/busca-esc-qvt.md; dados em docs/esc/.",
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

# 2. buscas e triagem
story.append(P("2. Buscas, triagem e leitura", S["h1"]))
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
               "nenhuma prática de ESC no resumo e entram por <i>snowballing</i>.", S["body"]))
story.append(Spacer(1, 10))
story.append(P("Triagem dos abstracts da busca 1", S["h2"]))
motivos = Counter(a.get("motivo", "?") for a in reprov)
rows = [[C("Veredito", True), C("Registros", True)], [C("Aprovado"), C(str(len(aprov)))],
        [C("Talvez (precisa do texto completo)"), C(str(len(talvez)))]]
for m, n in motivos.most_common():
    rows.append([C(f"Reprovado — {x(m)}"), C(str(n))])
story.append(table(rows, [W - 3 * cm, 3 * cm]))
story.append(Spacer(1, 10))
story.append(P("Leitura do texto completo dos 32 candidatos", S["h2"]))
story.append(P(f"Os abstracts afirmavam {elos_abs} elos; o texto completo sustenta {len(efeitos)}, em "
               f"{len(com_efeito)} artigos. Vários elos do abstract caíram (o efeito estava só no resumo, ou vinha "
               "de trabalho citado) e muitos novos apareceram nas falas, tabelas e comparações antes/depois.",
               S["body"]))
story.append(Spacer(1, 6))
rows = [[C("Resultado", True), C("Artigos", True), C("Quais", True)],
        [C("Influencia fatores: aprovado com elo"), C(str(len(com_efeito))),
         C(", ".join(cite_link(a) for a in sorted(com_efeito, key=short_cite)))],
        [C("Aprovado, mas sem elo no texto"), C(str(len(sem_efeito))),
         C(", ".join(cite_link(a) for a in sem_efeito))],
        [C("Reprovado na leitura"), C(str(len(reprov_texto))),
         C(", ".join(cite_link(a) for a in reprov_texto))],
        [C("Sem PDF"), C(str(len(SEM_PDF))), C(", ".join(cite_link(META[k]) for k in SEM_PDF))]]
story.append(table(rows, [5 * cm, 1.6 * cm, W - 6.6 * cm]))

# 3. matriz prática × fator
story.append(PageBreak())
story.append(P("3. Os elos: prática × fator", S["h1"]))
story.append(P("Cada linha liga uma prática de ESC a um fator do catálogo (ou a um fator emergente, ou direto a um "
               "desfecho). ↑ aumenta, ↓ reduz, ↕ ambivalente; o número é a quantidade de artigos. A última "
               "coluna dá os artigos e, entre colchetes, a força da evidência (D, I, F).", S["meta"]))
pares = defaultdict(list)
for a, e in efeitos:
    pares[(e["pratica"], alvo(e))].append((a, e))
rows = [[C("Prática", True), C("Fator", True), C("↑", True), C("↓", True), C("↕", True), C("Artigos", True)]]
for (pr, al), lst in sorted(pares.items(), key=lambda kv: (kv[0][0], -len(kv[1]), kv[0][1])):
    cnt = Counter(e["efeito"] for _, e in lst)
    rows.append([C(x(pr)), C(fator_txt(lst[0][1])), C(str(cnt["aumenta"] or "")), C(str(cnt["reduz"] or "")),
                 C(str(cnt["ambivalente"] or "")),
                 C("; ".join(f'{cite_link(a)} [{EVID.get(e["evidencia"], "?")}]' for a, e in lst))])
story.append(table(rows, [3.6 * cm, 4.6 * cm, 0.7 * cm, 0.7 * cm, 0.7 * cm, W - 10.3 * cm]))
story.append(Spacer(1, 6))
for nome, nota in NOME_NEUTRO.items():
    story.append(P(f"* <b>{x(nome)}</b>: {nota}", S["meta"]))
story.append(Spacer(1, 10))
story.append(P("Por fator", S["h2"]))
story.append(P("A mesma informação vista do lado dos fatores: quais práticas mexem em cada um.", S["meta"]))
por_fator = defaultdict(list)
for a, e in efeitos:
    por_fator[alvo(e)].append((a, e))
rows = [[C("Fator", True), C("Práticas que mexem nele", True)]]
for al, lst in sorted(por_fator.items(), key=lambda kv: (-len(kv[1]), kv[0])):
    sim = {"aumenta": "↑", "reduz": "↓", "ambivalente": "↕"}
    pr = Counter(f'{e["pratica"]} {sim[e["efeito"]]}' for _, e in lst)
    rows.append([C(fator_txt(lst[0][1])), C("; ".join(f"{x(k)}" + (f" ×{n}" if n > 1 else "") for k, n in pr.items()))])
story.append(table(rows, [6.2 * cm, W - 6.2 * cm]))

# 4. achados por prática
story.append(PageBreak())
story.append(P("4. Achados por prática", S["h1"]))
story.append(P("Cada elo com o mecanismo e as condições segundo o artigo e a citação do texto completo. O nome do "
               "artigo leva à ficha dele (seção 5).", S["meta"]))
for pr in sorted(por_pratica, key=lambda k: (-len(por_pratica[k]), k)):
    lst = por_pratica[pr]
    head = [Spacer(1, 8), P(x(pr), S["h2"]),
            P(f"{len(lst)} elo{'s' if len(lst) != 1 else ''} em {len({a['key'] for a, _ in lst})} artigo(s)",
              S["meta"])]
    blocks = []
    for a, e in sorted(lst, key=lambda ae: (ae[1].get("fator") or "~", ae[0]["year"])):
        blocks.append(linha([
            P(f'{EFEITO.get(e["efeito"], x(e["efeito"]))} {fator_txt(e)}', S["ev"]),
            P(f'{cite_link(a)} — {x(a["title"])}', S["refsub"]),
            P(f'<b>Mecanismo:</b> {x(fim(e.get("mecanismo")))}'
              + (f' <b>Condições:</b> {x(fim(e["condicoes"]))}' if e.get("condicoes") else "")
              + f' <b>Evidência:</b> {x(e.get("evidencia"))}.', S["ev"]),
            P(f'<font color="#616e7c">{x(e.get("trecho"))}</font>', S["ev"])]))
    story.append(KeepTogether(head + blocks[:1]))
    story += blocks[1:]

# 5. fichas
story.append(PageBreak())
story.append(P("5. Fichas dos artigos", S["h1"]))
story.append(P("O que cada artigo estuda e conclui segundo o texto completo, e os elos que sustenta.", S["meta"]))
for grupo, lista in [("Com elo prática → fator", com_efeito), ("Aprovados sem elo no texto", sem_efeito),
                     ("Reprovados na leitura do texto completo", reprov_texto)]:
    story.append(P(f"{grupo} ({len(lista)})", S["h2"]))
    for a in sorted(lista, key=lambda a: (-int(a["year"] or 0), short_cite(a))):
        lido = LIDOS[a["key"]]
        fl = [P(f'<a name="{anc("a-", a["key"])}"/><b>{x(short_cite(a))}</b> — {x(a["title"])}', S["ref"]),
              P(x(a.get("venue")), S["refsub"])]
        if lido.get("motivo"):
            fl.append(P(f'<b>Motivo:</b> {x(fim(lido["motivo"]))}', S["ev"]))
        fl.append(P(x(lido.get("resumo")), S["ev"]))
        el = [e for b, e in efeitos if b["key"] == a["key"]]
        if el:
            fl.append(P("; ".join(f'{x(e["pratica"])} {EFEITO.get(e["efeito"], "")} {fator_txt(e)}' for e in el),
                        S["ev"]))
        story.append(linha(fl))
story.append(P(f"Sem PDF ({len(SEM_PDF)})", S["h2"]))
for k, m in SEM_PDF.items():
    a = META[k]
    story.append(linha([P(f'<a name="{anc("a-", k)}"/><b>{x(short_cite(a))}</b> — {x(a["title"])}', S["ref"]),
                        P(f'{x(fim(m))} No abstract: {x(a.get("resumo"))}', S["ev"])]))

# 6. snowballing
sec = [a for a in reprov if a.get("motivo", "").startswith("secund") and a.get("resumo")]
story.append(PageBreak())
story.append(P("6. Para o <i>snowballing</i>", S["h1"]))
story.append(P("Primários citados pelos artigos lidos que ligam ESC a pessoas, estudos secundários da busca 1, as "
               "sementes que nenhuma string alcança e os trabalhos citados pelo corpus da etapa 1.", S["body"]))
story.append(Spacer(1, 6))
rows = [[C("Fonte", True), C("Indicado por / por quê", True)]]
for k, a in LIDOS.items():
    for s in a.get("snowballing") or []:
        rows.append([C(x(s.split(" — ")[0].split(" (")[0][:90])), C(f'{cite_link(META[k])}: {x(s)}')])
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
story.append(table(rows, [5.2 * cm, W - 5.2 * cm]))

# 7. referências
story.append(PageBreak())
story.append(P("7. Referências (candidatos da busca 1)", S["h1"]))
for a in sorted(aprov + talvez, key=lambda a: ((surnames(a.get("author", "")) or [""])[0].lower(), a["year"])):
    story.append(P(full_ref(a), S["bib"]))

doc.build(story)
print("ok", args.out, "| lidos", len(LIDOS), "com elo", len(com_efeito), "elos", len(efeitos),
      "sem PDF", len(SEM_PDF))
