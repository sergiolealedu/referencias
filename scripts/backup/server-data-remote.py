#!/usr/bin/env python3
"""Backup/restore dos dados relevantes do servidor Referências via SSH/SFTP."""

from __future__ import annotations

import json
import os
import shutil
import sys
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

import paramiko

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "deploy"))
from _ssh import conectar  # noqa: E402  (precisa do sys.path acima)


REMOTE_STAGING = "/tmp/referencias-backup"
REMOTE_ARCHIVE = f"{REMOTE_STAGING}/bundle.tar.gz"


def env(name: str, default: str | None = None) -> str:
    value = os.environ.get(name, default)
    if value is None or value == "":
        raise SystemExit(f"Variável de ambiente obrigatória ausente: {name}")
    return value


def reject_shell_meta(name: str, value: str) -> None:
    if any(ch in value for ch in "\"'`$\\\n\r"):
        raise SystemExit(f"Valor inválido em {name}: caracteres proibidos.")


def connect() -> paramiko.SSHClient:
    # Backups grandes passam minutos copiando em disco local; sem keepalive o host
    # remoto derruba a sessão ociosa (WinError 10054 no Windows).
    return conectar(keepalive=30)


def cleanup_remote(client: paramiko.SSHClient) -> None:
    """Remove o staging remoto. Nunca falha o backup — os dados já estão em disco."""
    try:
        run(client, f"rm -rf '{REMOTE_STAGING}'", timeout=120)
    except Exception as exc:  # noqa: BLE001 — limpeza é best-effort
        print(
            f"[backup] AVISO: não foi possível limpar {REMOTE_STAGING} no servidor ({exc}).\n"
            f"[backup]        Remova manualmente:  ssh <host> rm -rf {REMOTE_STAGING}",
            flush=True,
        )


def run(client: paramiko.SSHClient, cmd: str, timeout: int = 600) -> tuple[int, str]:
    """Executa no servidor, ecoa a saída e devolve (exit_status, saída completa)."""
    _stdin, stdout, stderr = client.exec_command(cmd, get_pty=True, timeout=timeout)
    captured: list[str] = []
    for line in stdout:
        captured.append(line)
        sys.stdout.write(line)
        sys.stdout.flush()
    exit_status = stdout.channel.recv_exit_status()
    err = stderr.read().decode("utf-8", errors="replace")
    if err:
        sys.stderr.write(err)
    return exit_status, "".join(captured)


def session_alive(client: paramiko.SSHClient) -> bool:
    transport = client.get_transport()
    return transport is not None and transport.is_active()


def sftp_get(
    client: paramiko.SSHClient, remote: str, local: Path, retries: int = 5
) -> paramiko.SSHClient:
    """Baixa via SFTP para disco local e só então copia ao destino final.

    Evita falhas de size mismatch do paramiko em pastas de nuvem (ex.: Google Drive).
    Se a sessão cair no meio (pacotes de GB com PDFs), reconecta e retoma do byte
    em que parou. Devolve o cliente em uso, que pode ser uma conexão nova.
    """
    local.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    fd, tmp_name = tempfile.mkstemp(prefix="referencias-sftp-", suffix=".bin")
    os.close(fd)
    tmp_path = Path(tmp_name)

    try:
        for attempt in range(1, retries + 1):
            try:
                if not session_alive(client):
                    print("[backup] Sessão SSH caiu; reconectando...", flush=True)
                    client.close()
                    client = connect()

                with client.open_sftp() as sftp:
                    remote_size = int(sftp.stat(remote).st_size)
                    offset = tmp_path.stat().st_size
                    if offset > remote_size:
                        offset = 0
                    if offset:
                        print(
                            f"[backup] Retomando em {offset // (1024 * 1024)} MB"
                            f" de {remote_size // (1024 * 1024)} MB",
                            flush=True,
                        )
                    with sftp.open(remote, "rb") as remote_file, open(
                        tmp_path, "r+b" if offset else "wb"
                    ) as local_file:
                        remote_file.seek(offset)
                        local_file.seek(offset)
                        local_file.truncate()
                        remote_file.prefetch(remote_size)
                        shutil.copyfileobj(remote_file, local_file, length=1024 * 1024)

                local_size = tmp_path.stat().st_size
                if local_size != remote_size:
                    raise OSError(
                        f"size mismatch após download: local {local_size} != remoto {remote_size}"
                    )

                shutil.copy2(tmp_path, local)

                # Pastas de nuvem podem reportar tamanho atrasado; espera um pouco e confere.
                for _ in range(10):
                    try:
                        if local.stat().st_size == remote_size:
                            return client
                    except OSError:
                        pass
                    time.sleep(0.3)

                final_size = local.stat().st_size
                if final_size != remote_size:
                    raise OSError(
                        f"size mismatch no destino final: {final_size} != {remote_size} ({local})"
                    )
                return client
            except Exception as exc:  # noqa: BLE001 — retry em falhas transitórias de rede/Drive
                last_error = exc
                print(
                    f"[backup] Falha no download (tentativa {attempt}/{retries}): {exc}",
                    flush=True,
                )
                time.sleep(2.0 * attempt)
    finally:
        tmp_path.unlink(missing_ok=True)

    assert last_error is not None
    raise last_error


