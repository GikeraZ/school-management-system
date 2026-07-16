<#
.SYNOPSIS
  One-command setup for the School Management System.
  Applies migrations + seed, deploys Twilio edge functions, and writes .env.

.PARAMETER Mode
  local  - spin up a local Supabase stack via Docker (no account needed)
  cloud  - use an existing Supabase cloud project (pass -ProjectRef / -DbPassword)

.EXAMPLE
  .\scripts\setup.ps1 -Mode local
  .\scripts\setup.ps1 -Mode cloud -ProjectRef abcdefghijklmno -DbPassword <db-pass>
#>
param(
  [ValidateSet("local", "cloud")] [string] $Mode = "local",
  [string] $ProjectRef = "",
  [string] $DbPassword = "postgres",
  [string] $TWILIO_ACCOUNT_SID = $env:TWILIO_ACCOUNT_SID,
  [string] $TWILIO_AUTH_TOKEN = $env:TWILIO_AUTH_TOKEN,
  [string] $TWILIO_PHONE_NUMBER = $env:TWILIO_PHONE_NUMBER,
  [string] $SMS_SENDER_NAME = $env:SMS_SENDER_NAME
)

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Push-Location $root

function Need-Supabase {
  if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Host "`n[!] 'supabase' CLI not found on PATH." -ForegroundColor Yellow
    Write-Host "    Install it (one of):" -ForegroundColor Yellow
    Write-Host "      winget install Supabase.CLI" -ForegroundColor Cyan
    Write-Host "      scoop install supabase" -ForegroundColor Cyan
    Write-Host "      or download from https://supabase.com/docs/guides/cli" -ForegroundColor Cyan
    throw "Missing Supabase CLI"
  }
}

function Parse-Status([string]$text, [string]$label) {
  if ($text -match "(?m)^\s*$label\s*[:=]\s*(\S+)") { return $Matches[1] }
  return $null
}

Need-Supabase

if ($Mode -eq "local") {
  if (-not (Test-Path "supabase/config.toml")) {
    Write-Host "`n[1/6] supabase init" -ForegroundColor Cyan
    supabase init
  }
  Write-Host "`n[2/6] supabase start (Docker)" -ForegroundColor Cyan
  supabase start
  Write-Host "`n[3/6] apply migrations + seed" -ForegroundColor Cyan
  supabase db reset
  $status = supabase status 2>$null | Out-String
  $apiUrl = Parse-Status $status "API URL"
  $anon   = Parse-Status $status "anon key"
  if (-not $apiUrl) { $apiUrl = "http://127.0.0.1:54321" }
  if (-not $anon)   { Write-Host "[!] Could not read anon key from 'supabase status'." -ForegroundColor Yellow }
}
else {
  if (-not $ProjectRef) { throw "Cloud mode requires -ProjectRef <project-ref>" }
  Write-Host "`n[1/6] supabase link" -ForegroundColor Cyan
  supabase link --project-ref $ProjectRef --password $DbPassword
  Write-Host "`n[2/6] push migrations" -ForegroundColor Cyan
  supabase db push
  Write-Host "`n[3/6] apply seed (demo head teacher + sample data)" -ForegroundColor Cyan
  $dbUrl = "postgresql://postgres.$ProjectRef`:$DbPassword@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
  $env:PGPASSWORD = $DbPassword
  psql "$dbUrl" -f "supabase/seed.sql" 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Host "[!] Seed via psql failed; run supabase/seed.sql manually in the SQL editor." -ForegroundColor Yellow }
  $status = supabase status 2>$null | Out-String
  $apiUrl = Parse-Status $status "API URL"
  $anon   = Parse-Status $status "anon key"
  if (-not $apiUrl) { $apiUrl = "https://$ProjectRef.supabase.co" }
}

Write-Host "`n[4/6] deploy edge functions" -ForegroundColor Cyan
supabase functions deploy send-sms
supabase functions deploy send-bulk-sms
supabase functions deploy weekly-fee-reminder

Write-Host "`n[5/6] Twilio secrets" -ForegroundColor Cyan
if ($TWILIO_ACCOUNT_SID -and $TWILIO_AUTH_TOKEN -and $TWILIO_PHONE_NUMBER) {
  supabase secrets set TWILIO_ACCOUNT_SID=$TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN=$TWILIO_AUTH_TOKEN TWILIO_PHONE_NUMBER=$TWILIO_PHONE_NUMBER SMS_SENDER_NAME=$($SMS_SENDER_NAME)
  Write-Host "      Twilio secrets set." -ForegroundColor Green
} else {
  Write-Host "      Skipped: set TWILIO_* env vars and re-run, or set them in the Supabase dashboard." -ForegroundColor Yellow
}

Write-Host "`n[6/6] write .env" -ForegroundColor Cyan
@"
VITE_SUPABASE_URL=$apiUrl
VITE_SUPABASE_ANON_KEY=$anon
"@ | Set-Content ".env"
Write-Host "      .env written." -ForegroundColor Green

Write-Host "`nDone. Run:  npm run dev" -ForegroundColor Green
Write-Host "Login:  head@school.ac.ke / School@123" -ForegroundColor Green
Pop-Location
