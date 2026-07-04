#Requires -Version 5.1
<#
.SYNOPSIS
  Wrapper de build Android — roda de qualquer pasta.

.DESCRIPTION
  Localiza o repositório pela pasta deste script (não pelo diretório atual)
  e chama scripts/android/build-and-copy-apk.ps1.

.EXAMPLE
  # De qualquer pasta (caminho absoluto do wrapper):
  powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\build-android-apk.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\build-android-apk.ps1 -SkipSync

.EXAMPLE
  npm --prefix C:\tmp2\exemplos\doutorado\refs run build:android:copy
#>
param(
  [string] $Destination = 'G:\Meu Drive\doutorado\app',
  [switch] $SkipSync,
  [switch] $Debug
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptPath = if ($PSScriptRoot) {
  $PSScriptRoot
}
else {
  Split-Path -Parent $MyInvocation.MyCommand.Path
}
$repoRoot = (Resolve-Path -LiteralPath $scriptPath).Path

$target = Join-Path $repoRoot 'scripts\android\build-and-copy-apk.ps1'
if (-not (Test-Path -LiteralPath $target)) {
  throw "Script de build Android não encontrado: $target"
}

$forward = @{
  RepoRoot    = $repoRoot
  Destination = $Destination
}

if ($SkipSync) { $forward['SkipSync'] = $true }
if ($Debug) { $forward['Debug'] = $true }

& $target @forward
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