def run_capture(client: paramiko.SSHClient, cmd: str, timeout: int = 600) -> bytes:
    """Executa sem pty e devolve a saída crua — para saída que o script precisa ler."""
    _stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout)
    out = stdout.read()
    status = stdout.channel.recv_exit_status()
    if status != 0:
        err = stderr.read().decode("utf-8", errors="replace")
        raise OSError(f"comando remoto falhou ({status}): {err.strip()}")
    return out


def list_remote_pdfs(client: paramiko.SSHClient, root: str) -> dict[str, tuple[int, int]]:
    """{caminho relativo: (tamanho, mtime em segundos)} dos arquivos sob root."""
    raw = run_capture(
        client,
        f"[ -d '{root}' ] && find '{root}' -type f -printf '%P\\0%s\\0%T@\\0' || true",
    )
    parts = raw.split(b"\0")
    files: dict[str, tuple[int, int]] = {}
    for i in range(0, len(parts) - 2, 3):
        rel = parts[i].decode("utf-8", errors="surrogateescape")
        files[rel] = (int(parts[i + 1]), int(float(parts[i + 2])))
    return files


def find_pdf_base(local_dir: Path, labels: tuple[str, ...]) -> Path | None:
    """Backup anterior mais recente com PDFs completos, para servir de base."""
    candidates = sorted(
        (p for p in local_dir.parent.glob("server-*") if p.is_dir() and p != local_dir),
        key=lambda p: p.name,
        reverse=True,
    )
    for cand in candidates:
        try:
            manifest = json.loads((cand / "manifest.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not manifest.get("includePdfs"):
            continue
        remote = manifest.get("pdfCountRemote") or {}
        local = manifest.get("pdfCountLocal") or {}
        if all(remote.get(label, 0) == local.get(label, 0) for label in labels):
            return cand
    return None


def sync_pdfs(
    client: paramiko.SSHClient,
    pdf_roots: list[tuple[str, str]],
    remote_files: dict[str, dict[str, tuple[int, int]]],
    local_dir: Path,
) -> tuple[paramiko.SSHClient, dict]:
    """Monta os PDFs do backup: copia do backup anterior o que não mudou (mesmo
    tamanho e mtime) e baixa só o resto, arquivo por arquivo.

    Cada backup continua completo e autossuficiente — o restore e o congelamento
    de um snapshot não dependem de nenhum outro. O que o incremental economiza é
    a transferência pela rede, que era onde as quedas de conexão derrubavam tudo.
    """
    labels = tuple(label for label, _ in pdf_roots)
    base = find_pdf_base(local_dir, labels)
    print(
        f"[backup] Base incremental: {base.name if base else '(nenhuma — baixando tudo)'}",
        flush=True,
    )
    copied = downloaded = 0
    downloaded_bytes = 0

    for label, root in pdf_roots:
        files = remote_files.get(label, {})
        pending: list[tuple[str, int, int]] = []
        for rel, (size, mtime) in sorted(files.items()):
            dest = local_dir / label / rel
            src = base / label / rel if base else None
            if src is not None:
                try:
                    st = src.stat()
                except OSError:
                    st = None
                if st is not None and st.st_size == size and int(st.st_mtime) == mtime:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dest)
                    copied += 1
                    continue
            pending.append((rel, size, mtime))

        if pending:
            print(f"[backup] {label}/: baixando {len(pending)} arquivo(s) novo(s) ou alterado(s)", flush=True)
        for rel, size, mtime in pending:
            dest = local_dir / label / rel
            client = sftp_get(client, f"{root}/{rel}", dest)
            os.utime(dest, (mtime, mtime))
            downloaded += 1
            downloaded_bytes += size

    print(
        f"[backup] PDFs: {copied} copiado(s) da base, {downloaded} baixado(s) "
        f"(~{downloaded_bytes / (1024 * 1024):.1f} MB pela rede)",
        flush=True,
    )
    return client, {
        "base": base.name if base else None,
        "copied": copied,
        "downloaded": downloaded,
        "downloadedBytes": downloaded_bytes,
    }


def sftp_put(client: paramiko.SSHClient, local: Path, remote: str) -> None:
    # Envia a partir de cópia em temp local — mais estável com Google Drive.
    fd, tmp_name = tempfile.mkstemp(prefix="referencias-sftp-put-", suffix=".bin")
    os.close(fd)
    tmp_path = Path(tmp_name)
    try:
        shutil.copy2(local, tmp_path)
        with client.open_sftp() as sftp:
            with open(tmp_path, "rb") as local_file, sftp.open(remote, "wb") as remote_file:
                shutil.copyfileobj(local_file, remote_file, length=1024 * 1024)
            remote_size = int(sftp.stat(remote).st_size)
        local_size = tmp_path.stat().st_size
        if remote_size != local_size:
            raise OSError(
                f"size mismatch no upload: remoto {remote_size} != local {local_size}"
            )
    finally:
        tmp_path.unlink(missing_ok=True)


def write_manifest(dest: Path, payload: dict) -> None:
    dest.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def list_backup_files(backup_dir: Path, exclude_dirs: tuple[str, ...] = ()) -> list[str]:
    names: list[str] = []
    for path in sorted(backup_dir.rglob("*")):
        if not path.is_file() or path.name == "manifest.json":
            continue
        rel = path.relative_to(backup_dir)
        if rel.parts and rel.parts[0] in exclude_dirs:
            continue
        names.append(rel.as_posix())
    return names


def count_files(directory: Path) -> int:
    if not directory.is_dir():
        return 0
    return sum(1 for path in directory.rglob("*") if path.is_file())


def dir_size(directory: Path) -> int:
    if not directory.is_dir():
        return 0
    return sum(path.stat().st_size for path in directory.rglob("*") if path.is_file())


def do_backup(client: paramiko.SSHClient) -> int:
    app_dir = os.environ.get("DEPLOY_APP_DIR", "/opt/referencias")
    app_user = os.environ.get("DEPLOY_APP_USER", "referencias")
    pm2_app = os.environ.get("DEPLOY_PM2_APP", "referencias-api")
    pdf_dir = os.environ.get("DEPLOY_PDF_DIR", "/var/lib/referencias/pdfs")
    include_pdfs = os.environ.get("BACKUP_INCLUDE_PDFS", "1") != "0"
    local_dir = Path(env("BACKUP_LOCAL_DIR"))

    for name, value in (
        ("app_dir", app_dir),
        ("app_user", app_user),
        ("pm2_app", pm2_app),
        ("pdf_dir", pdf_dir),
    ):
        reject_shell_meta(name, value)

    data_dir = f"{app_dir}/data"
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    local_dir.mkdir(parents=True, exist_ok=True)

    print(f"[backup] Empacotando dados em {app_dir}/data ...", flush=True)

    # Os PDFs podem estar na raiz configurada em allowedPdfRoots (pdf_dir) e/ou em
    # <app_dir>/data/pdfs, que é onde a app grava os anexos por workspace. As duas
    # origens entram no backup, cada uma na sua subpasta. Elas ficam fora do pacote
    # compactado: são baixadas uma a uma, e só as que o backup anterior não tem.
    pdf_roots = [
        ("pdfs", pdf_dir),
        ("data-pdfs", f"{app_dir}/data/pdfs"),
    ]
    for label, root in pdf_roots:
        reject_shell_meta(f"pdf_root:{label}", root)

    cmd = f"""set -euo pipefail
APP_USER='{app_user}'
PM2_APP='{pm2_app}'
DATA_DIR='{data_dir}'
STAGE='{REMOTE_STAGING}/stage'
ARCHIVE='{REMOTE_ARCHIVE}'

rm -rf '{REMOTE_STAGING}'
mkdir -p "$STAGE"

restart_api() {{
  sudo -u "$APP_USER" pm2 restart "$PM2_APP" 2>/dev/null \
    || sudo -u "$APP_USER" pm2 start npm --name "$PM2_APP" -- start --cwd '{app_dir}' || true
}}

echo '[backup] Parando API para cópia consistente do SQLite...'
sudo -u "$APP_USER" pm2 stop "$PM2_APP" 2>/dev/null || true
# Qualquer falha daqui até o restart deixaria a API parada: religa na saída.
trap 'echo "[backup] Falha — religando API..."; restart_api' EXIT
sleep 1

copy_sqlite() {{
  local src="$1"
  local base
  base="$(basename "$src")"
  if [[ -f "$src" ]]; then
    cp -a "$src" "$STAGE/$base"
    # -wal/-shm só existem com conexão aberta ou sem checkpoint: a ausência é normal.
    for suffix in -wal -shm; do
      if [[ -f "${{src}}${{suffix}}" ]]; then
        cp -a "${{src}}${{suffix}}" "$STAGE/${{base}}${{suffix}}"
      fi
    done
  fi
}}

copy_sqlite "$DATA_DIR/referencias.db"
copy_sqlite "$DATA_DIR/registry.db"
[[ -f "$DATA_DIR/workspaces.json" ]] && cp -a "$DATA_DIR/workspaces.json" "$STAGE/workspaces.json"
[[ -f '{app_dir}/app.config.json' ]] && cp -a '{app_dir}/app.config.json' "$STAGE/app.config.json"


echo '[backup] Reiniciando API...'
trap - EXIT
restart_api

if [[ ! -f "$STAGE/referencias.db" ]]; then
  echo '[backup] ERRO: referencias.db não encontrado no servidor.' >&2
  exit 1
fi

tar -C "$STAGE" -czf "$ARCHIVE" .
ls -lh "$ARCHIVE"
"""

    status, _ = run(client, cmd)
    if status != 0:
        return status

    remote_files: dict[str, dict[str, tuple[int, int]]] = {}
    if include_pdfs:
        remote_files = {label: list_remote_pdfs(client, root) for label, root in pdf_roots}
    remote_counts = {label: len(files) for label, files in remote_files.items()}

    # Download + extração em disco local; só depois copia para o destino
    # (ex.: Google Drive), evitando size mismatch do SFTP/paramiko.
    with tempfile.TemporaryDirectory(prefix="referencias-backup-") as tmp:
        tmp_dir = Path(tmp)
        archive_local = tmp_dir / "bundle.tar.gz"
        extract_dir = tmp_dir / "extract"
        extract_dir.mkdir()

        print(f"[backup] Baixando pacote (temp local)...", flush=True)
        client = sftp_get(client, REMOTE_ARCHIVE, archive_local)

        # Limpa o servidor logo após o download: a cópia para pastas de nuvem pode levar
        # minutos e deixar a sessão SSH ociosa a ponto de ser derrubada pelo host remoto.
        cleanup_remote(client)

        print("[backup] Extraindo pacote...", flush=True)
        with tarfile.open(archive_local, "r:gz") as tar:
            try:
                tar.extractall(path=extract_dir, filter="data")
            except TypeError:
                tar.extractall(path=extract_dir)

        print(f"[backup] Copiando para {local_dir} ...", flush=True)
        local_dir.mkdir(parents=True, exist_ok=True)
        for path in sorted(extract_dir.rglob("*")):
            if not path.is_file():
                continue
            rel = path.relative_to(extract_dir)
            dest = local_dir / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, dest)

        incremental = None
        if include_pdfs:
            client, incremental = sync_pdfs(client, pdf_roots, remote_files, local_dir)

        pdf_labels = tuple(label for label, _ in pdf_roots)
        files = list_backup_files(local_dir, exclude_dirs=pdf_labels)
        local_counts = {label: count_files(local_dir / label) for label in pdf_labels}
        pdf_bytes = sum(dir_size(local_dir / label) for label in pdf_labels)

        manifest = {
            "createdAt": datetime.now(timezone.utc).isoformat(),
            "stamp": stamp,
            "host": env("DEPLOY_HOST"),
            "appDir": app_dir,
            "pdfDir": pdf_dir,
            "includePdfs": include_pdfs,
            "pdfRoots": {label: root for label, root in pdf_roots},
            "pdfCountRemote": remote_counts,
            "pdfCountLocal": local_counts,
            "pdfTotal": sum(local_counts.values()),
            "pdfBytes": pdf_bytes,
            "pdfIncremental": incremental,
            "files": files,
        }
        write_manifest(local_dir / "manifest.json", manifest)

    data_bytes = sum((local_dir / f).stat().st_size for f in files)
    print(f"[backup] Concluído: {local_dir}", flush=True)
    print(
        f"[backup] Dados: {len(files)} arquivo(s) (~{data_bytes / (1024 * 1024):.1f} MB)",
        flush=True,
    )
    for name in files:
        print(f"  - {name}", flush=True)

    if not include_pdfs:
        print("[backup] PDFs: ignorados (-ExcludePdfs)", flush=True)
        return 0

    total_local = sum(local_counts.values())
    total_remote = sum(remote_counts.get(label, 0) for label in local_counts)
    print(
        f"[backup] PDFs/anexos: {total_local} arquivo(s) "
        f"(~{pdf_bytes / (1024 * 1024):.1f} MB)",
        flush=True,
    )
    for label, root in pdf_roots:
        got = local_counts.get(label, 0)
        expected = remote_counts.get(label, 0)
        mark = "OK " if got == expected else "!! "
        print(f"  {mark}{label}/  {root}: {got} de {expected}", flush=True)

    if total_local != total_remote:
        print(
            f"[backup] ERRO: o servidor tem {total_remote} PDF(s), mas apenas "
            f"{total_local} vieram no pacote.",
            file=sys.stderr,
            flush=True,
        )
        return 1

    if total_local == 0:
        print(
            "[backup] AVISO: nenhum PDF encontrado no servidor — confira se as pastas "
            f"{', '.join(root for _, root in pdf_roots)} são as corretas.",
            flush=True,
        )

    return 0


