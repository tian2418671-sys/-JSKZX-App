# 旧版本资产备份脚本：从各旧 Release 下载资产 → 重命名 → 上传到备份 Release
$ErrorActionPreference = 'Continue'
$tmp = Join-Path $PWD '.gh_backup_tmp'
New-Item -ItemType Directory -Path $tmp -Force | Out-Null

$jobs = @(
    @{ tag = 'v1.4.0'; asset = 'SillyTavern.Setup.1.4.0.exe'; as = 'SillyTavern.Setup.1.4.0.exe' },
    @{ tag = 'v1.4.0'; asset = 'SillyTavern.zip';             as = 'SillyTavern.1.4.0.zip' },
    @{ tag = 'v1.4.1'; asset = 'SillyTavern.Setup.1.4.1.exe'; as = 'SillyTavern.Setup.1.4.1.exe' },
    @{ tag = 'v1.4.1'; asset = 'SillyTavern.zip';             as = 'SillyTavern.1.4.1.zip' },
    @{ tag = 'v1.5.0'; asset = 'SillyTavern.Setup.1.5.0.exe'; as = 'SillyTavern.Setup.1.5.0.exe' },
    @{ tag = 'v1.6.0'; asset = 'SillyTavern.Setup.1.6.0.exe'; as = 'SillyTavern.Setup.1.6.0.exe' },
    @{ tag = 'v1.6.0'; asset = 'SillyTavern.zip';             as = 'SillyTavern.1.6.0.zip' }
)

foreach ($j in $jobs) {
    Write-Host "=== [$($j.tag)] $($j.asset) -> $($j.as) ==="
    gh release download $j.tag --pattern $j.asset --dir $tmp --clobber 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { Write-Host "!! 下载失败 $($j.asset)"; continue }
    $src = Join-Path $tmp $j.asset
    $dst = Join-Path $tmp $j.as
    if (-not (Test-Path $src)) { Write-Host "!! 文件不存在 $src"; continue }
    if ($j.asset -ne $j.as) { Move-Item $src $dst -Force }
    gh release upload old-versions-backup "$dst#$($j.as)" --clobber 2>&1 | Out-Host
    if ($LASTEXITCODE -eq 0) { Remove-Item $dst -Force -ErrorAction SilentlyContinue; Write-Host "OK 完成 $($j.as)" }
    else { Write-Host "!! 上传失败 $($j.as)" }
}

Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "=== 全部备份任务结束 ==="
