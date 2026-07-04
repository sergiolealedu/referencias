#Requires -Version 5.1
<#
.SYNOPSIS
  Pipeline de release: build local → mobile → commit/push → publicar no servidor.

.DESCRIPTION
  Orquestra os scripts existentes na ordem correta para uma nova versão:
    1. npm run build — valida build local (backend + frontend)
    2. build-and-copy-apk — gera APK Android e copia para o destino
    3. commit-and-push — grava alterações (incl. sync Capacitor) e envia para origin
    4. publish-to-server — pull, build e restart no servidor

  O commit fica depois dos builds para não deixar working tree suja na publicação.
  Após o passo 3, a publicação usa -SkipPush para não repetir o git push.

.PARAMETER Message
  Mensagem do commit (obrigatória com -SkipConfirm, quando houver alterações locais).

.PARAMETER SkipConfirm
  Não pede confirmações interativas nos sub-scripts.

.PARAMETER SkipCommit
  Pula commit/push (código já está commitado e/ou no remoto).

.PARAMETER SkipBuild
  Pula npm run build local.

.PARAMETER SkipMobile
  Pula build do APK Android.

.PARAMETER ApkDestination
  Pasta de destino do APK (padrão: G:\Meu Drive\doutorado\app).

.PARAMETER SkipPublish
  Pula publicação no servidor (só commit, build e mobile).

.PARAMETER DeployFile
  Arquivo de credenciais para o deploy (padrão: deploy.txt na raiz do repo).

.PARAMETER AllowDirty
  Permite publicar com working tree suja (repassado ao publish-to-server).

.PARAMETER RepoRoot
  Raiz do repositório (padrão: dois níveis acima deste script).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\deploy\release.ps1 -Message "Release 1.2.0"

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\release.ps1 -Message "Release 1.2.0" -SkipConfirm

.EXAMPLE
  npm run release:server -- -Message "Release 1.2.0" -SkipConfirm
#>
param(
  [string] $Message = '',
  [switch] $SkipConfirm,
  [switch] $SkipCommit,
  [switch] $SkipBuild,
  [switch] $SkipMobile,
  [string] $ApkDestination = 'G:\Meu Drive\doutorado\app',
  [switch] $SkipPublish,
  [string] $DeployFile = '',
  [switch] $AllowDirty,
  [string] $RepoRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $RepoRoot = (Resolve-Path (Join-Path $scriptDir '../..')).Path
}

function Write-Step([string] $Text) {
  Write-Host "[release] $Text" -ForegroundColor Cyan
}

function Write-WarnStep([string] $Text) {
  Write-Host "[release] $Text" -ForegroundColor Yellow
}

function Write-OkStep([string] $Text) {
  Write-Host "[release] $Text" -ForegroundColor Green
}

function Confirm-ReleaseStart {
  if ($SkipConfirm) {
    return
  }

  Write-Host ''
  Write-Host 'Pipeline de release:' -ForegroundColor White
  Write-Host "  1. Build local: $(if ($SkipBuild) { 'pular' } else { 'npm run build' })"
  Write-Host "  2. Mobile (APK): $(if ($SkipMobile) { 'pular' } else { 'sim' })"
  Write-Host "  3. Commit/push: $(if ($SkipCommit) { 'pular' } else { 'sim' })"
  Write-Host "  4. Publicar servidor: $(if ($SkipPublish) { 'pular' } else { 'sim' })"
  if (-not $SkipMobile) {
    Write-Host "  APK destino: $ApkDestination"
  }
  if ($Message) {
    Write-Host "  Mensagem: $Message"
  }
  Write-Host ''
  Write-Host 'Pressione Enter para iniciar ou Ctrl+C para cancelar.'
  [void] [Console]::ReadLine()
}

function Invoke-ChildScript {
  param(
    [string] $Path,
    [hashtable] $Arguments
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Script não encontrado: $Path"
  }

  & $Path @Arguments
  if (-not $?) {
    throw "Script falhou: $Path"
  }
}

function Invoke-NpmBuild {
  $npm = Get-Command npm -ErrorAction SilentlyContinue
  if (-not $npm) {
    throw 'npm não encontrado no PATH.'
  }

  Push-Location $RepoRoot
  try {
    Write-Step 'Executando npm run build...'
    & npm run build
    if ($LASTEXITCODE -ne 0) {
      throw 'npm run build falhou.'
    }
  }
  finally {
    Pop-Location
  }
}

function Assert-CleanWorkingTree {
  Push-Location $RepoRoot
  try {
    $status = @(git status --porcelain | ForEach-Object { $_.TrimEnd() } | Where-Object { $_ })
    if ($status.Count -gt 0) {
      $list = ($status | ForEach-Object { "  $_" }) -join "`n"
      throw @"
Working tree ainda suja após commit/push — publicação abortada.
Arquivos pendentes:
$list
"@
    }
  }
  finally {
    Pop-Location
  }
}

$commitScript = Join-Path $RepoRoot 'scripts\deploy\commit-and-push.ps1'
$androidScript = Join-Path $RepoRoot 'scripts\android\build-and-copy-apk.ps1'
$publishScript = Join-Path $RepoRoot 'scripts\deploy\publish-to-server.ps1'

Write-Step "Repositório: $RepoRoot"
Confirm-ReleaseStart

if (-not $SkipBuild) {
  Write-Host ''
  Write-Host '=== 1/4 — Build local ===' -ForegroundColor Magenta
  Invoke-NpmBuild
}
else {
  Write-WarnStep 'Pulando build local (-SkipBuild).'
}

if (-not $SkipMobile) {
  Write-Host ''
  Write-Host '=== 2/4 — Mobile (APK Android) ===' -ForegroundColor Magenta

  $androidArgs = @{
    RepoRoot    = $RepoRoot
    Destination = $ApkDestination
  }

  Invoke-ChildScript -Path $androidScript -Arguments $androidArgs
}
else {
  Write-WarnStep 'Pulando build mobile (-SkipMobile).'
}

if (-not $SkipCommit) {
  Write-Host ''
  Write-Host '=== 3/4 — Commit e push ===' -ForegroundColor Magenta

  $commitArgs = @{
    RepoRoot = $RepoRoot
  }
  if ($Message) { $commitArgs['Message'] = $Message }
  if ($SkipConfirm) { $commitArgs['SkipConfirm'] = $true }

  Invoke-ChildScript -Path $commitScript -Arguments $commitArgs
}
else {
  Write-WarnStep 'Pulando commit/push (-SkipCommit).'
}

if (-not $SkipPublish) {
  Write-Host ''
  Write-Host '=== 4/4 — Publicar no servidor ===' -ForegroundColor Magenta

  if (-not $SkipCommit -and -not $AllowDirty) {
    Assert-CleanWorkingTree
  }

  $publishArgs = @{
    RepoRoot = $RepoRoot
  }
  if ($DeployFile) { $publishArgs['DeployFile'] = $DeployFile }
  if ($SkipConfirm) { $publishArgs['SkipConfirm'] = $true }
  if ($AllowDirty) { $publishArgs['AllowDirty'] = $true }

  if (-not $SkipCommit) {
    $publishArgs['SkipPush'] = $true
  }

  Invoke-ChildScript -Path $publishScript -Arguments $publishArgs
}
else {
  Write-WarnStep 'Pulando publicação no servidor (-SkipPublish).'
}

Write-Host ''
Write-OkStep 'Pipeline de release concluído.'
