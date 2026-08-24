#!/usr/bin/env python3
"""Publica o APK de release no servidor (upload + symlink 'latest'), sem tocar no código do servidor."""

from __future__ import annotations

import os
import sys
from pathlib import Path

from _ssh import conectar


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
    user = env("DEPLOY_USER", "root")
    version = env("DEPLOY_VERSION")
    app_dir = env("DEPLOY_APP_DIR", "/opt/referencias")
    app_user = env("DEPLOY_APP_USER", "referencias")
    apk_local = env("DEPLOY_APK_PATH")

    for name, value in (
        ("version", version),
        ("app_dir", app_dir),
        ("app_user", app_user),
    ):
        validate_shell_value(name, value)

    apk_path = Path(apk_local)
    if not apk_path.is_file():
        print(f"APK local não encontrado: {apk_local}", file=sys.stderr)
        return 1

    remote_dir = f"{app_dir}/frontend/dist/downloads"
    remote_apk = f"{remote_dir}/referencias-{version}.apk"

    prepare_cmd = f"""set -euo pipefail
mkdir -p '{remote_dir}'
chown {app_user}:{app_user} '{remote_dir}'
"""

    client = conectar(host, user)

    try:
        _stdin, stdout, stderr = client.exec_command(prepare_cmd, timeout=60)
        prepare_status = stdout.channel.recv_exit_status()
        if prepare_status != 0:
            sys.stderr.write(stderr.read().decode("utf-8", errors="replace"))
            return prepare_status

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
