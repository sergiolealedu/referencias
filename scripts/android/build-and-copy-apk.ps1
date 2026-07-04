#Requires -Version 5.1
<#
.SYNOPSIS
  Compila o app Android (Capacitor) e copia o APK para uma pasta de destino.

.DESCRIPTION
  Executa build do frontend, sincroniza Capacitor, gera APK release via Gradle
  e copia o artefato para a pasta informada (padrão: Google Drive).

  Requer Node.js, npm, Android SDK (ANDROID_HOME) e dependências já instaladas
  (npm install na raiz do monorepo).

.PARAMETER Destination
  Pasta de destino do APK (padrão: G:\Meu Drive\doutorado\app).

.PARAMETER SkipSync
  Pula npm run build:android; só executa assembleRelease (útil se o sync já foi feito).

.PARAMETER Debug
  Gera APK debug em vez de release.

.PARAMETER RepoRoot
  Raiz do repositório (padrão: dois níveis acima deste script).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\android\build-and-copy-apk.ps1

.EXAMPLE
  npm run build:android:copy
#>
param(
  [string] $Destination = 'G:\Meu Drive\doutorado\app',
  [switch] $SkipSync,
  [switch] $Debug,
  [string] $RepoRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $RepoRoot = (Resolve-Path (Join-Path $scriptDir '../..')).Path
}

function Write-Step([string] $Text) {
  Write-Host "[android] $Text" -ForegroundColor Cyan
}

function Write-WarnStep([string] $Text) {
  Write-Host "[android] $Text" -ForegroundColor Yellow
}

function Invoke-Npm([string[]] $NpmArgs) {
  & npm @NpmArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Comando falhou: npm $($NpmArgs -join ' ')"
  }
}

function Get-AndroidVersionName([string] $BuildGradlePath) {
  if (-not (Test-Path -LiteralPath $BuildGradlePath)) {
    return 'unknown'
  }

  $content = Get-Content -LiteralPath $BuildGradlePath -Raw
  if ($content -match 'versionName\s+"([^"]+)"') {
    return $Matches[1]
  }

  return 'unknown'
}

function Get-ReleaseApk([string] $OutputsRoot, [switch] $IsDebug) {
  $variant = if ($IsDebug) { 'debug' } else { 'release' }
  $searchRoot = Join-Path $OutputsRoot "apk\$variant"

  if (-not (Test-Path -LiteralPath $searchRoot)) {
    throw "Pasta de APK não encontrada: $searchRoot (build Gradle concluiu?)"
  }

  $candidates = @(
    Get-ChildItem -LiteralPath $searchRoot -Filter '*.apk' -File -Recurse -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -notmatch 'androidTest' }
  )

  if ($candidates.Count -eq 0) {
    throw "Nenhum APK encontrado em $searchRoot"
  }

  return ($candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
}

Push-Location $RepoRoot
try {
  Write-Step "Repositório: $RepoRoot"

  if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
    Write-WarnStep 'ANDROID_HOME/ANDROID_SDK_ROOT não definido — o Gradle pode falhar sem o Android SDK.'
  }

  if (-not $SkipSync) {
    Write-Step 'Build web + sync Capacitor (npm run build:android)...'
    Invoke-Npm @('run', 'build:android')
  }
  else {
    Write-WarnStep 'Pulando build:android (-SkipSync).'
  }

  $gradleTask = if ($Debug) { 'android:assemble:debug' } else { 'android:assemble' }
  Write-Step "Gradle assemble ($gradleTask)..."
  Invoke-Npm @('run', $gradleTask)

  $outputsRoot = Join-Path $RepoRoot 'frontend\android\app\build\outputs'
  $apkSource = Get-ReleaseApk -OutputsRoot $outputsRoot -Debug:$Debug

  $buildGradle = Join-Path $RepoRoot 'frontend\android\app\build.gradle'
  $version = Get-AndroidVersionName -BuildGradlePath $buildGradle
  $suffix = if ($Debug) { 'debug' } else { 'release' }
  $apkName = "referencias-$version-$suffix.apk"

  if (-not (Test-Path -LiteralPath $Destination)) {
    Write-Step "Criando pasta de destino: $Destination"
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
  }

  $apkTarget = Join-Path $Destination $apkName
  Write-Step "Copiando APK para $apkTarget"
  Copy-Item -LiteralPath $apkSource.FullName -Destination $apkTarget -Force

  Write-Host ''
  Write-Host '[android] Build concluído.' -ForegroundColor Green
  Write-Host "  Origem:  $($apkSource.FullName)"
  Write-Host "  Destino: $apkTarget"
}
finally {
  Pop-Location
}
