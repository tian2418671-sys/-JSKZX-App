# 生成应用图标 build/icon.ico (256x256)
# 设计：蓝紫渐变圆角背景 + 白色角色卡 + "ST" 文字 + 金色星标
Add-Type -AssemblyName System.Drawing

$size = 256
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

# 圆角矩形路径
function New-RoundedRectPath($x, $y, $w, $h, $r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $r * 2
    $p.AddArc($x, $y, $d, $d, 180, 90)
    $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $p.CloseFigure()
    return $p
}

# 1. 蓝紫渐变圆角背景
$bgPath = New-RoundedRectPath 8 8 240 240 48
$bgRect = New-Object System.Drawing.Rectangle(0, 0, $size, $size)
$bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($bgRect, `
    ([System.Drawing.Color]::FromArgb(37, 99, 235)), `
    ([System.Drawing.Color]::FromArgb(147, 51, 234)), 45)
$g.FillPath($bgBrush, $bgPath)

# 2. 白色角色卡（圆角矩形）
$cardPath = New-RoundedRectPath 44 58 168 140 18
$g.FillPath([System.Drawing.Brushes]::White, $cardPath)
# 卡片描边
$cardPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(30, 59, 138), 3)
$g.DrawPath($cardPen, $cardPath)

# 3. 卡片内 "ST" 文字
$font = New-Object System.Drawing.Font("Segoe UI", 64, [System.Drawing.FontStyle]::Bold)
$textBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(37, 99, 235))
$fmt = New-Object System.Drawing.StringFormat
$fmt.Alignment = [System.Drawing.StringAlignment]::Center
$fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
$textRect = New-Object System.Drawing.RectangleF(44, 58, 168, 140)
$g.DrawString("ST", $font, $textBrush, $textRect, $fmt)

# 4. 右上角金色星标
$starBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(251, 191, 36))
$g.FillEllipse($starBrush, 196, 26, 30, 30)
$starFont = New-Object System.Drawing.Font("Segoe UI", 18, [System.Drawing.FontStyle]::Bold)
$g.DrawString("★", $starFont, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF(196, 26, 30, 30)), $fmt)

# 保存 PNG
if (-not (Test-Path "build")) { New-Item -ItemType Directory -Path "build" | Out-Null }
$pngPath = "build/icon.png"
$bmp.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)

# 将 PNG 封装为 ICO (256x256，ICO 容器内嵌 PNG 数据)
$pngBytes = [System.IO.File]::ReadAllBytes((Resolve-Path $pngPath))
$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter($ms)
$bw.Write([UInt16]0)          # reserved
$bw.Write([UInt16]1)          # type = icon
$bw.Write([UInt16]1)          # image count
$bw.Write([Byte]0)            # width 0 = 256
$bw.Write([Byte]0)            # height 0 = 256
$bw.Write([Byte]0)            # colors
$bw.Write([Byte]0)            # reserved
$bw.Write([UInt16]1)          # planes
$bw.Write([UInt16]32)         # bit count
$bw.Write([UInt32]$pngBytes.Length)  # data size
$bw.Write([UInt32]22)         # offset to data
$bw.Write($pngBytes)
$bw.Flush()
[System.IO.File]::WriteAllBytes((Join-Path (Get-Location) "build/icon.ico"), $ms.ToArray())

$g.Dispose(); $bmp.Dispose()
Write-Host "图标已生成: build/icon.ico ($((Get-Item build/icon.ico).Length) bytes)"
