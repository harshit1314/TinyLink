# PowerShell script to sanity-check TinyLink endpoints
param(
  [string]$Base = 'http://localhost:3000'
)

Write-Host "Checking health at $Base/healthz..."
try {
  $h = Invoke-RestMethod "$Base/healthz" -ErrorAction Stop
  Write-Host "Health:" ($h | ConvertTo-Json -Depth 1)
} catch {
  Write-Error "Health check failed: $_"
  exit 1
}

Write-Host "Creating a short link..."
$body = @{ url = 'https://example.com/long/path' } | ConvertTo-Json
try {
  $create = Invoke-RestMethod -Method Post -Uri "$Base/api/links" -Body $body -ContentType 'application/json' -ErrorAction Stop
  Write-Host "Created:" ($create | ConvertTo-Json -Depth 2)
} catch {
  Write-Error "Create failed: $_"
  exit 1
}

$code = $create.code
Write-Host "Checking stats for code $code..."
try {
  $stat = Invoke-RestMethod "$Base/api/links/$code" -ErrorAction Stop
  Write-Host ($stat | ConvertTo-Json -Depth 2)
} catch {
  Write-Error "Stats fetch failed: $_"
  exit 1
}

Write-Host "Testing redirect (no auto-redirect)..."
$handler = New-Object System.Net.Http.HttpClientHandler
$handler.AllowAutoRedirect = $false
$client = New-Object System.Net.Http.HttpClient($handler)
$resp = $client.GetAsync("$Base/$code").Result
Write-Host "Redirect status:" $resp.StatusCode
if ($resp.Headers.Location) { Write-Host "Location:" $resp.Headers.Location }

Write-Host "Re-checking stats to ensure clicks incremented..."
$stat2 = Invoke-RestMethod "$Base/api/links/$code" -ErrorAction Stop
Write-Host ($stat2 | ConvertTo-Json -Depth 2)

Write-Host "Deleting link $code..."
try {
  $del = Invoke-RestMethod -Method Delete "$Base/api/links/$code" -ErrorAction Stop
  Write-Host "Deleted:" ($del | ConvertTo-Json -Depth 1)
} catch {
  Write-Error "Delete failed: $_"
  exit 1
}

Write-Host "Confirming redirect now returns 404..."
$resp2 = $client.GetAsync("$Base/$code").Result
Write-Host "Status after delete:" $resp2.StatusCode
if ($resp2.StatusCode -eq [System.Net.HttpStatusCode]::NotFound) {
  Write-Host "Redirect correctly returns 404 after deletion."
} else {
  Write-Warning "Unexpected status after delete: $($resp2.StatusCode)"
}

Write-Host "All checks complete."