def do_restore(client: paramiko.SSHClient) -> int:
    app_dir = os.environ.get("DEPLOY_APP_DIR", "/opt/referencias")
    app_user = os.environ.get("DEPLOY_APP_USER", "referencias")
    pm2_app = os.environ.get("DEPLOY_PM2_APP", "referencias-api")
    pdf_dir = os.environ.get("DEPLOY_PDF_DIR", "/var/lib/referencias/pdfs")
    include_pdfs = os.environ.get("BACKUP_INCLUDE_PDFS", "1") != "0"
    local_dir = Path(env("BACKUP_LOCAL_DIR"))

    for name, value in (
        ("app_dir", app_dir),
        ("app_user", app_user),
        ("pm2_app", pm2_app),
        ("pdf_dir", pdf_dir),
    ):
        reject_shell_meta(name, value)

    db_path = local_dir / "referencias.db"
    if not db_path.is_file():
        print(f"[restore] ERRO: referencias.db não encontrado em {local_dir}", file=sys.stderr)
        return 1

    with tempfile.TemporaryDirectory(prefix="referencias-restore-") as tmp:
        archive_local = Path(tmp) / "bundle.tar.gz"
        print(f"[restore] Empacotando {local_dir} ...", flush=True)
        with tarfile.open(archive_local, "w:gz") as tar:
            for path in sorted(local_dir.rglob("*")):
                if not path.is_file() or path.name == "manifest.json":
                    continue
                rel = path.relative_to(local_dir)
                if not include_pdfs and rel.parts and rel.parts[0] in ("pdfs", "data-pdfs"):
                    continue
                tar.add(path, arcname=rel.as_posix())

        print("[restore] Enviando pacote ao servidor...", flush=True)
        run(client, f"rm -rf '{REMOTE_STAGING}' && mkdir -p '{REMOTE_STAGING}'")
        sftp_put(client, archive_local, REMOTE_ARCHIVE)

    data_dir = f"{app_dir}/data"
    cmd = f"""set -euo pipefail
APP_USER='{app_user}'
PM2_APP='{pm2_app}'
APP_DIR='{app_dir}'
DATA_DIR='{data_dir}'
PDF_DIR='{pdf_dir}'
STAGE='{REMOTE_STAGING}/stage'
ARCHIVE='{REMOTE_ARCHIVE}'
INCLUDE_PDFS='{"1" if include_pdfs else "0"}'

mkdir -p "$STAGE"
tar -C "$STAGE" -xzf "$ARCHIVE"
[[ -f "$STAGE/referencias.db" ]] || {{ echo '[restore] ERRO: referencias.db ausente no pacote.' >&2; exit 1; }}

echo '[restore] Parando API...'
sudo -u "$APP_USER" pm2 stop "$PM2_APP" 2>/dev/null || true
sleep 1

stamp="$(date +%Y%m%d-%H%M%S)"
pre="$DATA_DIR/backups/pre-restore-$stamp"
mkdir -p "$pre"
for f in referencias.db referencias.db-wal referencias.db-shm registry.db registry.db-wal registry.db-shm workspaces.json; do
  [[ -e "$DATA_DIR/$f" ]] && cp -a "$DATA_DIR/$f" "$pre/" || true
done
[[ -f "$APP_DIR/app.config.json" ]] && cp -a "$APP_DIR/app.config.json" "$pre/" || true
echo "[restore] Snapshot pré-restore: $pre"

install_sqlite() {{
  local name="$1"
  rm -f "$DATA_DIR/$name" "$DATA_DIR/$name-wal" "$DATA_DIR/$name-shm"
  if [[ -f "$STAGE/$name" ]]; then
    cp -a "$STAGE/$name" "$DATA_DIR/$name"
    for suffix in -wal -shm; do
      if [[ -f "$STAGE/${{name}}${{suffix}}" ]]; then
        cp -a "$STAGE/${{name}}${{suffix}}" "$DATA_DIR/${{name}}${{suffix}}"
      fi
    done
    chown "$APP_USER:$APP_USER" "$DATA_DIR/$name"*
    chmod 640 "$DATA_DIR/$name"*
  fi
}}

install_sqlite referencias.db
install_sqlite registry.db

if [[ -f "$STAGE/workspaces.json" ]]; then
  cp -a "$STAGE/workspaces.json" "$DATA_DIR/workspaces.json"
  chown "$APP_USER:$APP_USER" "$DATA_DIR/workspaces.json"
  chmod 640 "$DATA_DIR/workspaces.json"
fi

if [[ -f "$STAGE/app.config.json" ]]; then
  cp -a "$STAGE/app.config.json" "$APP_DIR/app.config.json"
  chown "$APP_USER:$APP_USER" "$APP_DIR/app.config.json"
fi

restore_pdf_root() {{
  local label="$1"
  local dest="$2"
  [[ -d "$STAGE/$label" ]] || return 0
  echo "[restore] Restaurando $(find "$STAGE/$label" -type f | wc -l) arquivo(s) em $dest ..."
  mkdir -p "$dest"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "$STAGE/$label/" "$dest/"
  else
    rm -rf "${{dest:?}}"/*
    cp -a "$STAGE/$label/." "$dest/"
  fi
  chown -R "$APP_USER:$APP_USER" "$dest"
}}

if [[ "$INCLUDE_PDFS" == "1" ]]; then
  restore_pdf_root pdfs "$PDF_DIR"
  restore_pdf_root data-pdfs "$DATA_DIR/pdfs"
fi

echo '[restore] Reiniciando API...'
sudo -u "$APP_USER" pm2 restart "$PM2_APP" 2>/dev/null \
  || sudo -u "$APP_USER" pm2 start npm --name "$PM2_APP" -- start --cwd "$APP_DIR"

echo '[restore] Health check...'
for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
  if curl -fsS http://127.0.0.1:3001/api/health >/dev/null 2>&1; then
    echo "[restore] API OK: $(curl -fsS http://127.0.0.1:3001/api/health)"
    rm -rf '{REMOTE_STAGING}'
    exit 0
  fi
  sleep 2
done
echo '[restore] ERRO: API não respondeu após restore.' >&2
exit 1
"""

    status, _ = run(client, cmd)
    if status == 0:
        print(f"[restore] Concluído a partir de {local_dir}", flush=True)
    return status


