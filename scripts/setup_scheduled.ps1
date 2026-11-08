# Postavlja zakazane zadatke za hmnl.hr u Windows Task Scheduleru (na računalu koje je stalno upaljeno).
# Pokretanje: desni klik na PowerShell -> "Run as administrator", pa:
#   cd D:\futsal-analiza
#   powershell -ExecutionPolicy Bypass -File scripts\setup_scheduled.ps1            # Semafor samo provjerava
#   powershell -ExecutionPolicy Bypass -File scripts\setup_scheduled.ps1 -Upis      # Semafor i upisuje
# Ponovno pokretanje zamijeni postojeće zadatke (ništa se ne duplicira). Brisanje: -Ukloni.
#
# Zadaci:
#   HMNL Semafor  svaki dan od 10:00 do 23:30, svakih 30 min: scripts\semafor_sync.py (s -Upis: --upis)
#   HMNL backup   svaki dan u 04:00: scripts\backup_db.py (zadnjih 40 backupa = ~40 dana)
# Zapisi: run\semafor_sync.log i run\backup.log. Zadaci rade i kad nisi prijavljen (S4U, bez spremanja lozinke).
param([switch]$Upis, [switch]$Ukloni)
$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$py = Join-Path $repo ".venv\Scripts\python.exe"   # venv u repou ima prednost
if (-not (Test-Path $py)) { $py = (Get-Command python -ErrorAction SilentlyContinue).Source }
if (-not $py) { $py = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $py) { throw "Python nije pronađen u PATH-u." }
New-Item -ItemType Directory -Force -Path (Join-Path $repo "run") | Out-Null

$names = @("HMNL Semafor", "HMNL backup")
foreach ($n in $names) { if (Get-ScheduledTask -TaskName $n -ErrorAction SilentlyContinue) { Unregister-ScheduledTask -TaskName $n -Confirm:$false } }
if ($Ukloni) { Write-Host "Zadaci uklonjeni."; return }

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType S4U -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 25) -MultipleInstances IgnoreNew

function Cmd($script, $arguments, $log) {
    # cmd /c da se izlaz doda u log; radna mapa = repo (skripte čitaju .env iz njega)
    New-ScheduledTaskAction -Execute "cmd.exe" -WorkingDirectory $repo `
        -Argument "/c `"`"$py`" scripts\$script $arguments >> run\$log 2>&1`""
}

# Semafor: svaki dan u 10:00, pa svakih 30 min sljedećih 13,5 h (do 23:30)
$t1 = New-ScheduledTaskTrigger -Daily -At 10:00
$t1.Repetition = (New-ScheduledTaskTrigger -Once -At 10:00 -RepetitionInterval (New-TimeSpan -Minutes 30) -RepetitionDuration (New-TimeSpan -Hours 13 -Minutes 30)).Repetition
$mode = if ($Upis) { "--upis" } else { "" }
Register-ScheduledTask -TaskName "HMNL Semafor" -Description "hmnl.hr: usklađivanje s HNS Semaforom ($(if ($Upis) {'upis'} else {'samo provjera'}))" `
    -Action (Cmd "semafor_sync.py" $mode "semafor_sync.log") -Trigger $t1 -Principal $principal -Settings $settings | Out-Null

# Backup: svaki dan u 04:00
$t2 = New-ScheduledTaskTrigger -Daily -At 04:00
Register-ScheduledTask -TaskName "HMNL backup" -Description "hmnl.hr: backup baze u backups\" `
    -Action (Cmd "backup_db.py" "" "backup.log") -Trigger $t2 -Principal $principal -Settings $settings | Out-Null

Write-Host "Postavljeno u $repo (python: $py):"
Get-ScheduledTask -TaskName $names | ForEach-Object {
    $i = $_ | Get-ScheduledTaskInfo
    Write-Host ("  {0,-14} sljedeće pokretanje: {1}" -f $_.TaskName, $i.NextRunTime)
}
Write-Host "Semafor: $(if ($Upis) {'UPISUJE u bazu'} else {'samo provjera (za upis ponovi s -Upis)'})"
Write-Host "Probno pokretanje odmah: Start-ScheduledTask 'HMNL backup'  pa pogledaj run\backup.log"
