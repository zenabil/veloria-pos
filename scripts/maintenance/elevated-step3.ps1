#Requires -RunAsAdministrator
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\zenagui bilal\Desktop\Veloria POS dev zenagui bilal\docs\reports\maintenance\elevated-step3.log'
function L($m){ $t = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'; "$t $m" | Tee-Object -FilePath $log -Append }
L '=== STEP 3 start (Python repair/reinstall + IDM residual dir) ==='

# IDM residual dir (uninstaller done, reg gone, process gone — remove leftover files)
$idm = 'C:\Program Files (x86)\Internet Download Manager'
if (Test-Path $idm) {
  $n = (Get-ChildItem $idm -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object).Count
  L ("IDM residual dir: $n items")
  try { Remove-Item $idm -Recurse -Force -ErrorAction Stop; L 'IDM residual dir REMOVED' }
  catch { L ('IDM dir removal FAILED: ' + $_.Exception.Message) }
} else { L 'IDM dir already absent' }

$codes = @('{0158093D-F809-455B-9429-6D16A4B5D118}','{01F171AF-1F21-435E-BEE4-FCC4360C896C}','{18DF3488-2245-432B-A023-3AA05C2A00C8}','{4A285122-D2B5-4C35-A279-CE9BD2CA15A0}','{75485683-EF03-41E6-BF21-D1491694548C}','{9D09C9EF-A57C-422A-B79A-CC922079653A}','{CD0A1663-DC2D-41BD-89AF-E1089E841822}','{DE12B597-D4BF-4B1B-BF5F-C5CE41AFBDFC}','{EF4A3D60-9A53-4697-A18D-D3353F8554E6}')

function Find-Python {
  foreach ($p in @('C:\Program Files\Python312\python.exe','C:\Python312\python.exe')) { if (Test-Path $p) { return $p } }
  return $null
}

# Attempt 1: repair all components from local MSI cache
L 'Attempt 1: msiexec repair (/fa) ...'
foreach ($c in $codes) {
  try { Start-Process msiexec.exe -ArgumentList "/fa $c /qn /norestart" -Wait -NoNewWindow } catch { L ("repair $c error: " + $_.Exception.Message) }
}
$found = Find-Python
L ("After repair, python.exe: $found")

# Attempt 2: full remove + clean reinstall via winget
if (-not $found) {
  L 'Attempt 2: uninstall all Python 3.12.10 MSI products ...'
  foreach ($c in $codes) {
    try { Start-Process msiexec.exe -ArgumentList "/x $c /qn /norestart" -Wait -NoNewWindow } catch {}
  }
  L 'Reinstalling Python.Python.3.12 via winget ...'
  try {
    $out = winget install --id Python.Python.3.12 --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-String
    L ('winget reinstall tail: ' + ($out -split "`n" | Select-Object -Last 3 | Out-String).Trim())
  } catch { L ('winget reinstall FAILED: ' + $_.Exception.Message) }
  $found = Find-Python
  L ("After reinstall, python.exe: $found")
}

$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
try { $r = (python --version 2>&1 | Out-String).Trim(); L ("python --version => $r") } catch { L 'python --version FAILED' }
try { $r = (py --version 2>&1 | Out-String).Trim(); L ("py --version => $r") } catch { L 'py --version FAILED' }
L ("Machine PATH: " + [Environment]::GetEnvironmentVariable('Path','Machine'))
L '=== STEP 3 done ==='
