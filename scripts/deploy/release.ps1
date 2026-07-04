#Requires -Version 5.1
<#
.SYNOPSIS
  Pipeline de release: commit/push → build local → publicar no servidor.

.DESCRIPTION
  Orquestra os scripts existentes na ordem correta para uma nova versão:
    1. commit-and-push — grava alterações e envia para origin
    2. npm run build — valida build local (backend + frontend)
    3. publish-to-server — pull, build e restart no servidor

  Após o passo 1, a publicação usa -SkipPush para não repetir o git push.

.PARAMETER Message
  Mensagem do commit (obrigatória com -SkipConfirm, quando houver alterações locais).

.PARAMETER SkipConfirm
  Não pede confirmações interativas nos sub-scripts.

.PARAMETER SkipCommit
  Pula commit/push (código já está commitado e/ou no remoto).

.PARAMETER SkipBuild
  Pula npm run build local.

.PARAMETER SkipPublish
  Pula publicação no servidor (só commit e build).

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
  Write-Host "  1. Commit/push: $(if ($SkipCommit) { 'pular' } else { 'sim' })"
  Write-Host "  2. Build local: $(if ($SkipBuild) { 'pular' } else { 'npm run build' })"
  Write-Host "  3. Publicar servidor: $(if ($SkipPublish) { 'pular' } else { 'sim' })"
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

$commitScript = Join-Path $RepoRoot 'scripts\deploy\commit-and-push.ps1'
$publishScript = Join-Path $RepoRoot 'scripts\deploy\publish-to-server.ps1'

Write-Step "Repositório: $RepoRoot"
Confirm-ReleaseStart

if (-not $SkipCommit) {
  Write-Host ''
  Write-Host '=== 1/3 — Commit e push ===' -ForegroundColor Magenta

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

if (-not $SkipBuild) {
  Write-Host ''
  Write-Host '=== 2/3 — Build local ===' -ForegroundColor Magenta
  Invoke-NpmBuild
}
else {
  Write-WarnStep 'Pulando build local (-SkipBuild).'
}

if (-not $SkipPublish) {
  Write-Host ''
  Write-Host '=== 3/3 — Publicar no servidor ===' -ForegroundColor Magenta

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
