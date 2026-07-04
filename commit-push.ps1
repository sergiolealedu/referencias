#Requires -Version 5.1
<#
.SYNOPSIS
  Wrapper de commit/push — roda de qualquer pasta.

.DESCRIPTION
  Localiza o repositório pela pasta deste script (não pelo diretório atual)
  e chama scripts/deploy/commit-and-push.ps1.

.EXAMPLE
  # De qualquer pasta (caminho absoluto do wrapper):
  powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\commit-push.ps1 -Message "Adiciona wrapper de commit/push que roda de qualquer pasta."

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\commit-push.ps1 -Message "Adiciona wrapper de commit/push que roda de qualquer pasta."

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\commit-push.ps1 -Message "Adiciona wrapper de commit/push que roda de qualquer pasta." -SkipPush

.EXAMPLE
  npm run commit:push -- -Message "Adiciona wrapper de commit/push que roda de qualquer pasta."
#>
param(
  [string] $Message = '',
  [switch] $SkipPush,
  [switch] $SkipConfirm
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = if ($PSScriptRoot) {
  $PSScriptRoot
}
else {
  Split-Path -Parent $MyInvocation.MyCommand.Path
}

$target = Join-Path $repoRoot 'scripts\deploy\commit-and-push.ps1'
if (-not (Test-Path -LiteralPath $target)) {
  throw "Script de commit não encontrado: $target"
}

$forward = @{
  RepoRoot = $repoRoot
}

if ($Message) { $forward['Message'] = $Message }
if ($SkipPush) { $forward['SkipPush'] = $true }
if ($SkipConfirm) { $forward['SkipConfirm'] = $true }

& $target @forward
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
