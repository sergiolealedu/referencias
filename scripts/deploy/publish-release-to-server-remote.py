#!/usr/bin/env python3
"""Deploy de release no servidor: checkout da tag, build, restart e upload do APK."""

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
    version = env("DEPLOY_VERSION")
    app_dir = env("DEPLOY_APP_DIR", "/opt/referencias")
    pm2_app = env("DEPLOY_PM2_APP", "referencias-api")
    app_user = env("DEPLOY_APP_USER", "referencias")
    apk_local = env("DEPLOY_APK_PATH")

    for name, value in (
        ("tag", tag),
        ("version", version),
        ("app_dir", app_dir),
        ("pm2_app", pm2_app),
        ("app_user", app_user),
    ):
        validate_shell_value(name, value)

    apk_path = Path(apk_local)
    if not apk_path.is_file():
        print(f"APK local não encontrado: {apk_local}", file=sys.stderr)
        return 1

    remote_dir = f"{app_dir}/frontend/dist/downloads"
    remote_apk = f"{remote_dir}/referencias-{version}.apk"

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
echo '=== prepare downloads dir ==='
mkdir -p '{remote_dir}'
chown {app_user}:{app_user} '{remote_dir}'
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
        if exit_status != 0:
            return exit_status

        print(f"=== upload APK => {remote_apk} ===", flush=True)
        sftp = client.open_sftp()
        try:
            sftp.put(str(apk_path), remote_apk)
        finally:
            sftp.close()

        link_cmd = f"""set -euo pipefail
cd '{remote_dir}'
ln -sf 'referencias-{version}.apk' 'referencias-latest.apk'
chown {app_user}:{app_user} 'referencias-{version}.apk'
chmod 644 'referencias-{version}.apk'
"""
        _stdin, stdout, stderr = client.exec_command(link_cmd, timeout=60)
        link_status = stdout.channel.recv_exit_status()
        if link_status != 0:
            sys.stderr.write(stderr.read().decode("utf-8", errors="replace"))
            return link_status

        print(
            f"APK publicado em {remote_apk} (symlink: referencias-latest.apk)",
            flush=True,
        )
        return 0
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
