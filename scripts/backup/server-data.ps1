#Requires -Version 5.1
<#
.SYNOPSIS
  Backup e restore dos dados relevantes do servidor Referências para a máquina local.

.DESCRIPTION
  Lê credenciais em deploy.txt e, via SSH/SFTP (Python + paramiko), copia ou
  restaura os arquivos de dados do servidor.

  Dados incluídos por padrão:
    - data/referencias.db (+ -wal/-shm se existirem)
    - data/registry.db (+ -wal/-shm se existirem)
    - data/workspaces.json
    - app.config.json
    - pasta de PDFs (/var/lib/referencias/pdfs)

  Use -ExcludePdfs para omitir os PDFs.

  Cada backup gera uma pasta com data e hora em:
    G:\Meu Drive\doutorado\app\backup\server-YYYYMMDD-HHmmss\
  (pasta-pai configurável com -BackupDir).

.PARAMETER Action
  Backup | Restore | List

.PARAMETER BackupDir
  Pasta-pai dos backups (padrão: G:\Meu Drive\doutorado\app\backup).
  Em Backup: cria server-YYYYMMDD-HHmmss dentro dela.
  Em Restore: pasta-pai para -Latest, ou caminho direto de um snapshot
  (pasta que contém referencias.db).

.PARAMETER Latest
  Em Restore, usa o backup mais recente (server-*) em -BackupDir.

.PARAMETER ExcludePdfs
  Não inclui/restaura a pasta de PDFs.

.PARAMETER DeployFile
  Caminho do arquivo de credenciais (padrão: deploy.txt na raiz do repo).

.PARAMETER SkipConfirm
  Não pede confirmação interativa (útil em restore).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\backup\server-data.ps1 -Action Backup

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\backup\server-data.ps1 -Action Backup -BackupDir D:\backups\refs

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\backup\server-data.ps1 -Action Backup -ExcludePdfs

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\backup\server-data.ps1 -Action Restore -Latest

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\backup\server-data.ps1 -Action Restore -BackupDir "G:\Meu Drive\doutorado\app\backup\server-20260704-143015"

.EXAMPLE
  npm run backup:server
  npm run restore:server
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('Backup', 'Restore', 'List')]
  [string] $Action,

  [string] $BackupDir = 'G:\Meu Drive\doutorado\app\backup',

  [switch] $Latest,

  [switch] $ExcludePdfs,

  [string] $DeployFile = '',

  [switch] $SkipConfirm,

  [string] $RepoRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $RepoRoot = (Resolve-Path (Join-Path $scriptDir '../..')).Path
}

function Write-Step([string] $Message) {
  Write-Host "[server-data] $Message" -ForegroundColor Cyan
}

function Write-WarnStep([string] $Message) {
  Write-Host "[server-data] $Message" -ForegroundColor Yellow
}

function Normalize-DeployKey([string] $Key) {
  $normalized = $Key.Trim().ToLowerInvariant()
  $normalized = $normalized -replace '\s+', ' '
  $map = @{
    'senha'            = 'password'
    'password'         = 'password'
    'pass'             = 'password'
    'ip'               = 'host'
    'ip do servidor'   = 'host'
    'host'             = 'host'
    'servidor'         = 'host'
    'server'           = 'host'
    'usuario'          = 'user'
    'user'             = 'user'
    'ssh_user'         = 'user'
    'branch'           = 'branch'
    'app_dir'          = 'app_dir'
    'app dir'          = 'app_dir'
    'pm2_app'          = 'pm2_app'
    'pm2 app'          = 'pm2_app'
    'app_user'         = 'app_user'
    'app user'         = 'app_user'
    'pdf_dir'          = 'pdf_dir'
    'pdf dir'          = 'pdf_dir'
  }
  if ($map.ContainsKey($normalized)) {
    return $map[$normalized]
  }
  return ($normalized -replace '[^a-z0-9]+', '_')
}

