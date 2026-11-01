param([string]$Source = (Join-Path $PSScriptRoot '../src/assets/hamster-new-sheet.png'))
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$sheet = [System.Drawing.Bitmap]::new((Resolve-Path -LiteralPath $Source).Path)
try {
  if ($sheet.Width % 6 -ne 0 -or $sheet.Height % 3 -ne 0) { throw 'Expected six equal columns and three equal rows.' }
  $cellWidth = [int]($sheet.Width / 6)
  $cellHeight = [int]($sheet.Height / 3)
  $assetDirectory = Split-Path -Parent (Resolve-Path -LiteralPath $Source).Path
  $frameDirectory = Join-Path $assetDirectory 'hamster-frames'
  [System.IO.Directory]::CreateDirectory($frameDirectory) | Out-Null
  $states = @('idle', 'run', 'jump')
  for ($row = 0; $row -lt 3; $row++) {
    $strip = $sheet.Clone([System.Drawing.Rectangle]::new(0, $row * $cellHeight, $sheet.Width, $cellHeight), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try { $strip.Save((Join-Path $assetDirectory "hamster-$($states[$row]).png"), [System.Drawing.Imaging.ImageFormat]::Png) } finally { $strip.Dispose() }
    for ($column = 0; $column -lt 6; $column++) {
      $frame = $sheet.Clone([System.Drawing.Rectangle]::new($column * $cellWidth, $row * $cellHeight, $cellWidth, $cellHeight), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      try { $frame.Save((Join-Path $frameDirectory ("{0}-{1:00}.png" -f $states[$row], ($column + 1))), [System.Drawing.Imaging.ImageFormat]::Png) } finally { $frame.Dispose() }
    }
  }
  Write-Output "Split into 18 equal ${cellWidth}x${cellHeight} frames and three six-frame strips; source pixels and alpha preserved."
} finally { $sheet.Dispose() }
