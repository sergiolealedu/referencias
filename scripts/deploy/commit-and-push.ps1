#Requires -Version 5.1
<#
.SYNOPSIS
  Faz commit das alterações locais e push para o origin.

.DESCRIPTION
  Mostra o status do repositório, adiciona as alterações (respeitando .gitignore),
  cria um commit com a mensagem informada e envia a branch atual para origin.

  Bloqueia arquivos sensíveis (deploy.txt, .env, credenciais) caso apareçam no stage.

.PARAMETER Message
  Mensagem do commit. Se omitida, o script pede interativamente.

.PARAMETER SkipPush
  Só faz commit; não executa git push.

.PARAMETER SkipConfirm
  Não pede confirmação interativa (exige -Message).

.PARAMETER RepoRoot
  Raiz do repositório (padrão: dois níveis acima deste script).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\deploy\commit-and-push.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\scripts\deploy\commit-and-push.ps1 -Message "Corrige layout mobile."

.EXAMPLE
  npm run commit:push -- -Message "Adiciona script de commit e push."
#>
param(
  [string] $Message = '',
  [switch] $SkipPush,
  [switch] $SkipConfirm,
  [string] $RepoRoot = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
  $scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
  $RepoRoot = (Resolve-Path (Join-Path $scriptDir '../..')).Path
}

function Write-Step([string] $Text) {
  Write-Host "[commit] $Text" -ForegroundColor Cyan
}

function Write-WarnStep([string] $Text) {
  Write-Host "[commit] $Text" -ForegroundColor Yellow
}