function Read-DeployConfig([string] $Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Arquivo de deploy não encontrado: $Path`nCrie a partir de deploy.txt.example e preencha senha e IP."
  }

  $config = @{
    password = ''
    host     = ''
    user     = 'root'
    branch   = 'main'
    app_dir  = '/opt/referencias'
    pm2_app  = 'referencias-api'
    app_user = 'referencias'
    pdf_dir  = '/var/lib/referencias/pdfs'
  }

  $lineNumber = 0
  foreach ($rawLine in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $lineNumber++
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#') -or $line.StartsWith(';')) {
      continue
    }
    $parts = $line -split ':', 2
    if ($parts.Count -lt 2) {
      throw "Linha inválida em deploy.txt ($lineNumber): esperado 'chave: valor'."
    }
    $key = Normalize-DeployKey $parts[0]
    $value = $parts[1].Trim()
    if (-not $value) {
      continue
    }
    $config[$key] = $value
  }

  if (-not $config.host) {
    throw "deploy.txt sem 'ip do servidor' (ou host)."
  }
  if (-not $config.password) {
    throw "deploy.txt sem 'senha'."
  }

  return $config
}

function Assert-PythonParamiko {
  $python = Get-Command python -ErrorAction SilentlyContinue
  if (-not $python) {
    $python = Get-Command python3 -ErrorAction SilentlyContinue
  }
  if (-not $python) {
    throw 'Python não encontrado no PATH. Instale Python 3 e o pacote paramiko (pip install paramiko).'
  }

  & $python.Source -c "import paramiko" 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw 'Pacote Python paramiko não encontrado. Execute: pip install paramiko'
  }

  return $python.Source
}

function Resolve-BackupPath {
  param(
    [string] $Path,
    [string] $Root
  )
  if (-not [System.IO.Path]::IsPathRooted($Path)) {
    $Path = Join-Path $Root $Path
  }
  return $Path
}

function Resolve-BackupDirForRestore {
  param(
    [string] $Requested,
    [switch] $UseLatest,
    [string] $Root
  )

  $path = Resolve-BackupPath -Path $Requested -Root $Root

  # Caminho direto de um snapshot (contém referencias.db).
  if ((Test-Path -LiteralPath $path) -and (Test-Path -LiteralPath (Join-Path $path 'referencias.db'))) {
    if ($UseLatest) {
      Write-WarnStep "-Latest ignorado: -BackupDir já aponta para um snapshot."
    }
    return (Resolve-Path -LiteralPath $path).Path
  }

  if (-not $UseLatest) {
    throw "Informe -Latest para usar o backup mais recente em '$path', ou passe -BackupDir com o caminho de um snapshot (pasta com referencias.db)."
  }

  if (-not (Test-Path -LiteralPath $path)) {
    throw "Nenhum backup em $path"
  }

  $candidates = @(
    Get-ChildItem -LiteralPath $path -Directory -Filter 'server-*' |
      Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'referencias.db') } |
      Sort-Object Name -Descending
  )

  if ($candidates.Count -eq 0) {
    throw "Nenhum backup válido (server-*/referencias.db) em $path"
  }

  return $candidates[0].FullName
}

function Invoke-ServerDataRemote {
  param(
    [string] $PythonExe,
    [hashtable] $Config,
    [string] $HelperScript,
    [string] $RemoteAction,
    [string] $LocalBackupDir,
    [bool] $WithPdfs
  )

  $env:DEPLOY_HOST = [string] $Config.host
  $env:DEPLOY_USER = [string] $Config.user
  $env:DEPLOY_PASS = [string] $Config.password
  $env:DEPLOY_APP_DIR = [string] $Config.app_dir
  $env:DEPLOY_PM2_APP = [string] $Config.pm2_app
  $env:DEPLOY_APP_USER = [string] $Config.app_user
  $env:DEPLOY_PDF_DIR = [string] $Config.pdf_dir
  $env:BACKUP_ACTION = $RemoteAction
  $env:BACKUP_INCLUDE_PDFS = $(if ($WithPdfs) { '1' } else { '0' })
  $env:PYTHONIOENCODING = 'utf-8'

  if ($LocalBackupDir) {
    $env:BACKUP_LOCAL_DIR = $LocalBackupDir
  }
  else {
    Remove-Item Env:BACKUP_LOCAL_DIR -ErrorAction SilentlyContinue
  }

  try {
    & $PythonExe $HelperScript
    if ($LASTEXITCODE -ne 0) {
      throw "Operação remota falhou (exit code $LASTEXITCODE)."
    }
  }
  finally {
    Remove-Item Env:DEPLOY_PASS -ErrorAction SilentlyContinue
    Remove-Item Env:DEPLOY_HOST -ErrorAction SilentlyContinue
    Remove-Item Env:DEPLOY_USER -ErrorAction SilentlyContinue
    Remove-Item Env:DEPLOY_APP_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:DEPLOY_PM2_APP -ErrorAction SilentlyContinue
    Remove-Item Env:DEPLOY_APP_USER -ErrorAction SilentlyContinue
    Remove-Item Env:DEPLOY_PDF_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:BACKUP_ACTION -ErrorAction SilentlyContinue
    Remove-Item Env:BACKUP_LOCAL_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:BACKUP_INCLUDE_PDFS -ErrorAction SilentlyContinue
  }
}

if (-not $DeployFile) {
  $DeployFile = Join-Path $RepoRoot 'deploy.txt'
}
elseif (-not [System.IO.Path]::IsPathRooted($DeployFile)) {
  $DeployFile = Join-Path $RepoRoot $DeployFile
}

Write-Step "Repositório: $RepoRoot"
Write-Step "Credenciais: $DeployFile"
Write-Step "Ação: $Action"

$config = Read-DeployConfig $DeployFile
$pythonExe = Assert-PythonParamiko
$helperScript = Join-Path $PSScriptRoot 'server-data-remote.py'
if (-not (Test-Path -LiteralPath $helperScript)) {
  throw "Helper remoto não encontrado: $helperScript"
}

$localBackupDir = ''
$withPdfs = -not [bool] $ExcludePdfs

switch ($Action) {
  'List' {
    Write-Host ''
    Write-Host "Host: $($config.user)@$($config.host)" -ForegroundColor White
    Write-Host "App:  $($config.app_dir)" -ForegroundColor White
    Write-Host "PDFs: $($config.pdf_dir)" -ForegroundColor White
    Write-Host ''
    Invoke-ServerDataRemote -PythonExe $pythonExe -Config $config -HelperScript $helperScript `
      -RemoteAction 'list' -LocalBackupDir '' -WithPdfs $true
  }

  'Backup' {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $folderName = "server-$stamp"
    $backupRoot = Resolve-BackupPath -Path $BackupDir -Root $RepoRoot
    $localBackupDir = Join-Path $backupRoot $folderName

    Write-Host ''
    Write-Host "Host:    $($config.user)@$($config.host)" -ForegroundColor White
    Write-Host "App:     $($config.app_dir)" -ForegroundColor White
    Write-Host "Destino: $localBackupDir" -ForegroundColor White
    Write-Host "PDFs:    $(if ($withPdfs) { $config.pdf_dir } else { 'omitidos (-ExcludePdfs)' })" -ForegroundColor White
    Write-Host ''
    Write-WarnStep 'A API será parada por alguns segundos no servidor para cópia consistente do SQLite.'

    if (-not $SkipConfirm) {
      Write-Host 'Pressione Enter para continuar ou Ctrl+C para cancelar.'
      [void] [Console]::ReadLine()
    }

    New-Item -ItemType Directory -Path $localBackupDir -Force | Out-Null
    Invoke-ServerDataRemote -PythonExe $pythonExe -Config $config -HelperScript $helperScript `
      -RemoteAction 'backup' -LocalBackupDir $localBackupDir -WithPdfs $withPdfs

    Write-Host ''
    Write-Host "[server-data] Backup salvo em: $localBackupDir" -ForegroundColor Green
  }

  'Restore' {
    $localBackupDir = Resolve-BackupDirForRestore -Requested $BackupDir -UseLatest:$Latest -Root $RepoRoot

    # Padrão: restaurar PDFs se existirem no pacote; -ExcludePdfs omite.
    if ($ExcludePdfs) {
      $withPdfs = $false
    }
    else {
      $withPdfs = Test-Path -LiteralPath (Join-Path $localBackupDir 'pdfs')
    }

    Write-Host ''
    Write-Host "Host:    $($config.user)@$($config.host)" -ForegroundColor White
    Write-Host "App:     $($config.app_dir)" -ForegroundColor White
    Write-Host "Origem:  $localBackupDir" -ForegroundColor White
    Write-Host "PDFs:    $(if ($withPdfs) { 'sim' } else { 'não' })" -ForegroundColor White
    Write-Host ''
    Write-WarnStep 'Isto SUBSTITUI os dados atuais do servidor.'
    Write-WarnStep 'Um snapshot pré-restore será gravado em data/backups/ no servidor.'

    if (-not $SkipConfirm) {
      Write-Host 'Pressione Enter para restaurar ou Ctrl+C para cancelar.'
      [void] [Console]::ReadLine()
    }

    Invoke-ServerDataRemote -PythonExe $pythonExe -Config $config -HelperScript $helperScript `
      -RemoteAction 'restore' -LocalBackupDir $localBackupDir -WithPdfs $withPdfs

    Write-Host ''
    Write-Host '[server-data] Restore concluído.' -ForegroundColor Green
  }
}
