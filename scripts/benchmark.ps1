# Run from the cloned repository with Windows PowerShell or PowerShell 7.
param([Parameter(Mandatory = $true)][ValidateSet('before','after')][string]$Stage)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$folder = Join-Path $root 'benchmark-data'
New-Item -Path $folder -ItemType Directory -Force | Out-Null

if (-not (Get-Command rtk -ErrorAction SilentlyContinue)) {
    throw 'RTK not found in PATH. Restart terminal or check your RTK installation.'
}
$jsonText = (& rtk gain --all --format json | Out-String)
if ($LASTEXITCODE -ne 0) { throw 'rtk gain failed. Keep baseline unchanged.' }
$jsonData = $jsonText | ConvertFrom-Json
if (-not $jsonData.summary) { throw 'RTK JSON did not include a summary.' }

$file = Join-Path $folder "rtk-$Stage.json"
[System.IO.File]::WriteAllText($file, $jsonText, [System.Text.UTF8Encoding]::new($false))
Write-Host "RTK $Stage snapshot saved to $file"

if ($Stage -ne 'after') { return }
$beforeFile = Join-Path $folder 'rtk-before.json'
if (-not (Test-Path $beforeFile)) { throw "Missing baseline: $beforeFile" }
$before = Get-Content -LiteralPath $beforeFile -Raw | ConvertFrom-Json
$after = $jsonData
$measureNames = @('total_commands','total_input','total_output','total_saved')
$report = [ordered]@{}
foreach ($name in $measureNames) {
    $report[$name] = [double]$after.summary.$name - [double]$before.summary.$name
}
$report['saved_pct_of_raw_output'] = if ($report['total_input'] -gt 0) {
    [Math]::Round(100 * $report['total_saved'] / $report['total_input'], 2)
} else { 0 }
$report['note'] = 'Global RTK estimated Bash output reduction; not weekly Claude Pro usage.'
$reportJson = $report | ConvertTo-Json -Depth 5
[System.IO.File]::WriteAllText((Join-Path $folder 'rtk-delta.json'), $reportJson, [System.Text.UTF8Encoding]::new($false))
$reportText = ($report | Out-String)
[System.IO.File]::WriteAllText((Join-Path $folder 'rtk-delta.txt'), $reportText, [System.Text.UTF8Encoding]::new($false))
$report | Format-Table -AutoSize | Out-Host
Write-Host 'Keep RTK and CMR metrics separate from the observed weekly quota percentage.'
