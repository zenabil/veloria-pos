#Requires -RunAsAdministrator
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\zenagui bilal\Desktop\Veloria POS dev zenagui bilal\docs\reports\maintenance\elevated-step5.log'
function L($m){ $t = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'; "$t $m" | Tee-Object -FilePath $log -Append }
L '=== STEP 5 start (Python full wipe + clean reinstall) ==='
try {
  $out = winget uninstall --id Python.Python.3.12 --silent --accept-source-agreements 2>&1 | Out-String
  L ('winget uninstall tail: ' + ($out -split "`n" | Select-Object -Last 3 | Out-String).Trim())
} catch { L ('winget uninstall FAILED: ' + $_.Exception.Message) }
Start-Sleep -Seconds 10
if (Test-Path 'C:\Program Files\Python312') {
  try { Remove-Item 'C:\Program Files\Python312' -Recurse -Force -ErrorAction Stop; L 'old Python312 dir removed' }
  catch { L ('old dir removal FAILED: ' + $_.Exception.Message) }
} else { L 'old Python312 dir already absent' }
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $exe = "$env:TEMP\python-3.12.10-amd64.exe"
  (New-Object Net.WebClient).DownloadFile('https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe', $exe)
  L ("downloaded: " + (Get-Item $exe).Length + " bytes")
  Start-Process -FilePath $exe -ArgumentList '/quiet InstallAllUsers=1 PrependPath=1' -Wait -NoNewWindow
  L 'installer finished'
  Remove-Item $exe -Force -ErrorAction SilentlyContinue
} catch { L ('installer FAILED: ' + $_.Exception.Message) }
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
L ("Lib present: " + (Test-Path 'C:\Program Files\Python312\Lib\encodings\__init__.py'))
L ("dir count: " + ((Get-ChildItem 'C:\Program Files\Python312' -ErrorAction SilentlyContinue | Measure-Object).Count))
try { $r = (& python -c "import sys; print('py-ok', sys.version.split()[0], sys.prefix)" 2>&1 | Out-String).Trim(); L ("python -c => $r") } catch { L 'python -c FAILED' }
L '=== STEP 5 done ==='
