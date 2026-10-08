#Requires -RunAsAdministrator
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\zenagui bilal\Desktop\Veloria POS dev zenagui bilal\docs\reports\maintenance\elevated-step7.log'
function L($m){ $t = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'; "$t $m" | Tee-Object -FilePath $log -Append }
L '=== STEP 7 start (DB Browser, Figma, Windows Terminal) ==='
foreach ($pkg in @('DBHub.DBBrowserforSQLite','Figma.Figma','Microsoft.WindowsTerminal')) {
  L ("Installing $pkg ...")
  try {
    $out = winget install --id $pkg --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-String
    L ("$pkg done. tail: " + ($out -split "`n" | Select-Object -Last 3 | Out-String).Trim())
  } catch { L ("$pkg FAILED: " + $_.Exception.Message) }
}
L '=== STEP 7 done ==='
