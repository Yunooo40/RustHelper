# Sends a sample Rust event to the local API (Windows / PowerShell).
#   ./scripts/test-webhook.ps1
# Optional env: API_BASE (default http://localhost:3000), WEBHOOK_SECRET.
$ErrorActionPreference = 'Stop'

$base = if ($env:API_BASE) { $env:API_BASE } else { 'http://localhost:3000' }
$secret = if ($env:WEBHOOK_SECRET) { $env:WEBHOOK_SECRET } else { '' }
$now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()

$body = @{
  server       = 'Atlas - EU 2X Medium'
  event        = 'oil_rig_small'
  status       = 'spawned'
  spawn_time   = $now
  next_respawn = $now + 1800   # respawns in 30 minutes
  timestamp    = (Get-Date).ToUniversalTime().ToString('o')
} | ConvertTo-Json

$headers = @{ 'Content-Type' = 'application/json' }
if ($secret) { $headers['x-webhook-secret'] = $secret }

Write-Host "POST $base/webhook/rust" -ForegroundColor Cyan
Invoke-RestMethod -Uri "$base/webhook/rust" -Method Post -Headers $headers -Body $body |
  ConvertTo-Json -Depth 5
