#Requires -RunAsAdministrator
# Cleanup Admin - Veloria: VS Build Tools 2022 (old) + Windows SDK 7705 (old) + system residues
# Usage: right-click -> Run with PowerShell as Administrator
$ErrorActionPreference = 'Continue'

function Write-Step($msg){ Write-Host "`n=== $msg ===" -ForegroundColor Cyan }

# 0. Admin check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if(-not $isAdmin){ Write-Error "Run as Administrator."; exit 1 }

# 1. Restore point
Write-Step "1/6 Point de restauration"
try {
  Enable-ComputerRestore -Drive "C:\" -ErrorAction SilentlyContinue
  vssadmin resize shadowstorage /for=C: /on=C: /maxsize=5% 2>$null | Out-Null
  Checkpoint-Computer -Description "Pre-Cleanup LMStudio+VS2022+SDK7705" -RestorePointType "MODIFY_SETTINGS"
  Write-Host "Restore point created." -ForegroundColor Green
  Get-ComputerRestorePoint | Select-Object -Last 1 | Format-List Description, CreationTime
} catch { Write-Warning "Restore point failed: $_" }

# 2. Uninstall VS Build Tools 2022 (keep 2026)
Write-Step "2/6 Desinstallation VS Build Tools 2022 (ancien, garde 2026)"
$setup = "C:\Program Files (x86)\Microsoft Visual Studio\Installer\setup.exe"
$bt2022 = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"
$bt18 = "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools"
if(Test-Path $bt2022){
  Write-Host "Found: $bt2022"
  if(Test-Path $setup){
    Write-Host "Running setup.exe uninstall (quiet, peut durer 10-20 min)..."
    & $setup uninstall --installPath "$bt2022" --quiet --wait --norestart
    Write-Host "Exit code: $LASTEXITCODE"
  } else { Write-Warning "setup.exe introuvable" }
} else { Write-Host "VS2022 BuildTools deja absent." }
if(Test-Path $bt18){ Write-Host "VS2026 conserve: $bt18" -ForegroundColor Green } else { Write-Warning "VS2026 introuvable! Ne supprimez pas tout si vous compilez better-sqlite3." }

# 3. Uninstall Windows SDK old 7705 only (keep 8249)
Write-Step "3/6 Desinstallation Windows SDK 7705 (ancien, garde 8249)"
$oldSdk = "C:\ProgramData\Package Cache\{c0b93b80-d0a4-47fc-a4d1-21a4008a63ca}\winsdksetup.exe"
$newSdk = "C:\ProgramData\Package Cache\{204d0387-6d9a-48cf-bb7d-93d49ec0141c}\winsdksetup.exe"
if(Test-Path $oldSdk){
  Write-Host "Found old SDK 7705, uninstall /quiet..."
  & $oldSdk /uninstall /quiet /norestart
  Write-Host "Exit code: $LASTEXITCODE"
} else { Write-Host "Old SDK 7705 setup not found (peut-etre deja supprime)." }
if(Test-Path $newSdk){ Write-Host "New SDK 8249 conserve." -ForegroundColor Green }
Write-Host "NE PAS supprimer C:\Program Files (x86)\Windows Kits\10 manuellement car 8249 l'utilise."

# 4. Residues (only removed products)
Write-Step "4/6 Residus ciblés (sans toucher SDK 8249 / VS2026)"
$targets = @(
  "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools",
  "$env:ProgramData\Microsoft\VisualStudio\Packages\_Instances"
)
foreach($t in $targets){ if(Test-Path $t){ Write-Host "Check $t"; Get-ChildItem $t -ErrorAction SilentlyContinue | Measure-Object | Select-Object Count } }
# LM Studio machine-wide leftovers (normalement deja nettoye en user)
@("$env:ProgramData\LM Studio") | ForEach-Object { if(Test-Path $_){ Remove-Item -Recurse -Force $_ -ErrorAction SilentlyContinue; Write-Host "Removed $_" } }
# Dead shortcuts
$lnkPaths = @("$env:ProgramData\Microsoft\Windows\Start Menu\Programs", "$env:PUBLIC\Desktop")
foreach($base in $lnkPaths){
  Get-ChildItem $base -Filter "*.lnk" -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.Name -match "LM Studio" } | ForEach-Object { Remove-Item $_.FullName -Force; Write-Host "Removed shortcut $($_.FullName)" }
}
# Dead Startup (registry Run) pointing to removed paths
$runKeys = @("HKLM:\Software\Microsoft\Windows\CurrentVersion\Run", "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Run", "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run")
foreach($k in $runKeys){
  if(Test-Path $k){
    Get-ItemProperty $k -ErrorAction SilentlyContinue | Get-Member -MemberType NoteProperty | Where-Object { $_.Name -notin @("PSPath","PSParentPath","PSChildName","PSDrive","PSProvider") } | ForEach-Object {
      $n=$_.Name; $v=(Get-ItemProperty $k).$n
      if($v -match "LM Studio|\\2022\\BuildTools|winsdksetup.*7705"){ Write-Host "DEAD Run entry: $k\$n = $v"; Remove-ItemProperty -Path $k -Name $n -ErrorAction SilentlyContinue; Write-Host " -> removed" }
    }
  }
}
# Dead scheduled tasks
Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match "LM Studio|LMStudio" -or $_.Actions.Execute -match "LM Studio" } | ForEach-Object { Write-Host "Removing task $($_.TaskPath)$($_.TaskName)"; Unregister-ScheduledTask -TaskName $_.TaskName -TaskPath $_.TaskPath -Confirm:$false -ErrorAction SilentlyContinue }
# Dead services
Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match "LM Studio" -or $_.Name -match "LMStudio" } | ForEach-Object { Write-Host "Dead service: $($_.Name)"; sc.exe delete $_.Name }

# 5. Temp systeme
Write-Step "5/6 Temporaires systeme"
Write-Host "Windows Temp..."; Remove-Item "C:\Windows\Temp\*" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Delivery Optimization..."; Remove-Item "C:\Windows\SoftwareDistribution\DeliveryOptimization\*" -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "Prefetch vieux (>30j, .pf seulement)..."; Get-ChildItem "C:\Windows\Prefetch\*.pf" -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-30) } | Remove-Item -Force -ErrorAction SilentlyContinue
Write-Host "Corbeille..."; Clear-RecycleBin -Force -ErrorAction SilentlyContinue
cleanmgr /verylowdisk 2>$null | Out-Null
Write-Host "Disk:"; Get-PSDrive C | Select-Object Used, Free

# 6. Verification
Write-Step "6/6 Verification"
Write-Host "-- VS --"; Test-Path "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools"; Test-Path "C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools"
Write-Host "-- SDK --"; Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*, HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\* -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match "Windows Software Development Kit" } | Select-Object DisplayName
Write-Host "-- LM Studio --"; Get-ItemProperty HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*, HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\* -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match "LM Studio" } | Select-Object DisplayName
if(-not (Test-Path "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools")){ Write-Host "VS2022 removed OK" -ForegroundColor Green }
Write-Host "`nTermine. Redemarrez si invite."
