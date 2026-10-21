#Requires -RunAsAdministrator
$ErrorActionPreference = 'Continue'
$log = Join-Path (Split-Path -Parent $PSScriptRoot) '..\docs\reports\maintenance\elevated-step2.log'
function L($m){ $t = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'; "$t $m" | Tee-Object -FilePath $log -Append }
L '=== STEP 2 start (toolchain installs) ==='

# IDM residual check
L('--- IDM state ---')
Get-Process IDMan -ErrorAction SilentlyContinue | ForEach-Object { L ("IDMan still running pid $($_.Id)") }
if (-not (Get-Process IDMan -ErrorAction SilentlyContinue)) { L 'IDMan process: GONE' }
L ("IDM dir present: " + (Test-Path 'C:\Program Files (x86)\Internet Download Manager'))
L ("IDM uninstall reg: " + [bool](Get-ItemProperty 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -match 'Internet Download Manager'}))

# winget sanity
try { $w = (winget --version 2>&1 | Out-String).Trim(); L ("winget: $w") } catch { L 'winget FAILED' }

# 1-3. Git, Python 3.12, VS Code via winget (official stable)
foreach ($pkg in @('Git.Git','Python.Python.3.12','Microsoft.VisualStudioCode')) {
  L ("Installing $pkg ...")
  try {
    $out = winget install --id $pkg --silent --accept-package-agreements --accept-source-agreements 2>&1 | Out-String
    L ("$pkg exit done. tail: " + ($out -split "`n" | Select-Object -Last 3 | Out-String).Trim())
  } catch { L ("$pkg FAILED: " + $_.Exception.Message) }
}

# 4. Node 22 LTS via official nodejs.org MSI (engines: >=22.5 <23 — never 24/26)
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
  $idx = (New-Object Net.WebClient).DownloadString('https://nodejs.org/dist/index.json') | ConvertFrom-Json
  $v22 = ($idx | Where-Object { $_.version -match '^v22\.' } | Select-Object -First 1).version
  L ("Latest Node v22 = $v22")
  $msi = "$env:TEMP\node-$v22-x64.msi"
  (New-Object Net.WebClient).DownloadFile("https://nodejs.org/dist/$v22/node-$v22-x64.msi", $msi)
  L ("MSI downloaded: $((Get-Item $msi).Length) bytes")
  Start-Process msiexec.exe -ArgumentList "/i `"$msi`" /qn /norestart" -Wait -NoNewWindow
  L 'Node MSI install finished'
  Remove-Item $msi -Force -ErrorAction SilentlyContinue
} catch { L ("Node 22 FAILED: " + $_.Exception.Message) }

# Refresh PATH in this session for verification
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ';C:\Program Files\nodejs;C:\Program Files\Git\cmd'
foreach ($c in @('node --version','npm --version','git --version','python --version','code --version')) {
  try { $r = (Invoke-Expression $c 2>&1 | Out-String).Trim(); L ("$c => $r") } catch { L ("$c FAILED") }
}

# 5. VS Build Tools 2022 + VCTools + recommended (MSVC + Windows SDK), official aka.ms
try {
  $bt = "$env:TEMP\vs_BuildTools.exe"
  (New-Object Net.WebClient).DownloadFile('https://aka.ms/vs/17/release/vs_BuildTools.exe', $bt)
  L ("vs_BuildTools.exe downloaded: $((Get-Item $bt).Length) bytes")
  L 'Launching Build Tools install (VCTools + recommended, passive — this takes a long time) ...'
  Start-Process -FilePath $bt -ArgumentList '--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended --passive --norestart --wait' -Wait -NoNewWindow
  L 'Build Tools installer finished'
} catch { L ("Build Tools FAILED: " + $_.Exception.Message) }
try {
  $cl = Get-ChildItem 'C:\Program Files (x86)\Microsoft Visual Studio\2022\*\VC\Tools\MSVC\*\bin\Hostx64\x64\cl.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  L ("cl.exe: " + ($cl.FullName | Out-String).Trim())
  if (-not $cl) { L 'cl.exe NOT FOUND — Build Tools incomplete' }
} catch { L ("cl.exe check FAILED: " + $_.Exception.Message) }
L '=== STEP 2 done ==='
