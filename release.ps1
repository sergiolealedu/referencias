#Requires -Version 5.1
<#
.SYNOPSIS
  Wrapper de release — roda de qualquer pasta.

.DESCRIPTION
  Localiza o repositório pela pasta deste script (não pelo diretório atual)
  e executa o pipeline release: commit/push → build local → publicar no servidor.

.EXAMPLE
  # De qualquer pasta (caminho absoluto do wrapper):
  powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\release.ps1 -Message "Release 1.2.0"

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
  [switch] $AllowDirty
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = if ($PSScriptRoot) {
  $PSScriptRoot
}
else {
  Split-Path -Parent $MyInvocation.MyCommand.Path
}

$target = Join-Path $repoRoot 'scripts\deploy\release.ps1'
if (-not (Test-Path -LiteralPath $target)) {
  throw "Script de release não encontrado: $target"
}

$forward = @{
  RepoRoot = $repoRoot
}

if ($Message) { $forward['Message'] = $Message }
if ($SkipConfirm) { $forward['SkipConfirm'] = $true }
if ($SkipCommit) { $forward['SkipCommit'] = $true }
if ($SkipBuild) { $forward['SkipBuild'] = $true }
if ($SkipPublish) { $forward['SkipPublish'] = $true }
if ($DeployFile) { $forward['DeployFile'] = $DeployFile }
if ($AllowDirty) { $forward['AllowDirty'] = $true }

& $target @forward
if (-not $?) {
  exit 1
}
