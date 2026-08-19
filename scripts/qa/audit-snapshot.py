#!/usr/bin/env python3
"""Auditoria de QA sobre um snapshot de backup do servidor Referências.

Lê referencias.db de uma pasta server-<stamp> (a mais recente, por padrão) e
aponta artigos cuja triagem está incoerente: status, categoria, motivo de
descarte, vínculo de duplicata, fatores e PDF anexado.

Somente leitura: o banco do snapshot é copiado para uma pasta temporária antes
de abrir, para que o WAL possa ser aplicado sem tocar o backup.

Uso:
  python scripts/qa/audit-snapshot.py
  python scripts/qa/audit-snapshot.py --snapshot "G:/Meu Drive/.../server-20260819-101500"

Saída (em data/qa/<stamp>/): qa-report.md, qa-findings.json, notas-pendentes.json.
O conteúdo dos PDFs é conferido depois, por check-pdf-content.py.
"""

from __future__ import annotations

import argparse
import json
import re
import sqlite3
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from _common import (  # noqa: E402
    CATEGORIA_POR_MOTIVO,
    DEFAULT_BACKUP_ROOT,
    MOTIVOS,
    REPO_ROOT,
    STATUS_CONHECIDOS,
    UUID_SUFFIX,
    norm,
    open_snapshot,
    resolve_snapshot,
    safe_entry_key,
    table_columns,
)

# Veículos que a skill classifica como cinza de 2º/3º nível: reprovam por
# veículo, e usar "Não é QVT" para excluí-los suja o dado de triagem.
VEICULO_CINZA = re.compile(
    r"\b(arxiv|preprint|blog|medium\.com|wiki|slides?|youtube|stack\s?overflow"
    r"|reddit|substack|newsletter|white\s?paper)\b",
    re.IGNORECASE,
)


# ------------------------------------------------------------------- modelo

class Article:
    def __init__(self, row: sqlite3.Row, group_titles: dict[int, str], cols: set[str]):
        self.id = row["id"]
        self.group_id = row["group_id"]
        self.group_title = group_titles.get(row["group_id"], "?")
        self.key = row["entry_key"]
        self.entry_type = row["entry_type"]
        self.fields = json.loads(row["fields_json"] or "{}")
        self.status = row["status"]
        self.source = row["source"] or ""
        self.caminho = row["caminho"] or ""
        self.notes = row["notes"] or ""
        self.tags = json.loads(row["tags_json"] or "[]")
        self.factors = json.loads(row["factors_json"] or "[]")
        self.descartado = bool(row["descartado"])
        self.usado = bool(row["usado"])
        self.revisao = bool(row["revisao_literatura"])
        self.pdf_nao_encontrado = bool(row["pdf_nao_encontrado"])
        self.motivo = row["motivo_descarte"] if "motivo_descarte" in cols else None
        self.dup_group = row["duplicate_group_id"] if "duplicate_group_id" in cols else None
        self.dup_key = row["duplicate_key"] if "duplicate_key" in cols else None

    def field(self, name: str) -> str:
        return (self.fields.get(name) or "").strip()

    @property
    def title(self) -> str:
        return self.field("title")

    @property
    def year(self) -> str:
        return self.field("year")

    @property
    def journal(self) -> str:
        return self.field("journal")

    @property
    def abstract(self) -> str:
        return self.field("abstract")

    @property
    def tem_fatores(self) -> bool:
        return len(self.factors) > 0

    @property
    def reprovado_triagem(self) -> bool:
        return self.motivo in MOTIVOS

    @property
    def categoria(self) -> str:
        """Espelha CATEGORIA_SQL de backend/src/store/sqliteStore.ts."""
        if self.tem_fatores:
            return "comFatores"
        if self.status == "duplicate":
            return "repetidos"
        if self.usado:
            return "usados"
        if self.motivo in CATEGORIA_POR_MOTIVO:
            return CATEGORIA_POR_MOTIVO[self.motivo]
        if self.descartado:
            return "descartados"
        if self.caminho.strip():
            return "comPdf"
        return "outros"

    def ref(self) -> dict:
        return {
            "grupoId": self.group_id,
            "grupo": self.group_title,
            "chave": self.key,
            "titulo": self.title,
            "ano": self.year,
            "journal": self.journal,
            "categoria": self.categoria,
            "status": self.status,
            "motivoDescarte": self.motivo,
            "usado": self.usado,
            "descartado": self.descartado,
            "revisaoLiteratura": self.revisao,
            "pdfNaoEncontrado": self.pdf_nao_encontrado,
            "temFatores": self.tem_fatores,
            "caminho": self.caminho,
            "notes": self.notes,
        }


