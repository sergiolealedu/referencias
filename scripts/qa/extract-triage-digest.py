#!/usr/bin/env python3
"""Monta o material de leitura para reavaliar a triagem dos artigos rejeitados.

Para cada artigo da fila de `notas-pendentes.json`, junta num digest compacto o
que decide as três perguntas da triagem (é engenharia de software? fala de
desenvolvimento? é QVT?): título, veículo, abstract e — quando há PDF — os
trechos do texto em volta dos termos que respondem a essas perguntas.

O digest existe para caber: o texto integral de centenas de PDFs não caberia numa
leitura só, e 90% dele (referências, apêndices, tabelas) não decide triagem.

Uso:
  python scripts/qa/extract-triage-digest.py
  python scripts/qa/extract-triage-digest.py --pending data/qa/<stamp>/notas-pendentes.json
"""

from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import (  # noqa: E402
    DEFAULT_BACKUP_ROOT,
    REPO_ROOT,
    classify_veiculo,
    local_pdf_path,
    open_snapshot,
    resolve_snapshot,
)

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    raise SystemExit("pypdf não encontrado. Instale com: pip install pypdf")

logging.getLogger("pypdf").setLevel(logging.ERROR)

# Páginas lidas: título, abstract, introdução e método cabem nas primeiras; o que
# vem depois é resultado, referências e apêndice, que não decidem triagem.
PAGINAS_PDF = 12
ABSTRACT_MAX = 1400
JANELA = 300
MAX_TRECHOS = 8
DIGEST_MAX = 2600

# Os termos estão agrupados pela pergunta que ajudam a responder, e o grupo vai
# no digest junto com o trecho — sem isso a leitura não sabe por que aquele
# pedaço foi recortado.
TERMOS = {
    "sujeitos": [
        "participants", "respondents", "interviewees", "we recruited",
        "we surveyed", "sample of", "participantes", "entrevistados",
    ],
    "quem-produz-software": [
        "software engineer", "software developer", "software practitioner",
        "programmer", "development team", "desenvolvedores", "engenheiros de software",
    ],
    "bem-estar": [
        "well-being", "wellbeing", "burnout", "job satisfaction", "work-life",
        "mental health", "turnover intention", "stress", "quality of life",
        "bem-estar", "satisfação no trabalho", "qualidade de vida",
    ],
    "fora-de-escopo": [
        "we do not", "we did not measure", "not directly assess", "out of scope",
        "beyond the scope", "future work will",
    ],
    "tipo-de-trabalho": [
        "call for papers", "editorial", "workshop proposal", "this workshop",
        "systematic literature review", "mapping study", "position paper",
        "we propose a tool", "registered report",
    ],
}


def clean(text: str) -> str:
    """Junta hifenização de fim de linha e colapsa espaço — o texto de PDF vem
    quebrado em coluna, e sem isso os termos não casam."""
    joined = re.sub(r"-\s*\n\s*", "", text)
    return re.sub(r"\s+", " ", joined).strip()


def pdf_text(path: Path) -> tuple[str, int, str]:
    try:
        reader = PdfReader(str(path))
        if reader.is_encrypted:
            try:
                reader.decrypt("")
            except Exception:
                return "", 0, "PDF criptografado"
        total = len(reader.pages)
        chunks = []
        for page in reader.pages[:PAGINAS_PDF]:
            try:
                chunks.append(page.extract_text() or "")
            except Exception:
                chunks.append("")
        return clean("\n".join(chunks)), total, ""
    except Exception as exc:
        return "", 0, f"{type(exc).__name__}: {exc}"


