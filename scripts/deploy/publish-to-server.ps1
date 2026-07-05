#Requires -Version 5.1
<#
.SYNOPSIS
  Publica a branch atual no servidor Referências (pull, build e restart do PM2).

.DESCRIPTION
  Lê credenciais e host em deploy.txt na raiz do repositório, envia a branch
  para o origin (opcional) e atualiza a aplicação em /opt/referencias via SSH.

  Formato de deploy.txt (chave: valor):

    senha: SUA_SENHA
    ip do servidor: 159.223.130.39
    usuario: root
    branch: main
    app_dir: /opt/referencias

  Campos opcionais: usuario (padrão root), branch (padrão main),
  app_dir (padrão /opt/referencias), pm2_app (padrão referencias-api).

.PARAMETER DeployFile
  Caminho do arquivo de credenciais (padrão: deploy.txt na raiz do repo).

.PARAMETER SkipPush
  Não executa git push; só atualiza o servidor com o que já está no remoto.

.PARAMETER AllowDirty
  Permite publicar mesmo com alterações locais não commitadas.

.PARAMETER SkipConfirm
  Não pede confirmação interativa.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\deploy\publish-to-server.ps1

.EXAMPLE
  npm run publish:server
#>
param(
  [string] $DeployFile = '',
  [switch] $SkipPush,
  [switch] $AllowDirty,
  [switch] $SkipConfirm,
  [string] $RepoRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $RepoRoot = (Resolve-Path (Join-Path $scriptDir '../..')).Path
}

function Write-Step([string] $Message) {
  Write-Host "[publish] $Message" -ForegroundColor Cyan
}

function Write-WarnStep([string] $Message) {
  Write-Host "[publish] $Message" -ForegroundColor Yellow
}

function Normalize-DeployKey([string] $Key) {
  $normalized = $Key.Trim().ToLowerInvariant()
  $normalized = $normalized -replace '\s+', ' '
  $map = @{
    'senha'            = 'password'
    'password'         = 'password'
    'pass'             = 'password'
    'ip'               = 'host'
    'ip do servidor'   = 'host'
    'host'             = 'host'
    'servidor'         = 'host'
    'server'           = 'host'
    'usuario'          = 'user'
    'user'             = 'user'
    'ssh_user'         = 'user'
    'branch'           = 'branch'
    'app_dir'          = 'app_dir'
    'app dir'          = 'app_dir'
    'pm2_app'          = 'pm2_app'
    'pm2 app'          = 'pm2_app'
  }
  if ($map.ContainsKey($normalized)) {
    return $map[$normalized]
  }
  return ($normalized -replace '[^a-z0-9]+', '_')
}

