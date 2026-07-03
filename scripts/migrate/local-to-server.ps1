#Requires -Version 5.1
<#
.SYNOPSIS
  Envia dados locais para o servidor Referências (cópia — não apaga nada localmente).

.PARAMETER ServerHost
  IP ou hostname do Droplet (ex.: ref.sergioleal.org ou IP da DigitalOcean).

.PARAMETER ServerUser
  Usuário SSH (padrão: root).

.PARAMETER DbPath
  Caminho do SQLite local (padrão: lido de app.config.json).

.PARAMETER IncludePdfs
  Envia também PDFs de allowedPdfRoots (pode ser grande).

.PARAMETER PdfRoot
  Pasta raiz de PDFs (padrão: primeiro item de allowedPdfRoots).

.PARAMETER SkipConfirm
  Não pedir confirmação interativa (útil com ExecutionPolicy Bypass).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\migrate\local-to-server.ps1 -ServerHost ref.sergioleal.org -SkipConfirm
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $ServerHost,

  [string] $ServerUser = 'root',

  [string] $DbPath = '',

  [switch] $IncludePdfs,

  [switch] $SkipConfirm,

  [string] $PdfRoot = '',

  [string] $RepoRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $RepoRoot = (Resolve-Path (Join-Path $scriptDir '../..')).Path
}

function Write-Step([string] $Message) {
  Write-Host "[migrate] $Message" -ForegroundColor Cyan
}

function Read-AppConfig {
  param([string] $Path)
  if (-not (Test-Path $Path)) {
    throw "app.config.json não encontrado: $Path"
  }
  Get-Content $Path -Raw | ConvertFrom-Json
}

function Copy-SqliteBundle {
  param(
    [string] $SourceDb,
    [string] $DestDir
  )
  if (-not (Test-Path $SourceDb)) {
    throw "Banco SQLite não encontrado: $SourceDb"
  }
  $base = Split-Path $SourceDb -Leaf
  $dir = Split-Path $SourceDb -Parent
  Copy-Item -LiteralPath $SourceDb -Destination (Join-Path $DestDir $base) -Force
  foreach ($suffix in @('-wal', '-shm')) {
    $extra = Join-Path $dir ($base + $suffix)
    if (Test-Path $extra) {
      Copy-Item -LiteralPath $extra -Destination (Join-Path $DestDir ($base + $suffix)) -Force
    }
  }
}

Write-Step 'Lendo configuração local...'
$configPath = Join-Path $RepoRoot 'app.config.json'
$config = Read-AppConfig $configPath

if (-not $DbPath) {
  $DbPath = $config.sqliteDbPath
}
if (-not $PdfRoot -and $config.allowedPdfRoots -and $config.allowedPdfRoots.Count -gt 0) {
  $PdfRoot = [string] $config.allowedPdfRoots[0]
}

Write-Step "Banco local: $DbPath"
if ($IncludePdfs) {
  Write-Step "PDFs: $PdfRoot"
} else {
  Write-Step 'PDFs: omitidos (use -IncludePdfs para enviar)'
}

Write-Host ''
Write-Host 'IMPORTANTE: pare o servidor local antes de copiar o SQLite (npm run dev).' -ForegroundColor Yellow
if (-not $SkipConfirm) {
  Write-Host 'Pressione Enter para continuar ou Ctrl+C para cancelar.'
  [void] [Console]::ReadLine()
}

$staging = Join-Path $env:TEMP "referencias-migrate-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $staging -Force | Out-Null
Write-Step "Preparando pacote em $staging"

Copy-SqliteBundle -SourceDb $DbPath -DestDir $staging

$wsPath = Join-Path $RepoRoot 'data/workspaces.json'
if (Test-Path $wsPath) {
  Copy-Item $wsPath (Join-Path $staging 'workspaces.json') -Force
}

$registryPath = Join-Path $RepoRoot 'data/registry.db'
if (Test-Path $registryPath) {
  Copy-SqliteBundle -SourceDb $registryPath -DestDir $staging
}

if ($IncludePdfs) {
  if (-not (Test-Path $PdfRoot)) {
    throw "Pasta de PDFs não encontrada: $PdfRoot"
  }
  $pdfDest = Join-Path $staging 'pdfs'
  Write-Step "Copiando PDFs (pode demorar)..."
  robocopy $PdfRoot $pdfDest /E /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "robocopy falhou com código $LASTEXITCODE"
  }
}

$dbSize = (Get-Item (Join-Path $staging 'referencias.db')).Length / 1MB
Write-Step ("Pacote pronto (~{0:N1} MB de banco)" -f $dbSize)

$remoteDir = '/tmp/referencias-migrate'
Write-Step "Enviando para ${ServerUser}@${ServerHost}:${remoteDir} ..."

ssh "${ServerUser}@${ServerHost}" "mkdir -p ${remoteDir}"
if ($LASTEXITCODE -ne 0) {
  throw "SSH falhou para ${ServerHost}. Use o IP direto do Droplet (não o domínio Cloudflare)."
}

scp -r "${staging}\*" "${ServerUser}@${ServerHost}:${remoteDir}/"
if ($LASTEXITCODE -ne 0) {
  throw "SCP falhou. Verifique SSH, firewall (porta 22) e IP do servidor."
}

Write-Step 'Executando importação no servidor...'
$importScript = Join-Path $RepoRoot 'scripts/migrate/import-on-server.sh'
if (Test-Path $importScript) {
  scp $importScript "${ServerUser}@${ServerHost}:/tmp/import-on-server.sh"
  if ($LASTEXITCODE -ne 0) { throw 'Falha ao enviar import-on-server.sh' }
  ssh "${ServerUser}@${ServerHost}" "sed -i 's/\r$//' /tmp/import-on-server.sh && sudo bash /tmp/import-on-server.sh"
  if ($LASTEXITCODE -ne 0) { throw 'Falha na importação no servidor.' }
} else {
  Write-Host 'Script import-on-server.sh não encontrado localmente.' -ForegroundColor Yellow
  Write-Host "No servidor, execute: sudo bash scripts/migrate/import-on-server.sh"
}

Write-Step 'Concluído. Seus dados locais permanecem intactos.'
Write-Step "Verifique: https://${ServerHost}/"
Write-Step "Staging local (pode apagar): $staging"
