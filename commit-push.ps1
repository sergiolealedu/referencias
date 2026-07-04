#Requires -Version 5.1
<#
.SYNOPSIS
  Wrapper de commit/push — funciona a partir de qualquer diretório.

.DESCRIPTION
  Localiza a raiz do repositório (pelo caminho deste script ou subindo a partir
  do diretório atual) e delega para scripts/deploy/commit-and-push.ps1.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\commit-push.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File C:\tmp2\exemplos\doutorado\refs\commit-push.ps1 -Message "Corrige layout."
#>
param(
  [string] $Message = '',
  [switch] $SkipPush,
  [switch] $SkipConfirm
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Find-RepoRoot {
  $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $marker = 'scripts\deploy\commit-and-push.ps1'

  if (Test-Path -LiteralPath (Join-Path $scriptDir $marker)) {
    return (Resolve-Path -LiteralPath $scriptDir).Path
  }

  $dir = (Get-Location).Path
  while ($dir) {
    if (Test-Path -LiteralPath (Join-Path $dir $marker)) {
      return (Resolve-Path -LiteralPath $dir).Path
    }
    $parent = Split-Path -Parent $dir
    if (-not $parent -or $parent -eq $dir) {
      break
    }
    $dir = $parent
  }

  return $null
}

$repoRoot = Find-RepoRoot
if (-not $repoRoot) {
  throw "Não achei a raiz do repositório (scripts\deploy\commit-and-push.ps1). Rode de dentro do repo ou informe o caminho completo deste wrapper."
}

$target = Join-Path $repoRoot 'scripts\deploy\commit-and-push.ps1'
$forward = @{
  RepoRoot = $repoRoot
}
if ($Message) { $forward.Message = $Message }
if ($SkipPush) { $forward.SkipPush = $true }
if ($SkipConfirm) { $forward.SkipConfirm = $true }

& $target @forward
exit $LASTEXITCODE
