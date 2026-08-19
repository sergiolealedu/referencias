"""Helpers compartilhados pelos scripts de QA do snapshot."""

from __future__ import annotations

import re
import shutil
import sqlite3
import unicodedata
from pathlib import Path

DEFAULT_BACKUP_ROOT = Path(r"G:\Meu Drive\doutorado\app\backup")
REPO_ROOT = Path(__file__).resolve().parents[2]

MOTIVOS = ("nao_eng_sw", "nao_dev", "nao_qvt")
# Espelha ARTICLE_STATUSES em frontend/src/types/referencias.ts — é a lista que a
# FiltersBar e o formulário oferecem. 'gray' anota o veículo cinza (cinza de 1º
# nível segue elegível), 'manual_review' marca o que precisa de segunda leitura, e
# 'not_eligible' o que não é artigo usável: anais, editorial, veículo reprovado.
STATUS_CONHECIDOS = (
    "exists", "duplicate", "not_found", "gray", "manual_review", "not_eligible",
)
STATUS_EM_REVISAO = "manual_review"
STATUS_NAO_ELEGIVEL = "not_eligible"
CATEGORIA_POR_MOTIVO = {
    "nao_eng_sw": "naoEngSw",
    "nao_dev": "naoDev",
    "nao_qvt": "naoQvt",
}

UUID_SUFFIX = re.compile(
    r"_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$",
    re.IGNORECASE,
)

# Raiz do PDF no servidor -> subpasta correspondente dentro do snapshot.
# Espelha pdf_roots de scripts/backup/server-data-remote.py.
ROOT_MAP = (
    ("/opt/referencias/data/pdfs/", "data-pdfs"),
    ("/var/lib/referencias/pdfs/", "pdfs"),
)


def local_pdf_path(caminho: str, snapshot: Path) -> Path | None:
    """Traduz o `caminho` do servidor para o arquivo dentro do snapshot."""
    posix = caminho.replace("\\", "/")
    for remote_root, local_sub in ROOT_MAP:
        if posix.startswith(remote_root):
            return snapshot / local_sub / posix[len(remote_root):]
    # Raiz desconhecida: tenta pelo nome do arquivo em qualquer subpasta de PDFs.
    name = Path(posix).name
    for _, local_sub in ROOT_MAP:
        base = snapshot / local_sub
        if base.is_dir():
            hit = next(base.rglob(name), None)
            if hit is not None:
                return hit
    return None

# Classificação de veículo da skill analise-fatores-qvt, seção "Tipo de veículo".
# Cinza de 2º/3º nível reprova por veículo — e a skill é explícita que isso NÃO
# deve ser registrado como "Não é QVT", que sujaria o dado de triagem.
VEICULO_CINZA_23 = re.compile(
    r"\b(arxiv|preprint|blog|medium\.com|wiki|slides?|youtube|stack\s?overflow"
    r"|reddit|substack|newsletter|white\s?paper)\b",
    re.IGNORECASE,
)
# Cinza de 1º nível entra na análise, mas com aviso: há controle editorial,
# não revisão por pares formal. Só nomes específicos — "IEEE Software" é revista
# profissional, mas "IEEE Transactions on..." é journal revisado.
VEICULO_CINZA_1 = re.compile(
    r"(\bieee software\b|\bcommunications of the acm\b|\btechnical report\b"
    r"|\btech\.? rep\b|\bbook chapter\b|\bhandbook\b|\bencyclopedia\b"
    r"|\bspringer briefs\b|\bmagazine\b)",
    re.IGNORECASE,
)
# Volumes da LNCS são anais de conferência revisados — entram como branca.
VEICULO_BRANCA = re.compile(
    r"\b(journal|transactions|proceedings|conference|symposium|workshop"
    r"|congress|lecture notes|empirical software)\b",
    re.IGNORECASE,
)

# Alias mantido para o check de triagem do audit.
VEICULO_CINZA = VEICULO_CINZA_23


# Tipos BibTeX que são cinza de 1º nível por si — livro e capítulo de editora
# acadêmica, relatório técnico institucional. O nome do veículo não revela isso
# ("Rethinking productivity in software engineering" é um livro da Apress).
ENTRY_TYPES_CINZA_1 = frozenset({"book", "inbook", "incollection", "techreport", "manual"})


def classify_veiculo(journal: str, source: str = "", entry_type: str = "") -> str:
    """'cinza23' | 'cinza1' | 'branca' | 'indefinido'.

    Heurística sobre o texto do veículo — serve para priorizar a revisão humana,
    não para decidir sozinha. A ordem importa: cinza de 2º/3º nível vence tudo
    (preprint de artigo de conferência continua preprint), depois o tipo de
    entrada e os nomes de revista profissional, e só então a literatura branca.
    """
    blob = f"{journal} {source} {entry_type}"
    if VEICULO_CINZA_23.search(blob):
        return "cinza23"
    if entry_type.strip().lower() in ENTRY_TYPES_CINZA_1:
        return "cinza1"
    if VEICULO_CINZA_1.search(blob):
        return "cinza1"
    if VEICULO_BRANCA.search(blob):
        return "branca"
    return "indefinido"


def strip_accents(text: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", text)
        if unicodedata.category(ch) != "Mn"
    )


def norm(text: str | None) -> str:
    """Minúsculas, sem acento, só alfanumérico e espaço."""
    if not text:
        return ""
    cleaned = strip_accents(text).lower()
    cleaned = re.sub(r"[^a-z0-9]+", " ", cleaned)
    return re.sub(r"\s+", " ", cleaned).strip()


def safe_entry_key(entry_key: str) -> str:
    """Espelha safeEntryKey() de backend/src/pdfStorage.ts."""
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "_", entry_key)
    safe = re.sub(r"^_+|_+$", "", safe)
    return (safe or "article")[:80]


def find_latest_snapshot(root: Path) -> Path:
    candidates = sorted(
        (p for p in root.glob("server-*") if (p / "referencias.db").is_file()),
        key=lambda p: p.name,
    )
    if not candidates:
        raise SystemExit(f"Nenhum snapshot com referencias.db em {root}")
    return candidates[-1]


def open_snapshot(snapshot: Path, workdir: Path) -> sqlite3.Connection:
    """Copia o banco (com WAL) para workdir e abre. Não toca o backup."""
    shutil.copy2(snapshot / "referencias.db", workdir / "referencias.db")
    for suffix in ("-wal", "-shm"):
        extra = snapshot / f"referencias.db{suffix}"
        if extra.is_file():
            shutil.copy2(extra, workdir / f"referencias.db{suffix}")
    conn = sqlite3.connect(workdir / "referencias.db")
    conn.row_factory = sqlite3.Row
    return conn


def table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}


def resolve_snapshot(snapshot: Path | None, backup_root: Path) -> Path:
    resolved = snapshot or find_latest_snapshot(backup_root)
    if not (resolved / "referencias.db").is_file():
        raise SystemExit(f"Snapshot sem referencias.db: {resolved}")
    return resolved