# -------------------------------------------------------------------- regras

class Finding:
    def __init__(self, check: str, severity: str, title: str, explain: str):
        self.check = check
        self.severity = severity
        self.title = title
        self.explain = explain
        self.rows: list[dict] = []

    def add(self, article: Article, detail: str = "") -> None:
        row = article.ref()
        if detail:
            row["detalhe"] = detail
        self.rows.append(row)

    def to_json(self) -> dict:
        return {
            "check": self.check,
            "severity": self.severity,
            "title": self.title,
            "explain": self.explain,
            "count": len(self.rows),
            "rows": self.rows,
        }


def run_checks(
    articles: list[Article],
    catalog_ids: set[str],
    has_motivo: bool,
) -> list[Finding]:
    by_group_key = {(a.group_id, a.key): a for a in articles}
    findings: list[Finding] = []

    def check(cid: str, sev: str, title: str, explain: str) -> Finding:
        f = Finding(cid, sev, title, explain)
        findings.append(f)
        return f

    # --- contradições entre as flags de triagem ------------------------------
    f_motivo_sem_descarte = check(
        "motivo-sem-descartado", "alta",
        "Motivo de descarte preenchido, mas não marcado como descartado",
        "A categoria olha o motivo e ignora a flag, então o artigo aparece em "
        "naoEngSw/naoDev/naoQvt mesmo com descartado=0. Um dos dois está errado.",
    )
    f_usado_descartado = check(
        "usado-e-descartado", "alta",
        "Marcado como usado e descartado ao mesmo tempo",
        "'usados' vence 'descartados' na prioridade: o descarte fica invisível na lista.",
    )
    f_usado_com_motivo = check(
        "usado-com-motivo-descarte", "alta",
        "Marcado como usado, mas com motivo de descarte",
        "'usados' vence o motivo: o artigo sai das categorias de reprovação sem aviso.",
    )
    f_descartado_com_fatores = check(
        "descartado-com-fatores", "alta",
        "Descartado (ou reprovado na triagem) mas com fatores associados",
        "'comFatores' vence tudo: o artigo sai da fila de triagem e entra na análise "
        "como se tivesse sido aprovado.",
    )
    f_dup_com_fatores = check(
        "duplicata-com-fatores", "alta",
        "Duplicata com fatores associados",
        "Fator vence 'repetidos': a mesma evidência pode estar contada duas vezes.",
    )
    f_revisao_descartado = check(
        "revisao-literatura-descartado", "media",
        "Usado na revisão de literatura, mas descartado",
        "Se entrou na revisão, o descarte é provavelmente resíduo de triagem anterior.",
    )
    f_pdf_flag = check(
        "pdf-nao-encontrado-com-caminho", "media",
        "Marcado como 'PDF não encontrado' mas com PDF anexado",
        "A flag e o caminho se contradizem; a lista mostra o ícone errado.",
    )
    f_usado_sem_fatores = check(
        "usado-sem-fatores", "media",
        "Usado, porém sem nenhum fator extraído",
        "Usado é o estado final da inclusão; sem fator, ou a análise ficou pela metade "
        "ou o artigo foi marcado por engano.",
    )
    f_usado_sem_pdf = check(
        "usado-sem-pdf", "media",
        "Usado sem PDF anexado e sem a flag de PDF não encontrado",
        "Não há como reconferir a evidência depois.",
    )
    f_status_desconhecido = check(
        "status-desconhecido", "alta",
        "Status fora dos valores que o app usa",
        f"O app só produz {STATUS_CONHECIDOS}; outro valor escapa dos filtros.",
    )
    f_motivo_invalido = check(
        "motivo-invalido", "alta",
        "Motivo de descarte fora do enum",
        f"Válidos: {MOTIVOS}. Outro valor nunca casa com nenhuma categoria.",
    )

    # --- duplicatas ---------------------------------------------------------
    f_dup_sem_ref = check(
        "duplicata-sem-referencia", "media",
        "Status 'duplicate' sem apontar o original",
        "Sem duplicate_key/duplicate_group_id não se sabe de qual artigo é cópia.",
    )
    f_dup_ref_quebrada = check(
        "duplicata-referencia-quebrada", "alta",
        "Duplicata apontando para artigo inexistente",
        "O original foi apagado ou renomeado; o vínculo virou órfão.",
    )
    f_dup_self = check(
        "duplicata-aponta-para-si", "alta",
        "Duplicata apontando para si mesma",
        "Vínculo circular: nunca resolve para um original.",
    )
    f_dup_divergente = check(
        "duplicata-tratada-diferente", "media",
        "Duplicata e original com triagem divergente",
        "O mesmo trabalho recebeu vereditos diferentes nas duas entradas.",
    )
    f_titulo_repetido = check(
        "titulo-repetido-sem-duplicata", "media",
        "Mesmo título em artigos diferentes sem marcação de duplicata",
        "Candidatos a duplicata que a detecção não pegou — inflam o tamanho do corpus.",
    )

    # --- notas / rastreabilidade da rejeição --------------------------------
    f_motivo_sem_nota = check(
        "motivo-sem-nota", "media",
        "Reprovado na triagem sem nota explicando o porquê",
        "É o buraco a tapar: sem nota não há como auditar a exclusão depois.",
    )
    f_descartado_sem_motivo = check(
        "descartado-sem-motivo", "baixa",
        "Descartado sem motivo de triagem",
        "Cai em 'descartados' genérico. Legítimo em alguns casos (não conseguiu o PDF), "
        "mas vale conferir se não deveria ter um dos três motivos.",
    )
    f_nota_caminho = check(
        "nota-com-caminho-de-arquivo", "media",
        "Nota contendo caminho de arquivo em vez de texto",
        "Sobra de colagem: ocupa o campo que deveria explicar a decisão.",
    )
    f_veiculo_cinza = check(
        "veiculo-cinza-marcado-nao-qvt", "media",
        "Exclusão por veículo registrada como 'Não é QVT'",
        "A skill é explícita: excluir por veículo usando 'Não é QVT' suja o dado de "
        "triagem. Deve sair por veículo, com a nota dizendo isso.",
    )
    f_sem_material = check(
        "sem-abstract-e-sem-pdf", "baixa",
        "Sem abstract e sem PDF, ainda em aberto",
        "Não há material para triar; ou consegue o texto ou registra que não foi possível.",
    )

    # --- fatores ------------------------------------------------------------
    f_fator_orfao = check(
        "fator-fora-do-catalogo", "alta",
        "Ocorrência de fator sem entrada no catálogo",
        "factorId não existe na tabela factors: o fator não aparece na aba Fatores.",
    )
    f_fator_polaridade = check(
        "fator-polaridade-invalida", "alta",
        "Polaridade de fator fora de positive/negative",
        "Quebra a contagem de positivos/negativos do fator.",
    )
    f_fator_separador = check(
        "fator-label-com-separador", "media",
        "Grafia de fator com vírgula ou ponto-e-vírgula",
        "O app divide a grafia nesses caracteres, gerando duas grafias truncadas.",
    )
    f_fator_sem_descricao = check(
        "fator-sem-descricao", "baixa",
        "Ocorrência de fator sem a citação de evidência",
        "Sem o trecho verbatim não se reconfere o fator no PDF.",
    )

    # --- PDF (nível banco) --------------------------------------------------
    f_caminho_duplicado = check(
        "caminho-pdf-compartilhado", "alta",
        "Mesmo arquivo PDF em mais de um artigo",
        "Cada upload gera nome único; caminho repetido significa que um dos artigos "
        "aponta para o PDF do outro.",
    )
    f_prefixo_divergente = check(
        "pdf-prefixo-diferente-da-chave", "media",
        "Nome do PDF não corresponde à chave do artigo",
        "O arquivo é salvo como <chave>_<uuid>.pdf. Prefixo diferente é sinal de PDF "
        "anexado no artigo errado.",
    )

    ano_atual = datetime.now(timezone.utc).year
    f_ano = check(
        "ano-implausivel", "baixa",
        "Ano ausente ou implausível",
        f"Fora da faixa 1950-{ano_atual + 1}, ou vazio.",
    )
    f_titulo_vazio = check(
        "titulo-vazio", "media",
        "Artigo sem título",
        "Aparece na lista só pela chave; impossível triar sem abrir.",
    )

    titulos: dict[str, list[Article]] = defaultdict(list)
    caminhos: dict[str, list[Article]] = defaultdict(list)

    for a in articles:
        motivo = a.motivo

        if motivo and not a.descartado:
            f_motivo_sem_descarte.add(a, f"motivo={motivo}, descartado=0")
        if a.usado and a.descartado:
            f_usado_descartado.add(a)
        if a.usado and motivo:
            f_usado_com_motivo.add(a, f"motivo={motivo}")
        if (a.descartado or a.reprovado_triagem) and a.tem_fatores:
            f_descartado_com_fatores.add(a, f"{len(a.factors)} fator(es)")
        if a.status == "duplicate" and a.tem_fatores:
            f_dup_com_fatores.add(a, f"{len(a.factors)} fator(es)")
        if a.revisao and a.descartado:
            f_revisao_descartado.add(a)
        if a.pdf_nao_encontrado and a.caminho.strip():
            f_pdf_flag.add(a)
        if a.usado and not a.tem_fatores:
            f_usado_sem_fatores.add(a)
        if a.usado and not a.caminho.strip() and not a.pdf_nao_encontrado:
            f_usado_sem_pdf.add(a)
        if a.status not in STATUS_CONHECIDOS:
            f_status_desconhecido.add(a, f"status={a.status!r}")
        if motivo is not None and motivo not in MOTIVOS:
            f_motivo_invalido.add(a, f"motivo={motivo!r}")

        if a.status == "duplicate":
            if not a.dup_key or a.dup_group is None:
                f_dup_sem_ref.add(a)
            elif a.dup_key == a.key and a.dup_group == a.group_id:
                f_dup_self.add(a)
            else:
                original = by_group_key.get((a.dup_group, a.dup_key))
                if original is None:
                    f_dup_ref_quebrada.add(a, f"aponta para {a.dup_group}/{a.dup_key}")
                elif (original.usado, original.descartado, original.motivo) != (
                    a.usado, a.descartado, motivo
                ):
                    f_dup_divergente.add(
                        a,
                        f"original {original.key}: usado={original.usado} "
                        f"descartado={original.descartado} motivo={original.motivo}",
                    )

        if a.reprovado_triagem and not a.notes.strip():
            f_motivo_sem_nota.add(a, f"motivo={motivo}")
        if a.descartado and not motivo:
            f_descartado_sem_motivo.add(a)
        nota = a.notes.strip().strip('"')
        if nota and (re.match(r"^[A-Za-z]:[\\/]", nota) or nota.lower().endswith(".pdf")):
            f_nota_caminho.add(a, f"notes={a.notes[:80]!r}")
        if motivo == "nao_qvt" and VEICULO_CINZA.search(f"{a.journal} {a.source}"):
            f_veiculo_cinza.add(a, f"journal={a.journal!r}")
        if (
            not a.abstract and not a.caminho.strip()
            and not a.usado and not a.descartado and not a.reprovado_triagem
            and a.status != "duplicate"
        ):
            f_sem_material.add(a)

        for factor in a.factors:
            fid = factor.get("factorId") or ""
            label = factor.get("label") or ""
            if fid and catalog_ids and fid not in catalog_ids:
                f_fator_orfao.add(a, f"factorId={fid!r} label={label!r}")
            if factor.get("polarity") not in ("positive", "negative"):
                f_fator_polaridade.add(a, f"label={label!r} polarity={factor.get('polarity')!r}")
            if any(sep in label for sep in (",", ";")):
                f_fator_separador.add(a, f"label={label!r}")
            if not (factor.get("description") or "").strip():
                f_fator_sem_descricao.add(a, f"label={label!r}")

        if a.caminho.strip():
            caminhos[a.caminho.strip()].append(a)
            base = Path(a.caminho.replace("\\", "/")).name
            prefix = UUID_SUFFIX.sub("", base)
            if prefix != base and prefix != safe_entry_key(a.key):
                f_prefixo_divergente.add(
                    a, f"arquivo={base!r} esperado={safe_entry_key(a.key)!r}"
                )

        if a.title:
            titulos[norm(a.title)].append(a)
        else:
            f_titulo_vazio.add(a)

        if not a.year.isdigit() or not (1950 <= int(a.year) <= ano_atual + 1):
            f_ano.add(a, f"year={a.year!r}")

    for group in caminhos.values():
        if len(group) > 1:
            for a in group:
                outros = ", ".join(x.key for x in group if x is not a)
                f_caminho_duplicado.add(a, f"compartilhado com {outros}")

    for group in titulos.values():
        nao_marcados = [a for a in group if a.status != "duplicate"]
        if len(nao_marcados) > 1:
            for a in nao_marcados:
                outros = ", ".join(x.key for x in nao_marcados if x is not a)
                f_titulo_repetido.add(a, f"mesmo título de {outros}")

    if not has_motivo:
        for f in findings:
            if "motivo" in f.check or "veiculo" in f.check:
                f.explain += (
                    " (snapshot sem a coluna motivo_descarte — check não avaliado)"
                )

    return [f for f in findings if f.rows]


