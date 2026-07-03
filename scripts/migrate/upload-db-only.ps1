#Requires -Version 5.1
<#
.SYNOPSIS
  Envia só o SQLite local para o servidor (corrige workspace vazio).
#>
param(
  [Parameter(Mandatory = $true)]
  [string] $ServerHost,

  [string] $ServerUser = 'root',

  [string] $DbPath = '',

  [string] $RepoRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $RepoRoot = (Resolve-Path (Join-Path $scriptDir '../..')).Path
}

$config = Get-Content (Join-Path $RepoRoot 'app.config.json') -Raw | ConvertFrom-Json
if (-not $DbPath) { $DbPath = [string] $config.sqliteDbPath }

if (-not (Test-Path -LiteralPath $DbPath)) {
  throw "Banco não encontrado: $DbPath"
}

$staging = Join-Path $env:TEMP "referencias-db-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
New-Item -ItemType Directory -Path $staging -Force | Out-Null

$base = Split-Path -LiteralPath $DbPath -Leaf
$dir = Split-Path -LiteralPath $DbPath -Parent
Copy-Item -LiteralPath $DbPath -Destination (Join-Path $staging $base) -Force
foreach ($suffix in @('-wal', '-shm')) {
  $extra = Join-Path $dir ($base + $suffix)
  if (Test-Path -LiteralPath $extra) {
    Copy-Item -LiteralPath $extra -Destination (Join-Path $staging ($base + $suffix)) -Force
  }
}

$mb = [math]::Round((Get-Item (Join-Path $staging $base)).Length / 1MB, 1)
Write-Host "[db-upload] Banco: $DbPath (~${mb} MB)" -ForegroundColor Cyan
Write-Host "[db-upload] Pare o app local (npm run dev) antes de enviar." -ForegroundColor Yellow

$remote = '/tmp/referencias-migrate'
ssh "${ServerUser}@${ServerHost}" "mkdir -p ${remote}"
if ($LASTEXITCODE -ne 0) { throw "SSH falhou." }

scp -r "${staging}\*" "${ServerUser}@${ServerHost}:${remote}/"
if ($LASTEXITCODE -ne 0) { throw "SCP falhou." }

$importScript = Join-Path $RepoRoot 'scripts/migrate/import-db-only.sh'
scp $importScript "${ServerUser}@${ServerHost}:/tmp/import-db-only.sh"
ssh "${ServerUser}@${ServerHost}" "sed -i 's/\r$//' /tmp/import-db-only.sh && sudo bash /tmp/import-db-only.sh"

Write-Host "[db-upload] Concluído. Recarregue https://ref.sergioleal.org" -ForegroundColor Green
