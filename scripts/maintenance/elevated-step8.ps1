#Requires -RunAsAdministrator
$ErrorActionPreference = 'Continue'
$log = Join-Path (Split-Path -Parent $PSScriptRoot) '..\docs\reports\maintenance\elevated-step8.log'
function L($m){ $t = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'; "$t $m" | Tee-Object -FilePath $log -Append }
L '=== STEP 8 start (DB Browser correct ID + Terminal retry + Figma verify) ==='
L ("Figma exe present: " + (Test-Path "$env:LOCALAPPDATA\Figma\Figma.exe"))
foreach ($pkg in @('DBBrowserForSQLite.DBBrowserForSQLite','Microsoft.WindowsTerminal')) {
  L ("Installing $pkg ...")
  try {
    $out = winget install --id $pkg --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-String
    L ("$pkg done. tail: " + ($out -split "`n" | Select-Object -Last 3 | Out-String).Trim())
  } catch { L ("$pkg FAILED: " + $_.Exception.Message) }
}
L ("DB Browser exe: " + ((Get-ChildItem 'C:\Program Files\DB Browser for SQLite\DB Browser for SQLite.exe' -ErrorAction SilentlyContinue).FullName | Out-String).Trim())
L ("Terminal exe: " + ((Get-ChildItem 'C:\Program Files\WindowsApps\Microsoft.WindowsTerminal_*' -Directory -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName | Out-String).Trim()))
L '=== STEP 8 done ==='
