#!/usr/bin/env python3
"""Conexão SSH compartilhada pelos scripts de deploy e backup.

Prefere chave a senha. A senha de root é o pior segredo possível para uma
máquina exposta na internet: vive em texto claro no `deploy.txt`, num secret do
GitHub e no ambiente de cada run, e vale para tudo. A chave fica restrita ao
que o `authorized_keys` permitir e não passa pela rede.

Preferir chave também conserta uma flakiness antiga: a autenticação por senha
neste servidor era recusada de forma intermitente — a mesma senha aceita numa
tag e negada na seguinte — e os scripts contornavam com retry. O sintoma é o de
throttling de senha no sshd; com chave ele não aparece.

Ordem de tentativa:
  1. DEPLOY_KEY       — conteúdo da chave privada (secret do GitHub Actions)
  2. DEPLOY_KEY_FILE  — caminho da chave privada no disco
  3. DEPLOY_PASS      — senha (compatibilidade; emite aviso)

DEPLOY_KEY_PASSPHRASE se aplica às duas primeiras.
"""

from __future__ import annotations

import io
import os
import sys
import time

import paramiko

TIMEOUT = 30
TENTATIVAS = 3

_TIPOS_DE_CHAVE = (
    paramiko.Ed25519Key,
    paramiko.ECDSAKey,
    paramiko.RSAKey,
)


def _carregar_chave(material: str, passphrase: str | None, origem: str):
    """Tenta cada tipo de chave: o paramiko não descobre o formato sozinho."""
    erros: list[str] = []
    for tipo in _TIPOS_DE_CHAVE:
        try:
            return tipo.from_private_key(io.StringIO(material), password=passphrase)
        except paramiko.SSHException as erro:
            erros.append(f"{tipo.__name__}: {erro}")
    raise SystemExit(
        f"Não foi possível ler a chave privada de {origem}.\n  " + "\n  ".join(erros)
    )


def _credencial() -> tuple[str, dict]:
    """Devolve (descrição, kwargs para client.connect)."""
    passphrase = os.environ.get("DEPLOY_KEY_PASSPHRASE") or None

    material = os.environ.get("DEPLOY_KEY", "").strip()
    if material:
        chave = _carregar_chave(material, passphrase, "DEPLOY_KEY")
        return "chave (DEPLOY_KEY)", {"pkey": chave, "look_for_keys": False}

    caminho = os.environ.get("DEPLOY_KEY_FILE", "").strip()
    if caminho:
        try:
            with open(caminho, encoding="utf-8") as arquivo:
                conteudo = arquivo.read()
        except OSError as erro:
            raise SystemExit(f"DEPLOY_KEY_FILE não pôde ser lido: {erro}") from erro
        chave = _carregar_chave(conteudo, passphrase, caminho)
        return f"chave ({caminho})", {"pkey": chave, "look_for_keys": False}

    senha = os.environ.get("DEPLOY_PASS", "")
    if senha:
        print(
            "AVISO: autenticando por senha. Configure DEPLOY_KEY (ou "
            "DEPLOY_KEY_FILE) e remova a senha — ver README, seção Deploy.",
            file=sys.stderr,
            flush=True,
        )
        return "senha (DEPLOY_PASS)", {
            "password": senha,
            "look_for_keys": False,
            "allow_agent": False,
        }

    raise SystemExit(
        "Nenhuma credencial SSH: defina DEPLOY_KEY, DEPLOY_KEY_FILE ou DEPLOY_PASS."
    )


def conectar(
    host: str | None = None,
    user: str | None = None,
    tentativas: int = TENTATIVAS,
    keepalive: int | None = None,
) -> paramiko.SSHClient:
    """Conecta por SSH, repetindo quando a autenticação é recusada.

    O retry ficou de rede de segurança para quem ainda usa senha; com chave a
    primeira tentativa passa.
    """
    host = host or os.environ.get("DEPLOY_HOST", "")
    if not host:
        raise SystemExit("Variável obrigatória ausente: DEPLOY_HOST")
    user = user or os.environ.get("DEPLOY_USER") or "root"

    descricao, credencial = _credencial()

    ultima: Exception | None = None
    for tentativa in range(1, tentativas + 1):
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(host, username=user, timeout=TIMEOUT, **credencial)
            if tentativa > 1:
                print(f"SSH conectou na tentativa {tentativa}.", flush=True)
            if keepalive:
                # Operações longas (backup copiando em disco) deixam a sessão
                # ociosa e o host remoto a derruba (WinError 10054 no Windows).
                transport = client.get_transport()
                if transport is not None:
                    transport.set_keepalive(keepalive)
            return client
        except paramiko.ssh_exception.AuthenticationException as erro:
            client.close()
            ultima = erro
            print(
                f"SSH recusou a autenticação por {descricao} "
                f"(tentativa {tentativa}/{tentativas}).",
                file=sys.stderr,
                flush=True,
            )
            if tentativa < tentativas:
                time.sleep(5 * tentativa)

    raise ultima  # type: ignore[misc]
