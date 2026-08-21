#!/usr/bin/env python3
"""Deploy do servidor: checkout da tag, build e restart do PM2 (sem Android)."""

from __future__ import annotations

import os
import sys
import time

import paramiko


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None or value == "":
        if default is not None:
            return default
        print(f"Variável obrigatória ausente: {name}", file=sys.stderr)
        sys.exit(2)
    return value


def validate_shell_value(name: str, value: str) -> None:
    if any(ch in value for ch in "\"'`$\\\n\r"):
        print(f"Valor inválido em {name}: caracteres proibidos.", file=sys.stderr)
        sys.exit(2)


def conectar(host: str, user: str, password: str, tentativas: int = 3):
    """Conecta por SSH tentando de novo em caso de recusa.

    A autenticação por senha neste servidor falha de forma intermitente — a
    mesma senha é aceita numa tag e recusada na seguinte, e o sshd responde
    AuthenticationException (recusa real, não conexão caída). Enquanto a causa
    não for eliminada (migrar para chave é o conserto de fundo), uma segunda
    tentativa evita perder o deploy inteiro por isso.
    """
    ultima: Exception | None = None
    for tentativa in range(1, tentativas + 1):
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        try:
            client.connect(host, username=user, password=password, timeout=30)
            if tentativa > 1:
                print(f"SSH conectou na tentativa {tentativa}.", flush=True)
            return client
        except paramiko.ssh_exception.AuthenticationException as erro:
            client.close()
            ultima = erro
            print(
                f"SSH recusou a autenticação (tentativa {tentativa}/{tentativas}).",
                file=sys.stderr,
                flush=True,
            )
            if tentativa < tentativas:
                time.sleep(5 * tentativa)
    raise ultima  # type: ignore[misc]


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    host = env("DEPLOY_HOST")
    password = env("DEPLOY_PASS")
    user = env("DEPLOY_USER", "root")
    tag = env("DEPLOY_TAG")
    app_dir = env("DEPLOY_APP_DIR", "/opt/referencias")
    pm2_app = env("DEPLOY_PM2_APP", "referencias-api")
    app_user = env("DEPLOY_APP_USER", "referencias")
    # Repo privado: o clone do droplet não tem credencial e o git ficava
    # esperando usuário/senha num prompt que nunca vem — o deploy não falhava,
    # travava, até o paramiko estourar o timeout de leitura. O token do próprio
    # run resolve sem guardar segredo nenhum na máquina.
    repo = os.environ.get("DEPLOY_REPO", "").strip()
    repo_token = os.environ.get("DEPLOY_REPO_TOKEN", "").strip()

    for name, value in (
        ("tag", tag),
        ("repo", repo),
        ("app_dir", app_dir),
        ("pm2_app", pm2_app),
        ("app_user", app_user),
    ):
        validate_shell_value(name, value)

    # Sem token (repo público de novo), o remoto configurado basta.
    if repo and repo_token:
        validate_shell_value("repo_token", repo_token)
        fetch_origem = f"'https://x-access-token:{repo_token}@github.com/{repo}.git'"
    else:
        fetch_origem = "origin"

    deploy_cmd = f"""set -euo pipefail
cd '{app_dir}'
echo '=== fetch tag {tag} ==='
sudo -u {app_user} env GIT_TERMINAL_PROMPT=0 timeout 180 git fetch {fetch_origem} --tags --force
sudo -u {app_user} git checkout '{tag}'
echo '=== commit ==='
sudo -u {app_user} git log -1 --oneline
echo '=== build ==='
sudo -u {app_user} npm ci --no-fund --no-audit
sudo -u {app_user} npm run build
echo '=== restart ==='
sudo -u {app_user} pm2 restart '{pm2_app}'
sudo -u {app_user} pm2 status
echo '=== health ==='
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS http://127.0.0.1:3001/api/health; then
    echo
    exit 0
  fi
  sleep 2
done
echo 'health check failed'
exit 1
"""

    client = conectar(host, user, password)

    try:
        _stdin, stdout, stderr = client.exec_command(deploy_cmd, get_pty=True, timeout=900)
        for line in stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
        exit_status = stdout.channel.recv_exit_status()
        err = stderr.read().decode("utf-8", errors="replace")
        if err:
            sys.stderr.write(err)
        return exit_status
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
