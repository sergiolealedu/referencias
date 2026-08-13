#!/usr/bin/env python3
"""Deploy do servidor: checkout da tag, build e restart do PM2 (sem Android)."""

from __future__ import annotations

import os
import sys

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

    for name, value in (
        ("tag", tag),
        ("app_dir", app_dir),
        ("pm2_app", pm2_app),
        ("app_user", app_user),
    ):
        validate_shell_value(name, value)

    deploy_cmd = f"""set -euo pipefail
cd '{app_dir}'
echo '=== fetch tag {tag} ==='
sudo -u {app_user} git fetch origin --tags
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

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect(host, username=user, password=password, timeout=30)

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
