#Requires -Version 5.1
<#
.SYNOPSIS
  Instala Referências em um servidor Ubuntu zerado via SSH (a partir do Windows).

.DESCRIPTION
  Lê credenciais em deploy.txt, envia scripts/deploy/digitalocean-install.sh
  por SFTP e executa remotamente (Node, Nginx, PM2, clone, build).

  Não substitui backup/restore — após instalar, use backup-server.ps1 -Action Restore
  para trazer dados de produção.

.PARAMETER DeployFile
  Caminho do arquivo de credenciais (padrão: deploy.txt na raiz do repo).

.PARAMETER Domain
  Domínio para Nginx (opcional). Sem valor, o site responde pelo IP.

.PARAMETER InstallCertbot
  Solicita certificado Let's Encrypt (requer -Domain).

.PARAMETER CertbotEmail
  E-mail para Let's Encrypt (obrigatório com -InstallCertbot).

.PARAMETER Force
  Reinstala mesmo se a API já responder em /api/health.

.PARAMETER SkipConfirm
  Não pede confirmação interativa.

.PARAMETER RepoRoot
  Raiz do repositório (padrão: dois níveis acima deste script).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\deploy\install-server.ps1 -SkipConfirm

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\install-server.ps1 -Domain ref.exemplo.org -InstallCertbot -CertbotEmail admin@exemplo.org -SkipConfirm
#>
param(
  [string] $DeployFile = '',
  [string] $Domain = '',
  [switch] $InstallCertbot,
  [string] $CertbotEmail = '',
  [switch] $Force,
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
  Write-Host "[install] $Message" -ForegroundColor Cyan
}

function Write-WarnStep([string] $Message) {
  Write-Host "[install] $Message" -ForegroundColor Yellow
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
    'app_user'         = 'app_user'
    'app user'         = 'app_user'
    'domain'           = 'domain'
    'dominio'          = 'domain'
    'domínio'          = 'domain'
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
    app_user = 'referencias'
    domain   = ''
  }

  foreach ($rawLine in Get-Content -LiteralPath $Path -Encoding UTF8) {
    $line = $rawLine.Trim()
    if (-not $line -or $line.StartsWith('#') -or $line.StartsWith(';')) {
      continue
    }
    $parts = $line -split ':', 2
    if ($parts.Count -lt 2) {
      continue
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
    throw 'Python não encontrado no PATH. Instale Python 3 e execute: pip install paramiko'
  }

  & $python.Source -c "import paramiko" 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw 'Pacote Python paramiko não encontrado. Execute: pip install paramiko'
  }

  return $python.Source
}

if (-not $DeployFile) {
  $DeployFile = Join-Path $RepoRoot 'deploy.txt'
}
elseif (-not [System.IO.Path]::IsPathRooted($DeployFile)) {
  $DeployFile = Join-Path $RepoRoot $DeployFile
}

$installScript = Join-Path $RepoRoot 'scripts\deploy\digitalocean-install.sh'
if (-not (Test-Path -LiteralPath $installScript)) {
  throw "Script de instalação não encontrado: $installScript"
}

$helperScript = Join-Path $PSScriptRoot 'install-server-remote.py'
if (-not (Test-Path -LiteralPath $helperScript)) {
  throw "Helper remoto não encontrado: $helperScript"
}

$config = Read-DeployConfig $DeployFile
$effectiveDomain = if ($Domain) { $Domain.Trim() } elseif ($config.domain) { $config.domain } else { '_' }

if ($InstallCertbot -and $effectiveDomain -eq '_') {
  throw 'Informe -Domain (ou domain: no deploy.txt) ao usar -InstallCertbot.'
}
if ($InstallCertbot -and -not $CertbotEmail.Trim()) {
  throw 'Informe -CertbotEmail ao usar -InstallCertbot.'
}

Write-Step "Repositório: $RepoRoot"
Write-Step "Credenciais: $DeployFile"

Write-Host ''
Write-Host "Host:    $($config.user)@$($config.host)" -ForegroundColor White
Write-Host "App:     $($config.app_dir)" -ForegroundColor White
Write-Host "Branch:  $($config.branch)" -ForegroundColor White
Write-Host "Domínio: $(if ($effectiveDomain -eq '_') { '(IP do servidor)' } else { $effectiveDomain })" -ForegroundColor White
Write-Host "SSL:     $(if ($InstallCertbot) { "Let's Encrypt ($CertbotEmail)" } else { 'não' })" -ForegroundColor White
Write-Host "Force:   $(if ($Force) { 'sim' } else { 'não' })" -ForegroundColor White
Write-Host ''

if (-not $SkipConfirm) {
  Write-Host 'Pressione Enter para instalar ou Ctrl+C para cancelar.'
  [void] [Console]::ReadLine()
}

$pythonExe = Assert-PythonParamiko

$env:DEPLOY_HOST = [string] $config.host
$env:DEPLOY_USER = [string] $config.user
$env:DEPLOY_PASS = [string] $config.password
$env:DEPLOY_APP_DIR = [string] $config.app_dir
$env:DEPLOY_APP_USER = [string] $config.app_user
$env:DEPLOY_BRANCH = [string] $config.branch
$env:INSTALL_DOMAIN = $effectiveDomain
$env:INSTALL_CERTBOT = $(if ($InstallCertbot) { 'true' } else { 'false' })
$env:INSTALL_CERTBOT_EMAIL = $CertbotEmail.Trim()
$env:INSTALL_FORCE = $(if ($Force) { '1' } else { '0' })
$env:INSTALL_SCRIPT_PATH = $installScript
$env:PYTHONIOENCODING = 'utf-8'

try {
  Write-Step 'Conectando e instalando...'
  & $pythonExe $helperScript
  if ($LASTEXITCODE -ne 0) {
    throw "Instalação remota falhou (exit code $LASTEXITCODE)."
  }
}
finally {
  Remove-Item Env:DEPLOY_PASS -ErrorAction SilentlyContinue
  Remove-Item Env:DEPLOY_HOST -ErrorAction SilentlyContinue
  Remove-Item Env:DEPLOY_USER -ErrorAction SilentlyContinue
  Remove-Item Env:DEPLOY_APP_DIR -ErrorAction SilentlyContinue
  Remove-Item Env:DEPLOY_APP_USER -ErrorAction SilentlyContinue
  Remove-Item Env:DEPLOY_BRANCH -ErrorAction SilentlyContinue
  Remove-Item Env:INSTALL_DOMAIN -ErrorAction SilentlyContinue
  Remove-Item Env:INSTALL_CERTBOT -ErrorAction SilentlyContinue
  Remove-Item Env:INSTALL_CERTBOT_EMAIL -ErrorAction SilentlyContinue
  Remove-Item Env:INSTALL_FORCE -ErrorAction SilentlyContinue
  Remove-Item Env:INSTALL_SCRIPT_PATH -ErrorAction SilentlyContinue
}

Write-Host ''
Write-Host '[install] Instalação concluída.' -ForegroundColor Green
Write-WarnStep 'Para trazer dados de outro servidor: npm run restore:server'
Write-WarnStep 'Para publicar código após git push: npm run publish:server'
