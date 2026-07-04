#Requires -Version 5.1
<#
.SYNOPSIS
  Wrapper — compila o APK Android e copia para o Google Drive.

.DESCRIPTION
  Localiza o repositório pela pasta deste script e chama
  scripts/android/build-and-copy-apk.ps1.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\build-android-apk.ps1

.EXAMPLE
  npm run build:android:copy
#>
param(
  [string] $Destination = 'G:\Meu Drive\doutorado\app',
  [switch] $SkipSync,
  [switch] $Debug
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = if ($PSScriptRoot) {
  $PSScriptRoot
}
else {
  Split-Path -Parent $MyInvocation.MyCommand.Path
}

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