def do_list(client: paramiko.SSHClient) -> int:
    app_dir = os.environ.get("DEPLOY_APP_DIR", "/opt/referencias")
    pdf_dir = os.environ.get("DEPLOY_PDF_DIR", "/var/lib/referencias/pdfs")
    reject_shell_meta("app_dir", app_dir)
    reject_shell_meta("pdf_dir", pdf_dir)

    cmd = f"""set -euo pipefail
DATA_DIR='{app_dir}/data'
PDF_DIR='{pdf_dir}'
echo "Host data: $DATA_DIR"
for f in referencias.db registry.db workspaces.json; do
  if [[ -e "$DATA_DIR/$f" ]]; then
    ls -lh "$DATA_DIR/$f"
  else
    echo "  (ausente) $f"
  fi
done
for f in referencias.db-wal referencias.db-shm registry.db-wal registry.db-shm; do
  [[ -e "$DATA_DIR/$f" ]] && ls -lh "$DATA_DIR/$f" || true
done
report_pdf_root() {{
  local src="$1"
  if [[ -d "$src" ]]; then
    echo "PDFs: $src -> $(find "$src" -type f 2>/dev/null | wc -l) arquivo(s) ($(du -sh "$src" 2>/dev/null | cut -f1))"
  else
    echo "PDFs: $src -> (pasta ausente)"
  fi
}}

report_pdf_root "$PDF_DIR"
report_pdf_root "$DATA_DIR/pdfs"
"""
    status, _ = run(client, cmd)
    return status


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

    action = env("BACKUP_ACTION").lower()
    client = connect()
    try:
        if action == "backup":
            return do_backup(client)
        if action == "restore":
            return do_restore(client)
        if action == "list":
            return do_list(client)
        print(f"Ação desconhecida: {action}", file=sys.stderr)
        return 2
    finally:
        client.close()


if __name__ == "__main__":
    raise SystemExit(main())
