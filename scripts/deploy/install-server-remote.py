#!/usr/bin/env python3
"""Instala Referências em servidor Ubuntu zerado via SSH (script local + paramiko)."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import paramiko


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None or value == "":
        if default is not None:
            return default
        print(f"Variável obrigatória ausente: {name}", file=sys.stderr)
        sys.exit(2)
    return value


def reject_shell_meta(name: str, value: str) -> None:
    if any(ch in value for ch in "\"'`$\\\n\r"):
        print(f"Valor inválido em {name}: caracteres proibidos.", file=sys.stderr)
        sys.exit(2)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    host = env("DEPLOY_HOST")
    user = env("DEPLOY_USER", "root")
    password = env("DEPLOY_PASS")
    app_dir = env("DEPLOY_APP_DIR", "/opt/referencias")
    app_user = env("DEPLOY_APP_USER", "referencias")
    git_branch = env("DEPLOY_BRANCH", "main")
    domain = env("INSTALL_DOMAIN", "_")
    install_certbot = env("INSTALL_CERTBOT", "false").lower() in ("1", "true", "yes")
    certbot_email = env("INSTALL_CERTBOT_EMAIL", "")
    install_force = env("INSTALL_FORCE", "0") in ("1", "true", "yes")
    install_script = Path(env("INSTALL_SCRIPT_PATH"))

    for name, value in (
        ("host", host),
        ("user", user),
        ("app_dir", app_dir),
        ("app_user", app_user),
        ("git_branch", git_branch),
        ("domain", domain),
        ("certbot_email", certbot_email),
    ):
        reject_shell_meta(name, value)

    if not install_script.is_file():
        print(f"Script de instalação não encontrado: {install_script}", file=sys.stderr)
        return 1

    if install_certbot and domain == "_":
        print("INSTALL_CERTBOT exige INSTALL_DOMAIN (domínio válido).", file=sys.stderr)
        return 2

    if install_certbot and not certbot_email:
        print("INSTALL_CERTBOT exige INSTALL_CERTBOT_EMAIL.", file=sys.stderr)
        return 2

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=30)

    remote_script = "/tmp/referencias-install.sh"
    timeout_seconds = int(env("INSTALL_TIMEOUT_SECONDS", "1800"))

    try:
        if not install_force:
            probe = f"""set -euo pipefail
if [[ -f '{app_dir}/package.json' ]]; then
  if curl -fsS http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
    echo 'ALREADY_INSTALLED'
    exit 0
  fi
  echo 'PARTIAL_INSTALL'
  exit 0
fi
echo 'FRESH'
"""
            _stdin, stdout, _stderr = client.exec_command(probe, timeout=120)
            probe_out = stdout.read().decode("utf-8", errors="replace").strip()
            exit_status = stdout.channel.recv_exit_status()
            if exit_status != 0:
                print("Falha ao verificar estado do servidor.", file=sys.stderr)
                return exit_status

            if probe_out == "ALREADY_INSTALLED":
                print(
                    "[install] Servidor já parece instalado e saudável "
                    f"({app_dir}). Use publish:server para atualizar código ou "
                    "-Force para reinstalar.",
                    file=sys.stderr,
                )
                return 3

        print(f"[install] Enviando script para {user}@{host} ...", flush=True)
        script_bytes = install_script.read_bytes().replace(b"\r\n", b"\n").replace(b"\r", b"\n")
        with client.open_sftp() as sftp:
            with sftp.file(remote_script, "wb") as remote_file:
                remote_file.write(script_bytes)

        certbot_flag = "true" if install_certbot else "false"
        remote_cmd = f"""set -euo pipefail
chmod +x '{remote_script}'
export APP_DIR='{app_dir}'
export APP_USER='{app_user}'
export GIT_BRANCH='{git_branch}'
export DOMAIN='{domain}'
export INSTALL_CERTBOT='{certbot_flag}'
export CERTBOT_EMAIL='{certbot_email}'
export DEBIAN_FRONTEND=noninteractive
echo '=== referencias install ==='
bash '{remote_script}'
rm -f '{remote_script}'
echo '=== health ==='
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -fsS http://127.0.0.1:3001/api/health; then
    echo
    exit 0
  fi
  sleep 2
done
echo 'health check failed' >&2
exit 1
"""

        print("[install] Executando instalação (pode levar vários minutos)...", flush=True)
        _stdin, stdout, stderr = client.exec_command(
            remote_cmd,
            get_pty=True,
            timeout=timeout_seconds,
        )
        for line in stdout:
            sys.stdout.write(line)
            sys.stdout.flush()
        exit_status = stdout.channel.recv_exit_status()
        err = stderr.read().decode("utf-8", errors="replace")
        if err:
            sys.stderr.write(err)
        if exit_status == 0:
            print(f"[install] Concluído em {host}", flush=True)
        return exit_status
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
