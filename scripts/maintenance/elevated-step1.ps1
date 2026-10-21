#Requires -RunAsAdministrator
$ErrorActionPreference = 'Continue'
$log = Join-Path (Split-Path -Parent $PSScriptRoot) '..\docs\reports\maintenance\elevated-step1.log'
function L($m){ $t = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'; "$t $m" | Tee-Object -FilePath $log -Append }
L '=== STEP 1 start (restore point, Defender, machine PATH, uninstalls) ==='

# 1. Restore point
try {
  Enable-ComputerRestore -Drive 'C:\' -ErrorAction SilentlyContinue
  Checkpoint-Computer -Description 'Veloria maintenance 2026-10-03' -RestorePointType 'MODIFY_SETTINGS'
  L 'Restore point: CREATED'
} catch { L ("Restore point FAILED: " + $_.Exception.Message) }
Get-ComputerRestorePoint | Select-Object -Last 2 CreationTime,Description | ForEach-Object { L ("RP: $($_.CreationTime) $($_.Description)") }

# 2. Defender real-time protection back on
try {
  Set-MpPreference -DisableRealtimeMonitoring $false
  $v = (Get-MpPreference).DisableRealtimeMonitoring
  L ("Defender DisableRealtimeMonitoring now = $v (expect False)")
} catch { L ("Defender FAILED: " + $_.Exception.Message) }

# 3. Machine PATH prune (orphans only)
try {
  $m = [Environment]::GetEnvironmentVariable('Path','Machine')
  L ("Machine PATH before: $m")
  $orphans = @('C:\ProgramData\chocolatey\bin','C:\Users\zenagui bilal\AppData\Local\nvm')
  $parts = $m -split ';' | Where-Object { $_ -and ($orphans -notcontains $_.TrimEnd('\')) }
  [Environment]::SetEnvironmentVariable('Path',($parts -join ';'),'Machine')
  L ("Machine PATH after: " + [Environment]::GetEnvironmentVariable('Path','Machine'))
} catch { L ("Machine PATH FAILED: " + $_.Exception.Message) }

# 4. Stop bloatware processes
'DriverBooster','UninstallMonitor','IDMan','IObitUninstaller' | ForEach-Object {
  Get-Process -Name $_ -ErrorAction SilentlyContinue | ForEach-Object { try { $_.Kill(); L ("Killed process $_") } catch {} }
}

# 5. Official uninstallers (Inno /VERYSILENT; IDM best-effort quiet)
$jobs = @(
  @{ Name='Driver Booster 13'; Exe='C:\Program Files (x86)\IObit\Driver Booster\13.6.0\unins000.exe'; Args='/VERYSILENT /NORESTART' },
  @{ Name='IObit Uninstaller 16'; Exe='C:\Program Files (x86)\IObit\IObit Uninstaller\unins000.exe'; Args='/VERYSILENT /NORESTART' },
  @{ Name='IDM 6.43.10'; Exe='C:\Program Files (x86)\Internet Download Manager\Uninstall.exe'; Args='' }
)
foreach ($u in $jobs) {
  if (Test-Path $u.Exe) {
    L ("Uninstalling $($u.Name) ...")
    try {
      if ($u.Args) { Start-Process -FilePath $u.Exe -ArgumentList $u.Args -Wait -NoNewWindow }
      else { Start-Process -FilePath $u.Exe -Wait -NoNewWindow }
      L ("$($u.Name) uninstaller exit, still present: $(Test-Path $u.Exe)")
    } catch { L ("$($u.Name) FAILED: " + $_.Exception.Message) }
  } else { L ("$($u.Name): exe already absent") }
}
Get-Service IObitUnSvr -ErrorAction SilentlyContinue | ForEach-Object { L ("IObitUnSvr service still present: $($_.Status)") }
if (-not (Get-Service IObitUnSvr -ErrorAction SilentlyContinue)) { L 'IObitUnSvr service: GONE' }
L '=== STEP 1 done ==='