def excerpts(text: str) -> list[dict]:
    """Recorta janelas em volta dos termos, sem repetir região já coberta."""
    low = text.lower()
    achados: list[dict] = []
    cobertos: list[tuple[int, int]] = []

    for grupo, termos in TERMOS.items():
        for termo in termos:
            pos = low.find(termo)
            if pos < 0:
                continue
            ini = max(0, pos - JANELA // 2)
            fim = min(len(text), pos + len(termo) + JANELA // 2)
            if any(ini < c_fim and fim > c_ini for c_ini, c_fim in cobertos):
                continue
            cobertos.append((ini, fim))
            achados.append({
                "pergunta": grupo,
                "termo": termo,
                "trecho": text[ini:fim].strip(),
            })
            break  # um trecho por grupo já indica onde olhar
    return achados[:MAX_TRECHOS]


def load_selection(path: Path, check_id: str | None) -> list[tuple[int, str]]:
    """Extrai só os pares (grupoId, chave) do arquivo — os dados vêm do snapshot."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    if check_id:
        findings = [f for f in payload.get("findings", []) if f["check"] == check_id]
        if not findings:
            disponiveis = sorted(f["check"] for f in payload.get("findings", []))
            raise SystemExit(
                f"Check {check_id!r} não está em {path.name}.\n"
                f"Disponíveis: {', '.join(disponiveis)}"
            )
        linhas = findings[0]["rows"]
    else:
        linhas = payload["itens"] if isinstance(payload, dict) else payload

    vistos: set[tuple[int, str]] = set()
    selecao: list[tuple[int, str]] = []
    for linha in linhas:
        par = (linha["grupoId"], linha["chave"])
        if par not in vistos:  # um check pode listar o mesmo artigo duas vezes
            vistos.add(par)
            selecao.append(par)
    return selecao


def load_articles(snapshot: Path, selecao: list[tuple[int, str]]) -> list[dict]:
    """Puxa os campos do próprio banco, preservando a ordem da seleção.

    Ler do snapshot em vez de confiar nos campos do JSON deixa o digest funcionar
    com qualquer arquivo de seleção — inclusive os findings, que não carregam
    abstract nem entry_type.
    """
    with tempfile.TemporaryDirectory(prefix="referencias-digest-") as tmp:
        conn = open_snapshot(snapshot, Path(tmp))
        try:
            por_chave: dict[tuple[int, str], dict] = {}
            for row in conn.execute(
                "SELECT group_id, entry_key, entry_type, fields_json, caminho, "
                "motivo_descarte, descartado, pdf_nao_encontrado FROM articles"
            ):
                fields = json.loads(row["fields_json"] or "{}")
                por_chave[(row["group_id"], row["entry_key"])] = {
                    "grupoId": row["group_id"],
                    "chave": row["entry_key"],
                    "entryType": row["entry_type"],
                    "titulo": (fields.get("title") or "").strip(),
                    "ano": (fields.get("year") or "").strip(),
                    "journal": (fields.get("journal") or "").strip(),
                    "abstract": (fields.get("abstract") or "").strip(),
                    "caminho": row["caminho"] or "",
                    "motivoDescarte": row["motivo_descarte"],
                    "descartado": bool(row["descartado"]),
                    "pdfNaoEncontrado": bool(row["pdf_nao_encontrado"]),
                }
        finally:
            conn.close()

    faltando = [p for p in selecao if p not in por_chave]
    if faltando:
        print(f"[digest] AVISO: {len(faltando)} artigo(s) da seleção não estão no "
              f"snapshot (ex.: {faltando[:3]})")
    return [por_chave[p] for p in selecao if p in por_chave]


def build_digest(item: dict, snapshot: Path) -> dict:
    titulo = (item.get("titulo") or "").strip()
    journal = (item.get("journal") or "").strip()
    abstract = (item.get("abstract") or "").strip()

    digest = {
        "grupoId": item["grupoId"],
        "chave": item["chave"],
        "titulo": titulo,
        "ano": item.get("ano") or "",
        "journal": journal,
        "entryType": item.get("entryType") or "",
        "veiculoClasse": classify_veiculo(journal, "", item.get("entryType") or ""),
        "motivoDescarte": item.get("motivoDescarte"),
        "descartado": item.get("descartado"),
        "pdfNaoEncontrado": item.get("pdfNaoEncontrado"),
        "abstract": abstract[:ABSTRACT_MAX],
        "abstractTruncado": len(abstract) > ABSTRACT_MAX,
        "pdfPaginas": 0,
        "pdfErro": "",
        "trechosPdf": [],
        "material": "nenhum",
    }

    caminho = (item.get("caminho") or "").strip()
    if caminho:
        local = local_pdf_path(caminho, snapshot)
        if local is not None and local.is_file():
            text, pages, err = pdf_text(local)
            digest["pdfPaginas"] = pages
            digest["pdfErro"] = err
            if text:
                digest["trechosPdf"] = excerpts(text)
        else:
            digest["pdfErro"] = "arquivo não encontrado no snapshot"

    if digest["trechosPdf"]:
        digest["material"] = "pdf"
    elif abstract:
        digest["material"] = "abstract"

    # Corta o digest para caber na leitura em lote, tirando dos trechos do PDF
    # (o abstract é mais denso por caractere).
    while (
        len(json.dumps(digest, ensure_ascii=False)) > DIGEST_MAX
        and digest["trechosPdf"]
    ):
        digest["trechosPdf"].pop()
    return digest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, default=None)
    parser.add_argument("--backup-root", type=Path, default=DEFAULT_BACKUP_ROOT)
    parser.add_argument("--pending", type=Path, default=None,
                        help="arquivo de seleção (padrão: notas-pendentes.json)")
    parser.add_argument("--from-check", default=None, metavar="CHECK_ID",
                        help="usa as linhas de um check do qa-findings.json como "
                             "seleção (ex.: nao-eng-sw-a-revisar)")
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--name", default="triagem-digest",
                        help="nome-base da saída (padrão: triagem-digest)")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    snapshot = resolve_snapshot(args.snapshot, args.backup_root)
    out_dir = args.out or (REPO_ROOT / "data" / "qa" / snapshot.name)

    if args.from_check:
        selecao_path = args.pending or (out_dir / "qa-findings.json")
    else:
        selecao_path = args.pending or (out_dir / "notas-pendentes.json")

    if not selecao_path.is_file():
        raise SystemExit(
            f"Seleção não encontrada: {selecao_path}\n"
            "Rode antes: python scripts/qa/audit-snapshot.py"
        )

    selecao = load_selection(selecao_path, args.from_check)
    if args.limit:
        selecao = selecao[:args.limit]

    print(f"[digest] snapshot: {snapshot}")
    print(f"[digest] seleção: {selecao_path.name}"
          + (f" · check {args.from_check}" if args.from_check else ""))
    itens = load_articles(snapshot, selecao)
    print(f"[digest] artigos: {len(itens)}")

    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{args.name}.jsonl"
    contagem = {"pdf": 0, "abstract": 0, "nenhum": 0}

    with out_path.open("w", encoding="utf-8") as fh:
        for i, item in enumerate(itens, 1):
            digest = build_digest(item, snapshot)
            contagem[digest["material"]] += 1
            fh.write(json.dumps(digest, ensure_ascii=False) + "\n")
            if i % 25 == 0 or i == len(itens):
                print(f"[digest] {i}/{len(itens)}", flush=True)

    resumo = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "snapshot": str(snapshot),
        "total": len(itens),
        "porMaterial": contagem,
    }
    (out_dir / f"{args.name}-resumo.json").write_text(
        json.dumps(resumo, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("[digest] material: " + " · ".join(f"{k}={v}" for k, v in contagem.items()))
    print(f"[digest] saída: {out_path}")
    if contagem["nenhum"]:
        print(
            f"[digest] {contagem['nenhum']} artigo(s) sem PDF e sem abstract — "
            "não há material para veredito de triagem."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
