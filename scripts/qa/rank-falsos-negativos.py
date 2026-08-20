#!/usr/bin/env python3
"""Ordena os artigos fora do corpus pela chance de terem saído por engano.

O objetivo não é auditar tudo: é achar o falso negativo — artigo que estuda o
bem-estar de quem produz software e foi excluído. Numa revisão de literatura é o
erro que não se corrige depois, porque o artigo simplesmente não está lá.

A pontuação combina os quatro sinais que os falsos negativos já encontrados
tinham em comum: veículo de engenharia de software, sujeito sendo quem produz
software, desfecho de bem-estar, e estudo empírico próprio. Subtrai quando a
população estudada é claramente outra (pacientes, idosos, alunos, cidadãos).

Não decide nada — só define a ordem de leitura. Ler de cima para baixo e parar
quando os achados secarem.

Uso:
  python scripts/qa/rank-falsos-negativos.py --snapshot "G:/.../server-20260819-225909"
  python scripts/qa/rank-falsos-negativos.py --top 40
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import (  # noqa: E402
    DEFAULT_BACKUP_ROOT,
    REPO_ROOT,
    open_snapshot,
    resolve_snapshot,
)

# Veículos em que um artigo de QVT de quem produz software *deveria* estar.
VEICULO_ES_FORTE = re.compile(
    r"international conference on software engineering|transactions on software engineering"
    r"|empirical software engineering|foundations of software engineering"
    r"|automated software engineering|mining software repositories"
    r"|software maintenance|journal of systems and software|ieee software|sigsoft"
    r"|evaluation and assessment in software engineering|software process"
    r"|visual languages and human.centric|human factors in computing systems"
    r"|computer.supported cooperative work|information systems research"
    r"|mis quarterly|human.computer interaction", re.IGNORECASE)
VEICULO_COMPUTACAO = re.compile(
    r"\bacm\b|\bieee\b|computer|computing|informatics|software|information system"
    r"|lecture notes|artificial intelligence", re.IGNORECASE)

# Quem produz software, como sujeito do estudo.
SUJEITO = re.compile(
    r"software (?:engineer|developer|practitioner|professional|team)s?"
    r"|\bdevelopers?\b|\bprogrammers?\b|\bdevops\b|\bcoders?\b|software industry"
    r"|software organi[sz]ation|desenvolvedores?|engenheiros? de software",
    re.IGNORECASE)

# Desfecho de bem-estar no trabalho.
BEM_ESTAR = re.compile(
    r"well.?being|burnout|job satisfaction|work.life|technostress|\bstress\b"
    r"|mental health|turnover intention|quality of (?:work )?life|engagement"
    r"|motivation|happiness|emotion|depression|anxiety|workload|overtime"
    r"|psychological safety|bem.estar|satisfa[çc][ãa]o no trabalho", re.IGNORECASE)

# Estudo empírico próprio.
EMPIRICO = re.compile(
    r"\bparticipants?\b|\brespondents?\b|interviewe|we surveyed|we recruited"
    r"|survey of|\bn\s?=\s?\d+|questionnaire|case study|grounded theory"
    r"|mixed.method|focus group|diary study|experiment", re.IGNORECASE)

# População que NÃO é quem produz software — puxa a nota para baixo.
OUTRA_POPULACAO = re.compile(
    r"\bpatients?\b|older adults?|elderly|\bchildren\b|adolescents?|\bstudents?\b"
    r"|\bcitizens?\b|\bnurses?\b|\bteachers?\b|\bfarmers?\b|\bdrivers?\b"
    r"|end.users?|consumers?|\bplayers?\b|caregivers?|disabilit", re.IGNORECASE)


def pontuar(titulo: str, abstract: str, journal: str) -> tuple[int, list[str]]:
    ini = abstract[:800]
    pontos = 0
    porque: list[str] = []

    if VEICULO_ES_FORTE.search(journal):
        pontos += 4
        porque.append("veículo de ES")
    elif VEICULO_COMPUTACAO.search(journal):
        pontos += 1
        porque.append("veículo de computação")

    if SUJEITO.search(titulo):
        pontos += 4
        porque.append("sujeito no título")
    elif SUJEITO.search(ini):
        pontos += 2
        porque.append("sujeito no abstract")

    if BEM_ESTAR.search(titulo):
        pontos += 4
        porque.append("bem-estar no título")
    elif BEM_ESTAR.search(ini):
        pontos += 2
        porque.append("bem-estar no abstract")

    if EMPIRICO.search(ini):
        pontos += 1
        porque.append("estudo empírico")

    # Só penaliza se a outra população aparece e o sujeito certo não está no título:
    # "developers' burnout among patients" não existe, mas "app for elderly, built
    # by developers" existe muito.
    if OUTRA_POPULACAO.search(titulo) and not SUJEITO.search(titulo):
        pontos -= 3
        porque.append("outra população no título")

    return pontos, porque


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, default=None)
    parser.add_argument("--backup-root", type=Path, default=DEFAULT_BACKUP_ROOT)
    parser.add_argument("--out", type=Path, default=None)
    parser.add_argument("--top", type=int, default=40, help="quantos imprimir")
    args = parser.parse_args()

    snapshot = resolve_snapshot(args.snapshot, args.backup_root)
    out_dir = args.out or (REPO_ROOT / "data" / "qa" / snapshot.name)

    with tempfile.TemporaryDirectory(prefix="referencias-rank-") as tmp:
        conn = open_snapshot(snapshot, Path(tmp))
        try:
            grupos = {r["id"]: r["title"] for r in conn.execute("SELECT id, title FROM groups")}
            fora = []
            for row in conn.execute(
                """SELECT group_id, entry_key, fields_json, status, descartado, usado,
                          motivo_descarte, notes, caminho,
                          json_array_length(factors_json) nf
                     FROM articles"""
            ):
                # Fora do corpus: excluído de alguma forma, sem fator e não usado.
                excluido = (
                    row["descartado"] or row["motivo_descarte"]
                    or row["status"] in ("duplicate", "not_eligible")
                )
                if not excluido or row["usado"] or (row["nf"] or 0) > 0:
                    continue
                f = json.loads(row["fields_json"] or "{}")
                titulo = (f.get("title") or "").strip()
                pontos, porque = pontuar(
                    titulo, (f.get("abstract") or "").strip(), (f.get("journal") or "").strip()
                )
                fora.append({
                    "pontos": pontos,
                    "porque": porque,
                    "grupoId": row["group_id"],
                    "grupo": grupos.get(row["group_id"], "?"),
                    "chave": row["entry_key"],
                    "titulo": titulo,
                    "journal": (f.get("journal") or "").strip(),
                    "ano": (f.get("year") or "").strip(),
                    "status": row["status"],
                    "motivoDescarte": row["motivo_descarte"],
                    "temPdf": bool((row["caminho"] or "").strip()),
                    "temNota": bool((row["notes"] or "").strip()),
                })
        finally:
            conn.close()

    fora.sort(key=lambda x: (-x["pontos"], x["chave"]))
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "ranking-falsos-negativos.json").write_text(
        json.dumps({
            "snapshot": snapshot.name,
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "total": len(fora),
            "itens": fora,
        }, ensure_ascii=False, indent=2), encoding="utf-8")

    from collections import Counter
    faixas = Counter(
        "12+" if x["pontos"] >= 12 else
        "9-11" if x["pontos"] >= 9 else
        "6-8" if x["pontos"] >= 6 else
        "3-5" if x["pontos"] >= 3 else "0-2"
        for x in fora
    )
    print(f"[rank] snapshot: {snapshot.name}")
    print(f"[rank] artigos fora do corpus: {len(fora)}")
    print("[rank] por faixa de pontos:")
    for faixa in ("12+", "9-11", "6-8", "3-5", "0-2"):
        print(f"          {faixa:>5s}  {faixas[faixa]:4d}")
    print(f"\n[rank] top {args.top}:\n")
    for x in fora[:args.top]:
        pdf = "pdf" if x["temPdf"] else "   "
        print(f"  {x['pontos']:3d} {pdf} {x['chave']:24s} {x['titulo'][:62]}")
        print(f"      {x['journal'][:60]:62s} {', '.join(x['porque'])}")
    print(f"\n[rank] saída: {out_dir / 'ranking-falsos-negativos.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
