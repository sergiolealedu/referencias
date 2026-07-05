#Requires -Version 5.1
<#
.SYNOPSIS
  Wrapper — instala Referências em servidor Ubuntu zerado via SSH (da sua máquina).

.DESCRIPTION
  Localiza o repositório pela pasta deste script e executa
  scripts/deploy/install-server.ps1 (envia digitalocean-install.sh por SFTP).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\install-server.ps1 -SkipConfirm

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install-server.ps1 -Domain ref.exemplo.org -InstallCertbot -CertbotEmail admin@exemplo.org -SkipConfirm
#>
param(
  [string] $DeployFile = '',
  [string] $Domain = '',
  [switch] $InstallCertbot,
  [string] $CertbotEmail = '',
  [switch] $Force,
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

$target = Join-Path $repoRoot 'scripts\deploy\install-server.ps1'
if (-not (Test-Path -LiteralPath $target)) {
  throw "Script de instalação não encontrado: $target"
}

$forward = @{
  RepoRoot = $repoRoot
}

if ($DeployFile) { $forward['DeployFile'] = $DeployFile }
if ($Domain) { $forward['Domain'] = $Domain }
if ($InstallCertbot) { $forward['InstallCertbot'] = $true }
if ($CertbotEmail) { $forward['CertbotEmail'] = $CertbotEmail }
if ($Force) { $forward['Force'] = $true }
if ($SkipConfirm) { $forward['SkipConfirm'] = $true }

& $target @forward
if (-not $?) {
  exit 1
}
