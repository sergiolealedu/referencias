#!/usr/bin/env python3
"""Confere se o PDF anexado a cada artigo é realmente o artigo daquele registro.

Para cada artigo com `caminho`, localiza o arquivo dentro do snapshot de backup,
extrai o texto das primeiras páginas e compara com título, ano, sobrenome da
chave e DOI. Pega o caso que o nome do arquivo não pega: PDF com nome certo e
conteúdo de outro artigo.

Requer `pypdf` e um snapshot feito **com** os PDFs (sem -ExcludePdfs).

Uso:
  python scripts/qa/check-pdf-content.py
  python scripts/qa/check-pdf-content.py --snapshot "G:/.../server-20260819-101500"
  python scripts/qa/check-pdf-content.py --limit 40        # amostra rápida
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import (  # noqa: E402
    DEFAULT_BACKUP_ROOT,
    REPO_ROOT,
    ROOT_MAP,
    local_pdf_path,
    norm,
    open_snapshot,
    resolve_snapshot,
)

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    raise SystemExit("pypdf não encontrado. Instale com: pip install pypdf")

# O pypdf avisa sobre xref torto em quase todo PDF de editora; o veredito já
# cobre o que importa, e o ruído esconde o progresso.
logging.getLogger("pypdf").setLevel(logging.ERROR)

# Páginas lidas por PDF: capa + primeira de conteúdo cobrem título e DOI mesmo
# quando a editora põe uma folha de rosto na frente.
PAGINAS = 3
MIN_CHARS_TEXTO = 200
# Acima disso o anexo provavelmente e o volume inteiro, nao o artigo.
PAGINAS_VOLUME = 60

STOPWORDS = {
    "a", "an", "and", "are", "as", "at", "based", "between", "by", "case",
    "com", "cross", "da", "de", "do", "dos", "for", "from", "his", "how",
    "into", "its", "not", "of", "on", "or", "para", "que", "study", "that",
    "the", "their", "there", "this", "through", "to", "toward", "towards",
    "uma", "using", "via", "was", "were", "what", "when", "which", "who",
    "why", "with", "within", "without",
}

DOI_RE = re.compile(r"10\.\d{4,9}/[^\s\"'<>,;)\]]+", re.IGNORECASE)


def significant_words(title: str) -> list[str]:
    return [w for w in norm(title).split() if len(w) >= 4 and w not in STOPWORDS]


# Palavras que aparecem em qualquer artigo científico em inglês. Se nenhuma
# aparece, o texto extraído não é texto — é índice de glifo ou cifra de fonte.
PALAVRAS_ANCORA = (
    "the", "and", "of", "in", "to", "for", "with", "this", "that", "we", "is",
    "are", "was", "on", "by", "from", "as", "an", "de", "da", "que", "para",
)
# Tokens tipo 'g39', 'c110': índice de glifo vazando quando falta o ToUnicode.
GLIFO_RE = re.compile(r"^[a-z]\d{1,4}$")


def looks_garbled(normalized: str) -> tuple[bool, str]:
    """O texto saiu ilegível? Devolve (sim/não, motivo).

    Distingue 'PDF é de outro artigo' de 'PDF é o certo mas não dá para ler'.
    Sem isso, todo PDF com mapa de fontes quebrado viraria falso positivo de
    troca — foi o caso de um artigo cujo texto saiu como cifra de deslocamento
    ('0lohqd 5dghqnrylf' para 'Milena Radenkovic').
    """
    tokens = normalized.split()
    if not tokens:
        return True, "nenhum token extraído"

    glifos = sum(1 for t in tokens if GLIFO_RE.match(t))
    if glifos / len(tokens) > 0.3:
        return True, f"{100 * glifos // len(tokens)}% dos tokens são índices de glifo (ex.: 'g39')"

    ancoras = sum(1 for t in tokens if t in PALAVRAS_ANCORA)
    # Um texto real de artigo passa longe disso: 'the' sozinho costuma dar 5%.
    if len(tokens) >= 60 and ancoras / len(tokens) < 0.01:
        return True, (
            f"nenhuma palavra comum de inglês em {len(tokens)} tokens "
            "(mapa de fontes provavelmente quebrado)"
        )
    return False, ""


def surname_from_key(entry_key: str) -> str:
    """'Aagaard2022' -> 'aagaard'; '2013' -> '' (chave sem autor)."""
    match = re.match(r"^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'\-]{2,})", entry_key)
    return norm(match.group(1)) if match else ""


def normalize_doi(doi: str) -> str:
    return re.sub(r"[).,;]+$", "", doi.strip().lower())


def dois_from_fields(fields: dict) -> set[str]:
    blob = " ".join(
        str(fields.get(k) or "") for k in ("doi", "url", "note", "source")
    )
    return {normalize_doi(d) for d in DOI_RE.findall(blob)}


def extract_text(path: Path) -> tuple[str, int, str]:
    """Devolve (texto, n_paginas, erro)."""
    try:
        reader = PdfReader(str(path))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                return "", 0, "PDF criptografado"
        total = len(reader.pages)
        chunks = []
        for page in reader.pages[:PAGINAS]:
            try:
                chunks.append(page.extract_text() or "")
            except Exception as exc:  # página corrompida não invalida o resto
                chunks.append("")
                del exc
        return "\n".join(chunks), total, ""
    except Exception as exc:
        return "", 0, f"{type(exc).__name__}: {exc}"


def evaluate(article: dict, snapshot: Path) -> dict:
    caminho = article["caminho"]
    result = {
        **{k: article[k] for k in ("grupoId", "grupo", "chave", "titulo", "ano", "categoria")},
        "caminho": caminho,
        "arquivo": Path(caminho.replace("\\", "/")).name,
        "veredito": "",
        "motivo": "",
        "tituloMatch": None,
        "anoNoTexto": None,
        "sobrenomeNoTexto": None,
        "doiRegistro": sorted(article["dois"]),
        "doiNoPdf": [],
        "paginas": 0,
        "tituloNoPdf": "",
    }

    local = local_pdf_path(caminho, snapshot)
    if local is None or not local.is_file():
        result["veredito"] = "ausente"
        result["motivo"] = "arquivo não encontrado no snapshot"
        return result

    text, pages, err = extract_text(local)
    result["paginas"] = pages
    if err:
        result["veredito"] = "ilegivel"
        result["motivo"] = err
        return result

    normalized = norm(text)
    if len(normalized) < MIN_CHARS_TEXTO:
        result["veredito"] = "sem-texto"
        result["motivo"] = (
            f"apenas {len(normalized)} caracteres extraíveis nas {PAGINAS} primeiras "
            "páginas (provável digitalização sem OCR) — não dá para comparar"
        )
        return result

    garbled, por_que = looks_garbled(normalized)
    if garbled:
        result["veredito"] = "texto-ilegivel"
        result["motivo"] = f"{por_que} — o PDF pode estar certo, mas não dá para conferir"
        result["tituloNoPdf"] = " ".join(normalized.split()[:25])
        return result

    words = significant_words(article["titulo"])
    ratio = (
        sum(1 for w in words if w in normalized) / len(words) if words else None
    )
    result["tituloMatch"] = None if ratio is None else round(ratio, 2)
    result["tituloNoPdf"] = " ".join(normalized.split()[:25])

    ano = article["ano"]
    result["anoNoTexto"] = (ano in normalized) if ano.isdigit() else None

    sobrenome = surname_from_key(article["chave"])
    result["sobrenomeNoTexto"] = (sobrenome in normalized) if sobrenome else None

    pdf_dois = {normalize_doi(d) for d in DOI_RE.findall(text)}
    result["doiNoPdf"] = sorted(pdf_dois)[:5]
    doi_match = bool(article["dois"] & pdf_dois)

    if doi_match:
        result["veredito"] = "ok"
        result["motivo"] = "DOI do registro encontrado no PDF"
    elif ratio is None:
        result["veredito"] = "revisar"
        result["motivo"] = "registro sem título utilizável para comparar"
    elif ratio >= 0.6:
        result["veredito"] = "ok"
        result["motivo"] = f"{int(ratio * 100)}% das palavras do título no PDF"
    elif ratio < 0.3 and not result["sobrenomeNoTexto"]:
        result["veredito"] = "suspeito"
        result["motivo"] = (
            f"só {int(ratio * 100)}% das palavras do título, e o sobrenome "
            f"{sobrenome!r} não aparece"
        )
    else:
        result["veredito"] = "revisar"
        result["motivo"] = f"{int(ratio * 100)}% das palavras do título no PDF"

    if article["dois"] and pdf_dois and not doi_match and result["veredito"] != "ok":
        result["motivo"] += "; DOI do PDF difere do registro"

    # Anais/livro inteiro no lugar do capítulo: o texto do artigo está lá dentro,
    # mas o anexo não é o artigo.
    if pages > PAGINAS_VOLUME:
        result["motivo"] += f"; PDF tem {pages} páginas (parece o volume inteiro)"

    return result


VEREDITO_ORDEM = ("suspeito", "ausente", "ilegivel", "texto-ilegivel", "revisar",
                  "sem-texto", "ok")


def write_report(out_dir: Path, snapshot: Path, results: list[dict]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    counts = {v: sum(1 for r in results if r["veredito"] == v) for v in VEREDITO_ORDEM}

    lines = [
        "# QA dos PDFs anexados\n",
        f"- Snapshot: `{snapshot}`",
        f"- Gerado em: {datetime.now().astimezone().isoformat(timespec='seconds')}",
        f"- PDFs conferidos: **{len(results)}**\n",
        "| Veredito | PDFs | O que significa |",
        "|---|---:|---|",
        f"| suspeito | {counts['suspeito']} | título e sobrenome não aparecem: "
        "provável PDF de outro artigo |",
        f"| ausente | {counts['ausente']} | `caminho` preenchido mas o arquivo não "
        "veio no snapshot |",
        f"| ilegivel | {counts['ilegivel']} | PDF corrompido ou criptografado |",
        f"| revisar | {counts['revisar']} | casamento parcial: olhar caso a caso |",
        f"| texto-ilegivel | {counts['texto-ilegivel']} | mapa de fontes quebrado: o PDF "
        "pode estar certo, mas não dá para conferir |",
        f"| sem-texto | {counts['sem-texto']} | digitalização sem OCR, sem texto "
        "para comparar |",
        f"| ok | {counts['ok']} | DOI ou título confirmam o registro |",
    ]

    for veredito in VEREDITO_ORDEM:
        rows = [r for r in results if r["veredito"] == veredito]
        if not rows or veredito == "ok":
            continue
        rows.sort(key=lambda r: (r["tituloMatch"] if r["tituloMatch"] is not None else 9))
        lines += [
            f"\n## {veredito} ({len(rows)})\n",
            "| Grupo | Chave | Título do registro | Início do PDF | Match | Pág. | Motivo |",
            "|---|---|---|---|---:|---:|---|",
        ]
        for r in rows:
            titulo = (r["titulo"] or "—")[:55].replace("|", "/")
            inicio = (r["tituloNoPdf"] or "—")[:60].replace("|", "/")
            match = "—" if r["tituloMatch"] is None else f"{r['tituloMatch']:.2f}"
            motivo = r["motivo"].replace("|", "/")[:80]
            lines.append(
                f"| {r['grupo']} | `{r['chave']}` | {titulo} | {inicio} | {match} "
                f"| {r['paginas'] or '—'} | {motivo} |"
            )

    (out_dir / "pdf-content-report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    (out_dir / "pdf-content.json").write_text(
        json.dumps(
            {
                "snapshot": str(snapshot),
                "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "counts": counts,
                "results": results,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, default=None)
    parser.add_argument("--backup-root", type=Path, default=DEFAULT_BACKUP_ROOT)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--limit", type=int, default=0, help="confere só os N primeiros")
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    snapshot = resolve_snapshot(args.snapshot, args.backup_root)
    out_dir = args.out or (REPO_ROOT / "data" / "qa" / snapshot.name)

    if not any((snapshot / sub).is_dir() for _, sub in ROOT_MAP):
        raise SystemExit(
            f"Snapshot sem pasta de PDFs ({', '.join(s for _, s in ROOT_MAP)}): {snapshot}\n"
            "Rode o backup sem -ExcludePdfs."
        )

    print(f"[pdf-qa] snapshot: {snapshot}")
    with tempfile.TemporaryDirectory(prefix="referencias-pdfqa-") as tmp:
        conn = open_snapshot(snapshot, Path(tmp))
        group_titles = {
            row["id"]: row["title"] for row in conn.execute("SELECT id, title FROM groups")
        }
        articles = []
        for row in conn.execute(
            "SELECT group_id, entry_key, fields_json, caminho, status, usado, descartado, "
            "factors_json FROM articles WHERE TRIM(caminho) != ''"
        ):
            fields = json.loads(row["fields_json"] or "{}")
            articles.append({
                "grupoId": row["group_id"],
                "grupo": group_titles.get(row["group_id"], "?"),
                "chave": row["entry_key"],
                "titulo": (fields.get("title") or "").strip(),
                "ano": (fields.get("year") or "").strip(),
                "categoria": "comFatores" if json.loads(row["factors_json"] or "[]")
                             else ("repetidos" if row["status"] == "duplicate" else "—"),
                "caminho": row["caminho"],
                "dois": dois_from_fields(fields),
            })
        conn.close()

    if args.limit:
        articles = articles[:args.limit]
    print(f"[pdf-qa] artigos com PDF: {len(articles)}")

    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        for i, res in enumerate(pool.map(lambda a: evaluate(a, snapshot), articles), 1):
            results.append(res)
            if i % 50 == 0 or i == len(articles):
                print(f"[pdf-qa] {i}/{len(articles)}", flush=True)

    write_report(out_dir, snapshot, results)
    counts = {v: sum(1 for r in results if r["veredito"] == v) for v in VEREDITO_ORDEM}
    print("[pdf-qa] " + " · ".join(f"{v}={counts[v]}" for v in VEREDITO_ORDEM))
    print(f"[pdf-qa] saída: {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
