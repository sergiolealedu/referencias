#!/usr/bin/env python3
"""Executa pull/build/restart no servidor Referências via SSH (senha em env)."""

from __future__ import annotations

import os
import sys

import paramiko


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    host = os.environ["DEPLOY_HOST"]
    user = os.environ.get("DEPLOY_USER", "root")
    password = os.environ["DEPLOY_PASS"]
    branch = os.environ.get("DEPLOY_BRANCH", "main")
    app_dir = os.environ.get("DEPLOY_APP_DIR", "/opt/referencias")
    pm2_app = os.environ.get("DEPLOY_PM2_APP", "referencias-api")

    # Valores controlados pelo script local — ainda assim evitamos aspas no shell.
    for name, value in (
        ("branch", branch),
        ("app_dir", app_dir),
        ("pm2_app", pm2_app),
    ):
        if any(ch in value for ch in "\"'`$\\\n\r"):
            print(f"Valor inválido em {name}: caracteres proibidos.", file=sys.stderr)
            return 2

    cmd = f"""set -euo pipefail
cd '{app_dir}'
echo '=== pull ==='
sudo -u referencias git fetch origin
sudo -u referencias git checkout '{branch}'
sudo -u referencias git pull --ff-only origin '{branch}'
echo '=== commit ==='
sudo -u referencias git log -1 --oneline
echo '=== version ==='
sudo -u referencias node scripts/resolve-build-version.mjs || true
echo '=== build ==='
sudo -u referencias npm ci --no-fund --no-audit
sudo -u referencias npm run build
echo '=== restart ==='
sudo -u referencias pm2 restart '{pm2_app}'
sudo -u referencias pm2 status
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
        _stdin, stdout, stderr = client.exec_command(cmd, get_pty=True, timeout=600)
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
