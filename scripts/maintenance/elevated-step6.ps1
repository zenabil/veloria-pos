$log = Join-Path (Split-Path -Parent $PSScriptRoot) '..\docs\reports\maintenance\elevated-step6.log'
function L($m){ $t = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'; "$t $m" | Tee-Object -FilePath $log -Append }
L '=== STEP 6 start (Python clean install, explicit features) ==='
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$exe = "$env:TEMP\python-3.12.10-amd64.exe"
(New-Object Net.WebClient).DownloadFile('https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe', $exe)
L ("downloaded: " + (Get-Item $exe).Length)
Start-Process -FilePath $exe -ArgumentList '/quiet InstallAllUsers=1 PrependPath=1 Include_doc=0 Include_debug=0 Include_dev=1 Include_exe=1 Include_launcher=1 Include_lib=1 Include_pip=1 Include_symbols=0 Include_tcltk=1 Include_test=0 Include_tools=1' -Wait -NoNewWindow
L 'installer finished'
Remove-Item $exe -Force -ErrorAction SilentlyContinue
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')
L ("Lib present: " + (Test-Path 'C:\Program Files\Python312\Lib\encodings\__init__.py'))
try { $r = (& python -c "import sys; print('py-ok', sys.version.split()[0], sys.prefix)" 2>&1 | Out-String).Trim(); L ("python -c => $r") } catch { L 'python -c FAILED' }
L '=== STEP 6 done ==='
