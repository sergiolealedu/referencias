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
STATUS_CONHECIDOS = ("exists", "duplicate")
CATEGORIA_POR_MOTIVO = {
    "nao_eng_sw": "naoEngSw",
    "nao_dev": "naoDev",
    "nao_qvt": "naoQvt",
}

UUID_SUFFIX = re.compile(
    r"_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$",
    re.IGNORECASE,
)


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
