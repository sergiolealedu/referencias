#!/usr/bin/env python3
"""Aplica no servidor as notas e correções de triagem já revisadas.

Lê um arquivo de itens e faz `PATCH /api/groups/<grupoId>/articles/<chave>`.
Aceita os dois arquivos que o QA produz:

  notas-propostas.json      itens com `notaProposta`  -> patch {"notes": ...}
  correcoes-propostas.json  itens com `patch` e `esperado`

Por padrão é **dry-run**: mostra o que faria e não escreve nada. Só grava com
--apply.

Três proteções, porque isto escreve no corpus real:

  1. `esperado` é uma guarda otimista — antes de gravar, compara os campos que
     vai mudar com o valor que o snapshot viu. Se você editou o artigo no app
     entre o backup e agora, o item é pulado em vez de sobrescrever.
  2. Nota já preenchida no servidor nunca é sobrescrita sem --overwrite.
  3. Só um subconjunto de campos é aceito (ver CAMPOS_PERMITIDOS). `caminho`,
     `factors` e `tags` ficam de fora de propósito: reescrevê-los em lote a
     partir de um snapshot apagaria trabalho de análise.

Autenticação (device auth do app):
  - REF_AUTH_TOKEN no ambiente, ou --auth-token: usa uma sessão existente; ou
  - --join-token <token de convite>: registra um device novo e entra no
    workspace. Gere o token na tela de workspaces do app.

Uso:
  $env:REF_AUTH_TOKEN = '...'
  python scripts/qa/apply-patches.py --input data/qa/<stamp>/notas-propostas.json
  python scripts/qa/apply-patches.py --input data/qa/<stamp>/notas-propostas.json --apply
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_BASE_URL = "https://ref.sergioleal.org"

# Subconjunto de articlePatchSchema (backend/src/schemas/referencias.ts) que o QA
# tem motivo para escrever. Deixar de fora caminho/factors/tags é proteção, não
# limitação: um lote errado neles apagaria análise.
CAMPOS_PERMITIDOS = {
    "notes",
    "status",
    "descartado",
    "usado",
    "revisaoLiteratura",
    "pdfNaoEncontrado",
    "motivoDescarte",
}


class ApiError(RuntimeError):
    pass


class Api:
    def __init__(self, base_url: str, auth_token: str | None, device_id: str | None):
        self.base_url = base_url.rstrip("/")
        self.auth_token = auth_token
        self.device_id = device_id

    def request(self, method: str, path: str, body: dict | None = None) -> dict:
        url = f"{self.base_url}{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        if self.auth_token:
            req.add_header("X-Auth-Token", self.auth_token)
        if self.device_id:
            req.add_header("X-Device-Id", self.device_id)
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                payload = resp.read().decode("utf-8")
                return json.loads(payload) if payload else {}
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:400]
            raise ApiError(f"{method} {path} -> HTTP {exc.code}: {detail}") from exc
        except urllib.error.URLError as exc:
            raise ApiError(f"{method} {path} -> {exc.reason}") from exc

    def get(self, path: str) -> dict:
        return self.request("GET", path)

    def patch(self, path: str, body: dict) -> dict:
        return self.request("PATCH", path, body)


def article_path(grupo_id: int, chave: str) -> str:
    """Rota do artigo com a chave escapada.

    Chaves têm acento e às vezes hífen tipográfico (U+2010). Sem escapar, o
    urllib estoura ao codificar a linha de requisição em ASCII.
    """
    return f"/api/groups/{grupo_id}/articles/{urllib.parse.quote(chave, safe='')}"


def assert_workspace(api: Api, esperado: str) -> None:
    """Confere em qual workspace o device está antes de escrever.

    O backend resolve o banco pelo `sqliteDbPath` do workspace **ativo do device**
    (`storeFrom(req)`), não por um caminho global. Um device apontando para outro
    workspace grava no banco errado — ou devolve 404 em cada artigo, porque as
    chaves não existem lá. O snapshot de onde saiu o delta vem de um workspace
    específico, então isto não é opcional.
    """
    ativo = api.get("/api/workspaces/active")
    atual = ativo.get("id")
    if atual != esperado:
        raise SystemExit(
            f"Workspace ativo é {atual!r}, mas o delta foi montado para {esperado!r}.\n"
            f"Nome do ativo: {ativo.get('name')!r} · banco: {ativo.get('sqliteDbPath')!r}\n"
            "Ative o workspace certo no app (ou use --join-token dele) antes de aplicar."
        )
    print(f"[apply] workspace confirmado: {atual!r} ({ativo.get('name')!r})")


def authenticate(
    base_url: str,
    auth_token: str | None,
    join_token: str | None,
    device_id: str | None = None,
) -> Api:
    if device_id:
        api = Api(base_url, None, device_id)
        api.get("/api/device/session")   # valida a credencial antes de seguir
        print(f"[apply] device={device_id} (via X-Device-Id)")
        return api

    if auth_token:
        api = Api(base_url, auth_token, None)
        session = api.get("/api/device/session")
        print(f"[apply] sessão existente: device={session.get('deviceId')}")
        return api

    if not join_token:
        raise SystemExit(
            "Sem credencial. Defina REF_AUTH_TOKEN (ou --auth-token), passe "
            "--join-token com um token de convite do workspace, ou --device-id "
            "para o ensaio local."
        )

    device_id = str(uuid.uuid4())
    api = Api(base_url, None, device_id)
    session = api.request(
        "POST", "/api/device/register", {"deviceId": device_id, "label": "qa-apply"}
    )
    if session.get("authToken"):
        api.auth_token = session["authToken"]
    workspace = api.request("POST", "/api/workspaces/join", {"token": join_token})
    print(f"[apply] device novo {device_id} no workspace {workspace.get('name')!r}")
    return api


def load_items(path: Path) -> list[dict]:
    """Normaliza os dois formatos num só: {grupoId, chave, patch, esperado}."""
    payload = json.loads(path.read_text(encoding="utf-8"))
    itens = payload["itens"] if isinstance(payload, dict) else payload
    prontos: list[dict] = []

    for pos, item in enumerate(itens):
        if item.get("grupoId") is None or not item.get("chave"):
            raise SystemExit(f"Item {pos} sem grupoId/chave: {item!r}")

        patch = dict(item.get("patch") or {})
        nota = (item.get("notaProposta") or "").strip()
        if nota:
            patch.setdefault("notes", nota)
        if not patch:
            continue  # item não aprovado (nota apagada na revisão) — ignora

        invalidos = set(patch) - CAMPOS_PERMITIDOS
        if invalidos:
            raise SystemExit(
                f"Item {pos} ({item['chave']}) com campo(s) não permitido(s): "
                f"{sorted(invalidos)}. Permitidos: {sorted(CAMPOS_PERMITIDOS)}"
            )

        prontos.append({
            "grupoId": item["grupoId"],
            "chave": item["chave"],
            "patch": patch,
            "esperado": dict(item.get("esperado") or {}),
        })
    return prontos


def guard_mismatch(atual: dict, esperado: dict) -> list[str]:
    """Campos cujo valor no servidor difere do que o snapshot viu."""
    divergentes = []
    for campo, valor in esperado.items():
        if campo not in CAMPOS_PERMITIDOS:
            continue
        no_servidor = atual.get(campo)
        if campo == "notes":
            iguais = (no_servidor or "").strip() == (valor or "").strip()
        else:
            iguais = no_servidor == valor
        if not iguais:
            divergentes.append(f"{campo}: servidor={no_servidor!r} snapshot={valor!r}")
    return divergentes


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--base-url", default=os.environ.get("REF_BASE_URL", DEFAULT_BASE_URL))
    parser.add_argument("--auth-token", default=os.environ.get("REF_AUTH_TOKEN"))
    parser.add_argument("--join-token", default=None)
    parser.add_argument("--device-id", default=None,
                        help="usa X-Device-Id em vez de token; o backend registra o "
                             "device na hora. Serve para o ensaio local.")
    parser.add_argument("--workspace", default="tese-do-sergio",
                        help="id do workspace que o delta espera; o script recusa "
                             "escrever se o device estiver em outro (--workspace '' desliga)")
    parser.add_argument("--apply", action="store_true",
                        help="grava de verdade (sem isso, só simula)")
    parser.add_argument("--overwrite", action="store_true",
                        help="sobrescreve nota já preenchida no servidor")
    parser.add_argument("--limit", type=int, default=0,
                        help="processa só os N primeiros (útil no ensaio)")
    parser.add_argument("--log", type=Path, default=None)
    args = parser.parse_args()

    itens = load_items(args.input)
    if args.limit:
        itens = itens[:args.limit]
    if not itens:
        print("[apply] nenhum item aprovado no arquivo — nada a fazer.")
        return 0

    modo = "APLICANDO" if args.apply else "dry-run (nada será gravado)"
    print(f"[apply] {len(itens)} item(ns) · {args.base_url} · {modo}")

    api = authenticate(args.base_url, args.auth_token, args.join_token, args.device_id)
    if args.workspace:
        assert_workspace(api, args.workspace)
    log_path = args.log or args.input.with_name(
        f"{args.input.stem}-log-{datetime.now().strftime('%Y%m%d-%H%M%S')}.jsonl"
    )

    contagem = {"gravado": 0, "simulado": 0, "pulado": 0, "divergente": 0, "erro": 0}
    with log_path.open("w", encoding="utf-8") as log:
        for i, item in enumerate(itens, 1):
            path = article_path(item["grupoId"], item["chave"])
            campos = ", ".join(sorted(item["patch"]))
            entrada = {
                "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "grupoId": item["grupoId"],
                "chave": item["chave"],
                "patch": item["patch"],
            }
            try:
                atual = api.get(path)
                divergentes = guard_mismatch(atual, item["esperado"])
                nota_atual = (atual.get("notes") or "").strip()

                if divergentes:
                    entrada |= {"resultado": "divergente", "divergencias": divergentes}
                    contagem["divergente"] += 1
                    print(f"[{i}/{len(itens)}] DIVERGENTE {item['chave']} — mudou desde "
                          f"o snapshot: {'; '.join(divergentes)}")
                elif "notes" in item["patch"] and nota_atual and not args.overwrite:
                    entrada |= {"resultado": "pulado", "notaAtual": nota_atual}
                    contagem["pulado"] += 1
                    print(f"[{i}/{len(itens)}] pulado {item['chave']} — já tem nota")
                elif not args.apply:
                    entrada |= {
                        "resultado": "simulado",
                        "anterior": {k: atual.get(k) for k in item["patch"]},
                    }
                    contagem["simulado"] += 1
                    print(f"[{i}/{len(itens)}] simulado {item['chave']} ({campos})")
                else:
                    anterior = {k: atual.get(k) for k in item["patch"]}
                    api.patch(path, item["patch"])
                    entrada |= {"resultado": "gravado", "anterior": anterior}
                    contagem["gravado"] += 1
                    print(f"[{i}/{len(itens)}] gravado {item['chave']} ({campos})")
            except ApiError as exc:
                entrada |= {"resultado": "erro", "erro": str(exc)}
                contagem["erro"] += 1
                print(f"[{i}/{len(itens)}] ERRO {item['chave']}: {exc}", file=sys.stderr)
            log.write(json.dumps(entrada, ensure_ascii=False) + "\n")

    print("[apply] " + " · ".join(f"{k}={v}" for k, v in contagem.items()))
    print(f"[apply] log: {log_path}")
    if contagem["divergente"]:
        print("[apply] itens divergentes precisam de um snapshot novo antes de reaplicar.")
    if not args.apply:
        print("[apply] rode de novo com --apply para gravar.")
    return 1 if contagem["erro"] else 0


if __name__ == "__main__":
    sys.exit(main())