# ------------------------------------------------------------------ relatório

SEV_ORDER = {"alta": 0, "media": 1, "baixa": 2}


def write_report(
    out_dir: Path,
    snapshot: Path,
    articles: list[Article],
    findings: list[Finding],
    cat_counts: Counter,
    has_motivo: bool,
) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    findings = sorted(findings, key=lambda f: (SEV_ORDER[f.severity], -len(f.rows)))
    total_flag = len({(r["grupoId"], r["chave"]) for f in findings for r in f.rows})

    lines = [
        "# QA do corpus — Referências\n",
        f"- Snapshot: `{snapshot}`",
        f"- Gerado em: {datetime.now().astimezone().isoformat(timespec='seconds')}",
        f"- Artigos: **{len(articles)}**",
        f"- Artigos com ao menos um apontamento: **{total_flag}**",
    ]
    if not has_motivo:
        lines.append(
            "- ⚠️ Snapshot **sem a coluna `motivo_descarte`**: os checks de motivo e "
            "de veículo não foram avaliados. Puxe um backup novo."
        )

    lines += ["\n## Distribuição por categoria\n", "| Categoria | Artigos |", "|---|---:|"]
    lines += [f"| {cat} | {n} |" for cat, n in cat_counts.most_common()]

    lines += ["\n## Apontamentos\n", "| Sev | Check | Artigos |", "|---|---|---:|"]
    lines += [
        f"| {f.severity} | [{f.check}](#{f.check}) | {len(f.rows)} |" for f in findings
    ]

    for f in findings:
        lines += [
            f'\n<a id="{f.check}"></a>',
            f"\n### {f.title}",
            f"\n`{f.check}` · severidade **{f.severity}** · {len(f.rows)} artigo(s)\n",
            f"{f.explain}\n",
            "| Grupo | Chave | Título | Cat. | Detalhe |",
            "|---|---|---|---|---|",
        ]
        for r in f.rows[:200]:
            titulo = (r["titulo"] or "—")[:70].replace("|", "/")
            detalhe = str(r.get("detalhe", "")).replace("|", "/")[:90]
            lines.append(
                f"| {r['grupo']} | `{r['chave']}` | {titulo} | {r['categoria']} | {detalhe} |"
            )
        if len(f.rows) > 200:
            lines.append(f"\n_(+{len(f.rows) - 200} não listados — veja o JSON)_")

    (out_dir / "qa-report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")

    (out_dir / "qa-findings.json").write_text(
        json.dumps(
            {
                "snapshot": str(snapshot),
                "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "totalArticles": len(articles),
                "articlesFlagged": total_flag,
                "hasMotivoColumn": has_motivo,
                "categorias": dict(cat_counts),
                "findings": [f.to_json() for f in findings],
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


def write_notes_queue(out_dir: Path, articles: list[Article]) -> int:
    """Material para escrever as notas de rejeição: quem precisa e com que insumo."""
    pend = [
        a for a in articles
        if (a.reprovado_triagem or a.descartado) and not a.notes.strip()
    ]
    pend.sort(key=lambda a: (a.motivo or "zz", a.group_id, a.key))
    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "total": len(pend),
        "itens": [
            {
                "grupoId": a.group_id,
                "chave": a.key,
                "motivoDescarte": a.motivo,
                "descartado": a.descartado,
                "titulo": a.title,
                "ano": a.year,
                "journal": a.journal,
                "entryType": a.entry_type,
                "temPdf": bool(a.caminho.strip()),
                "pdfNaoEncontrado": a.pdf_nao_encontrado,
                "abstract": a.abstract,
                "notaProposta": "",
            }
            for a in pend
        ],
    }
    (out_dir / "notas-pendentes.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return len(pend)


# ----------------------------------------------------------------------- main

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", type=Path, default=None,
                        help="pasta server-<stamp> (padrão: a mais recente)")
    parser.add_argument("--backup-root", type=Path, default=DEFAULT_BACKUP_ROOT)
    parser.add_argument("--out", type=Path, default=None,
                        help="pasta de saída (padrão: data/qa/<stamp> no repo)")
    args = parser.parse_args()

    snapshot = resolve_snapshot(args.snapshot, args.backup_root)
    out_dir = args.out or (REPO_ROOT / "data" / "qa" / snapshot.name)

    print(f"[qa] snapshot: {snapshot}")
    with tempfile.TemporaryDirectory(prefix="referencias-qa-") as tmp:
        conn = open_snapshot(snapshot, Path(tmp))
        cols = table_columns(conn, "articles")
        has_motivo = "motivo_descarte" in cols
        group_titles = {
            row["id"]: row["title"] for row in conn.execute("SELECT id, title FROM groups")
        }
        catalog_ids = {row["id"] for row in conn.execute("SELECT id FROM factors")}
        articles = [
            Article(row, group_titles, cols)
            for row in conn.execute("SELECT * FROM articles")
        ]
        conn.close()

    print(f"[qa] artigos: {len(articles)} · grupos: {len(group_titles)} "
          f"· fatores no catálogo: {len(catalog_ids)}")
    if not has_motivo:
        print("[qa] AVISO: snapshot antigo, sem motivo_descarte.")

    cat_counts = Counter(a.categoria for a in articles)
    findings = run_checks(articles, catalog_ids, has_motivo)
    write_report(out_dir, snapshot, articles, findings, cat_counts, has_motivo)
    n_notes = write_notes_queue(out_dir, articles)

    print(f"[qa] apontamentos: {sum(len(f.rows) for f in findings)} "
          f"em {len(findings)} check(s)")
    print(f"[qa] notas pendentes: {n_notes}")
    print(f"[qa] saída: {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
