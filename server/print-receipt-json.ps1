
param(
    [string]$PrinterName,
    [string]$JsonPath
)

Add-Type -AssemblyName System.Drawing

if (!(Test-Path $JsonPath)) {
    Write-Error "JSON file not found: $JsonPath"
    exit 1
}

$jsonContent = Get-Content -Path $JsonPath -Raw
$data = $jsonContent | ConvertFrom-Json

$printDoc = New-Object System.Drawing.Printing.PrintDocument
$printDoc.PrinterSettings.PrinterName = $PrinterName

if (!$printDoc.PrinterSettings.IsValid) {
    Write-Error "Printer '$PrinterName' not found."
    exit 1
}

# Remove margins to use full width
$printDoc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$printDoc.OriginAtMargins = $true

$printDoc.add_PrintPage({
    param($sender, $e)
    
    $g = $e.Graphics
    $y = 10
    $paperWidth = $printDoc.DefaultPageSettings.PaperSize.Width
    if ($paperWidth -eq 0) { $paperWidth = 280 } # Fallback for some drivers

    # 1. Draw Logo
    if ($data.logoPath -and (Test-Path $data.logoPath)) {
        try {
            $img = [System.Drawing.Image]::FromFile($data.logoPath)
            
            # Scale logic: Max width 200, Max height 100
            $maxWidth = 200
            $maxHeight = 100
            
            $ratioX = $maxWidth / $img.Width
            $ratioY = $maxHeight / $img.Height
            $ratio = [Math]::Min($ratioX, $ratioY)
            
            $newWidth = [int]($img.Width * $ratio)
            $newHeight = [int]($img.Height * $ratio)
            
            # Center it
            $x = ($paperWidth - $newWidth) / 2
            
            $g.DrawImage($img, $x, $y, $newWidth, $newHeight)
            $y += $newHeight + 10
            
            $img.Dispose()
        } catch {
            Write-Warning "Could not load logo: $_"
        }
    }

    # 2. Draw Lines
    foreach ($line in $data.lines) {
        $fontSize = if ($line.size) { $line.size } else { 9 }
        $fontName = if ($line.font) { $line.font } else { "Consolas" }
        $fontStyle = [System.Drawing.FontStyle]::Regular
        
        if ($line.bold) { $fontStyle = $fontStyle -bor [System.Drawing.FontStyle]::Bold }
        
        $font = New-Object System.Drawing.Font($fontName, $fontSize, $fontStyle)
        $brush = [System.Drawing.Brushes]::Black
        
        $text = $line.text
        
        # Measure String
        $size = $g.MeasureString($text, $font)
        
        # Calculate X for Alignment
        $margin = 15
        $x = $margin # Left default
        
        if ($line.align -eq "center") {
            $x = ($paperWidth - $size.Width) / 2
        } elseif ($line.align -eq "right") {
            $x = $paperWidth - $size.Width - $margin
        } else {
            $x = $margin # Left padding
        }
        
        $g.DrawString($text, $font, $brush, $x, $y)
        $y += $size.Height
    }
})

try {
    $printDoc.Print()
    Write-Host "Printed successfully"
}
catch {
    Write-Error "Print Failed: $_"
    exit 1
}
