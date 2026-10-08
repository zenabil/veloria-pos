#Requires -RunAsAdministrator
$ErrorActionPreference = 'Continue'
$log = 'C:\Users\zenagui bilal\Desktop\Veloria POS dev zenagui bilal\docs\reports\maintenance\elevated-step4.log'
function L($m){ $t = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'; "$t $m" | Tee-Object -FilePath $log -Append }
L '=== STEP 4 start (IDM shell ext + official Python installer) ==='

# 1. Unregister orphan IDM shell extension, then remove residual dir
$dll = 'C:\Program Files (x86)\Internet Download Manager\IDMShellExt64.dll'
if (Test-Path $dll) {
  try { Start-Process regsvr32.exe -ArgumentList "/s /u `"$dll`"" -Wait -NoNewWindow; L 'regsvr32 /u done' }
  catch { L ('regsvr32 FAILED: ' + $_.Exception.Message) }
}
$idm = 'C:\Program Files (x86)\Internet Download Manager'
if (Test-Path $idm) {
  try { Remove-Item $idm -Recurse -Force -ErrorAction Stop; L 'IDM residual dir REMOVED' }
  catch { L ('IDM dir removal FAILED: ' + $_.Exception.Message) }
} else { L 'IDM dir already absent' }

# 2. Official python.org installer (python.org/ftp), silent per-machine + PATH
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $exe = "$env:TEMP\python-3.12.10-amd64.exe"
  (New-Object Net.WebClient).DownloadFile('https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe', $exe)
  L ("python installer downloaded: " + (Get-Item $exe).Length + " bytes")
  Start-Process -FilePath $exe -ArgumentList '/quiet InstallAllUsers=1 PrependPath=1 Include_test=0' -Wait -NoNewWindow
  L 'python installer finished'
  Remove-Item $exe -Force -ErrorAction SilentlyContinue
} catch { L ('Python installer FAILED: ' + $_.Exception.Message) }

$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
foreach ($p in @('C:\Program Files\Python312\python.exe')) { L ("$p present: " + (Test-Path $p)) }
try { $r = (& python --version 2>&1 | Out-String).Trim(); L ("python --version => $r") } catch { L 'python --version FAILED' }
try { $r = (& py -0p 2>&1 | Out-String).Trim(); L ("py -0p => $r") } catch { L 'py -0p FAILED' }
L '=== STEP 4 done ==='