function Test-SensitivePath([string] $Path) {
  $name = [System.IO.Path]::GetFileName($Path)
  $normalized = $Path.Replace('\', '/').ToLowerInvariant()
  $nameLower = $name.ToLowerInvariant()

  $blockedNames = @(
    'deploy.txt',
    '.env',
    '.env.local',
    '.env.production',
    'credentials.json',
    'secrets.json',
    'id_rsa',
    'id_ed25519'
  )
  if ($blockedNames -contains $nameLower) {
    return $true
  }

  if ($nameLower -match '^\.env\.') {
    return $true
  }

  if ($normalized -match '(^|/)(\.env|credentials|secrets)(/|$)') {
    return $true
  }

  return $false
}

function Get-StagedPaths {
  $raw = git diff --cached --name-only --diff-filter=ACMRTUXB
  if (-not $raw) {
    return @()
  }
  return @($raw | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Assert-NoSensitiveStaged {
  $staged = Get-StagedPaths
  $sensitive = @($staged | Where-Object { Test-SensitivePath $_ })
  if ($sensitive.Count -gt 0) {
    $list = ($sensitive | ForEach-Object { "  - $_" }) -join "`n"
    throw "Arquivos sensíveis no stage (remova antes de continuar):`n$list"
  }
}

function Invoke-GitCommit([string] $CommitMessage) {
  $msgFile = Join-Path ([System.IO.Path]::GetTempPath()) ("refs-commit-msg-{0}.txt" -f [guid]::NewGuid().ToString('N'))
  try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText($msgFile, $CommitMessage.TrimEnd() + "`n", $utf8NoBom)
    git commit -F $msgFile
    if ($LASTEXITCODE -ne 0) {
      throw 'git commit falhou.'
    }
  }
  finally {
    Remove-Item -LiteralPath $msgFile -Force -ErrorAction SilentlyContinue
  }
}

function Invoke-GitPush([string] $BranchName, [switch] $SetUpstream) {
  Write-Step "Enviando branch $BranchName para origin..."
  if ($SetUpstream) {
    git push -u origin $BranchName
  }
  else {
    git push origin $BranchName
  }
  if ($LASTEXITCODE -ne 0) {
    throw 'git push falhou.'
  }
}

function Confirm-OrSkip([string] $PromptText) {
  if ($SkipConfirm) {
    return
  }
  Write-Host $PromptText
  [void] [Console]::ReadLine()
}

Push-Location $RepoRoot
try {
  Write-Step "Repositório: $RepoRoot"

  $branch = (git rev-parse --abbrev-ref HEAD).Trim()
  if (-not $branch -or $branch -eq 'HEAD') {
    throw 'Não foi possível determinar a branch atual (detached HEAD?).'
  }

  $status = git status --porcelain
  if (-not $status) {
    Write-WarnStep 'Nada para commit — working tree limpa.'
    if ($SkipPush) {
      return
    }

    git rev-parse --verify --quiet "origin/$branch" | Out-Null
    $hasRemoteBranch = ($LASTEXITCODE -eq 0)

    if (-not $hasRemoteBranch) {
      Write-Step "Branch '$branch' sem tracking remoto."
      Confirm-OrSkip 'Pressione Enter para fazer push ou Ctrl+C para cancelar.'
      Invoke-GitPush -BranchName $branch -SetUpstream
      Write-Host ''
      Write-Host '[commit] Push concluído.' -ForegroundColor Green
      return
    }

    $ahead = [int](git rev-list --count "origin/$branch..HEAD").Trim()
    if ($ahead -gt 0) {
      Write-Step "Há $ahead commit(s) local(is) à frente de origin/$branch."
      Confirm-OrSkip 'Pressione Enter para fazer push ou Ctrl+C para cancelar.'
      Invoke-GitPush -BranchName $branch
      Write-Host ''
      Write-Host '[commit] Push concluído.' -ForegroundColor Green
      return
    }

    Write-WarnStep 'Nada para enviar — branch já sincronizada com origin.'
    return
  }

  Write-Host ''
  Write-Host 'Alterações locais:' -ForegroundColor White
  git status --short
  Write-Host ''
  Write-Host 'Commits recentes (estilo de mensagem):' -ForegroundColor White
  git log -5 --oneline
  Write-Host ''

  if (-not $Message) {
    if ($SkipConfirm) {
      throw 'Informe -Message ao usar -SkipConfirm.'
    }
    Write-Host 'Mensagem do commit:' -ForegroundColor White
    $Message = [Console]::ReadLine()
    if ($null -eq $Message) {
      $Message = ''
    }
    $Message = $Message.Trim()
  }
  else {
    $Message = $Message.Trim()
  }

  if (-not $Message) {
    throw 'Mensagem de commit vazia.'
  }

  Write-Host ''
  Write-Host "Branch:   $branch" -ForegroundColor White
  Write-Host "Mensagem: $Message" -ForegroundColor White
  Write-Host "Push:     $(if ($SkipPush) { 'não' } else { 'sim (origin)' })" -ForegroundColor White
  Write-Host ''

  Confirm-OrSkip 'Pressione Enter para commit/push ou Ctrl+C para cancelar.'

  Write-Step 'Adicionando alterações (git add -A)...'
  git add -A
  if ($LASTEXITCODE -ne 0) {
    throw 'git add falhou.'
  }

  Assert-NoSensitiveStaged

  $staged = Get-StagedPaths
  if ($staged.Count -eq 0) {
    throw 'Nenhum arquivo no stage após git add (tudo ignorado pelo .gitignore?).'
  }

  Write-Step 'Arquivos no commit:'
  foreach ($path in $staged) {
    Write-Host "  $path"
  }

  Write-Step 'Criando commit...'
  Invoke-GitCommit -CommitMessage $Message

  if (-not $SkipPush) {
    git rev-parse --verify --quiet "origin/$branch" | Out-Null
    $hasRemoteBranch = ($LASTEXITCODE -eq 0)
    if ($hasRemoteBranch) {
      Invoke-GitPush -BranchName $branch
    }
    else {
      Invoke-GitPush -BranchName $branch -SetUpstream
    }
  }
  else {
    Write-Step 'Pulando git push (-SkipPush).'
  }

  Write-Host ''
  Write-Host '[commit] Concluído.' -ForegroundColor Green
  git log -1 --oneline
}
finally {
  Pop-Location
}