function Read-DeployConfig([string] $Path) {
  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Arquivo de deploy não encontrado: $Path`nCrie a partir de deploy.txt.example e preencha senha e IP."
  }

  $config = @{
    password = ''
    host     = ''
    user     = 'root'
    branch   = 'main'
    app_dir  = '/opt/referencias'
    pm2_app  = 'referencias-api'
  }

  $lineNumber = 0
  foreach ($rawLine in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $lineNumber++
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#') -or $line.StartsWith(';')) {
      continue
    }
    $parts = $line -split ':', 2
    if ($parts.Count -lt 2) {
      throw "Linha inválida em deploy.txt ($lineNumber): esperado 'chave: valor'."
    }
    $key = Normalize-DeployKey $parts[0]
    $value = $parts[1].Trim()
    if (-not $value) {
      continue
    }
    $config[$key] = $value
  }

  if (-not $config.host) {
    throw "deploy.txt sem 'ip do servidor' (ou host)."
  }
  if (-not $config.password) {
    throw "deploy.txt sem 'senha'."
  }

  return $config
}

function Assert-PythonParamiko {
  $python = Get-Command python -ErrorAction SilentlyContinue
  if (-not $python) {
    $python = Get-Command python3 -ErrorAction SilentlyContinue
  }
  if (-not $python) {
    throw 'Python não encontrado no PATH. Instale Python 3 e o pacote paramiko (pip install paramiko).'
  }

  & $python.Source -c "import paramiko" 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw 'Pacote Python paramiko não encontrado. Execute: pip install paramiko'
  }

  return $python.Source
}

function Invoke-RemoteDeploy {
  param(
    [string] $PythonExe,
    [hashtable] $Config,
    [string] $HelperScript
  )

  $env:DEPLOY_HOST = [string] $Config.host
  $env:DEPLOY_USER = [string] $Config.user
  $env:DEPLOY_PASS = [string] $Config.password
  $env:DEPLOY_BRANCH = [string] $Config.branch
  $env:DEPLOY_APP_DIR = [string] $Config.app_dir
  $env:DEPLOY_PM2_APP = [string] $Config.pm2_app
  $env:PYTHONIOENCODING = 'utf-8'

  try {
    & $PythonExe $HelperScript
    if ($LASTEXITCODE -ne 0) {
      throw "Deploy remoto falhou (exit code $LASTEXITCODE)."
    }
  }
  finally {
    Remove-Item Env:DEPLOY_PASS -ErrorAction SilentlyContinue
    Remove-Item Env:DEPLOY_HOST -ErrorAction SilentlyContinue
    Remove-Item Env:DEPLOY_USER -ErrorAction SilentlyContinue
    Remove-Item Env:DEPLOY_BRANCH -ErrorAction SilentlyContinue
    Remove-Item Env:DEPLOY_APP_DIR -ErrorAction SilentlyContinue
    Remove-Item Env:DEPLOY_PM2_APP -ErrorAction SilentlyContinue
  }
}

if (-not $DeployFile) {
  $DeployFile = Join-Path $RepoRoot 'deploy.txt'
}
elseif (-not [System.IO.Path]::IsPathRooted($DeployFile)) {
  $DeployFile = Join-Path $RepoRoot $DeployFile
}

Write-Step "Repositório: $RepoRoot"
Write-Step "Credenciais: $DeployFile"

$config = Read-DeployConfig $DeployFile
$pythonExe = Assert-PythonParamiko
$helperScript = Join-Path $PSScriptRoot 'publish-to-server-remote.py'
if (-not (Test-Path -LiteralPath $helperScript)) {
  throw "Helper remoto não encontrado: $helperScript"
}

Push-Location $RepoRoot
try {
  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if (-not $branch -or $branch -eq 'HEAD') {
    throw 'Não foi possível determinar a branch atual (detached HEAD?).'
  }

  $status = git status --porcelain
  if ($status) {
    if (-not $AllowDirty) {
      throw "Há alterações locais não commitadas. Faça commit/push antes, ou use -AllowDirty."
    }
    Write-WarnStep 'Working tree suja — publicando mesmo assim (-AllowDirty).'
  }

  if ($config.branch -ne $branch) {
    Write-WarnStep "deploy.txt pede branch '$($config.branch)', mas a branch atual é '$branch'."
    Write-WarnStep "Será publicada a branch atual ($branch) no servidor."
    $config.branch = $branch
  }

  Write-Host ''
  Write-Host "Host:   $($config.user)@$($config.host)" -ForegroundColor White
  Write-Host "Branch: $($config.branch)" -ForegroundColor White
  Write-Host "App:    $($config.app_dir)" -ForegroundColor White
  Write-Host "PM2:    $($config.pm2_app)" -ForegroundColor White
  Write-Host "Push:   $(if ($SkipPush) { 'não' } else { 'sim (origin)' })" -ForegroundColor White
  Write-Host ''

  if (-not $SkipConfirm) {
    Write-Host 'Pressione Enter para publicar ou Ctrl+C para cancelar.'
    [void] [Console]::ReadLine()
  }

  Write-Step 'Sincronizando versão semver (git tags + commits)...'
  & node (Join-Path $RepoRoot 'scripts/sync-package-version.mjs')
  $versionFiles = @(
    'package.json',
    'backend/package.json',
    'frontend/package.json',
    'frontend/android/app/build.gradle'
  )
  $versionStatus = git status --porcelain -- @versionFiles
  if ($versionStatus) {
    git add -- @versionFiles
    $syncedVersion = (Get-Content (Join-Path $RepoRoot 'package.json') -Raw | ConvertFrom-Json).version
    git commit -m "chore: sync version to v$syncedVersion"
    if ($LASTEXITCODE -ne 0) {
      throw 'Commit de versão falhou.'
    }
  }

  if (-not $SkipPush) {
    Write-Step "Enviando branch $($config.branch) para origin..."
    git push origin $config.branch
    if ($LASTEXITCODE -ne 0) {
      throw 'git push falhou.'
    }
  }
  else {
    Write-Step 'Pulando git push (-SkipPush).'
  }

  Write-Step 'Atualizando servidor...'
  Invoke-RemoteDeploy -PythonExe $pythonExe -Config $config -HelperScript $helperScript

  Write-Host ''
  Write-Host '[publish] Publicação concluída.' -ForegroundColor Green
}
finally {
  Pop-Location
}
