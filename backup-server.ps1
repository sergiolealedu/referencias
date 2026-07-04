#Requires -Version 5.1
<#
.SYNOPSIS
  Wrapper de backup/restore do servidor Referências — roda de qualquer pasta.

.DESCRIPTION
  Localiza o repositório pela pasta deste script (não pelo diretório atual)
  e chama scripts/backup/server-data.ps1.

  Padrão: Action=Backup, pasta G:\Meu Drive\doutorado\app\backup\server-YYYYMMDD-HHmmss\

.EXAMPLE
  # De qualquer pasta (caminho absoluto do wrapper):
  powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\backup-server.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\backup-server.ps1 -SkipConfirm

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\backup-server.ps1 -Action Restore -Latest -SkipConfirm

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\backup-server.ps1 -BackupDir D:\backups\refs -ExcludePdfs
#>
param(
  [ValidateSet('Backup', 'Restore', 'List')]
  [string] $Action = 'Backup',

  [string] $BackupDir = 'G:\Meu Drive\doutorado\app\backup',

  [switch] $Latest,

  [switch] $ExcludePdfs,

  [string] $DeployFile = '',

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

$target = Join-Path $repoRoot 'scripts\backup\server-data.ps1'
if (-not (Test-Path -LiteralPath $target)) {
  throw "Script de backup não encontrado: $target"
}

$forward = @{
  Action   = $Action
  BackupDir = $BackupDir
  RepoRoot = $repoRoot
}

if ($Latest) { $forward['Latest'] = $true }
if ($ExcludePdfs) { $forward['ExcludePdfs'] = $true }
if ($DeployFile) { $forward['DeployFile'] = $DeployFile }
if ($SkipConfirm) { $forward['SkipConfirm'] = $true }

& $target @forward
if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
