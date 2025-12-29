# Print with exact label size to prevent multiple feeds
param(
    [string]$ImagePath,
    [string]$PrinterName
)

Add-Type -AssemblyName System.Drawing

$printDoc = New-Object System.Drawing.Printing.PrintDocument
$printDoc.PrinterSettings.PrinterName = $PrinterName

# 1. SEARCH FOR SYSTEM FORM 'Label_60x40'
# This forces the printer to use the form we created in Step 2
$targetPaper = $printDoc.PrinterSettings.PaperSizes | Where-Object { $_.PaperName -eq "Label_60x40" }

if ($targetPaper) {
    $printDoc.DefaultPageSettings.PaperSize = $targetPaper
}
else {
    # Fallback: Force custom size (236 = 60mm, 157 = 40mm)
    $paperSize = New-Object System.Drawing.Printing.PaperSize("Custom", 236, 157)
    $printDoc.DefaultPageSettings.PaperSize = $paperSize
}

# 2. ZERO MARGINS
$printDoc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
$printDoc.OriginAtMargins = $true

$printDoc.add_PrintPage({
    param($sender, $e)
    $img = [System.Drawing.Image]::FromFile($ImagePath)
    
    # Draw image stretched to fill the 60x40mm area exactly
    $e.Graphics.DrawImage($img, 0, 0, 236, 157)
    
    $img.Dispose()
})

try {
    $printDoc.Print()
    Write-Host "Printed successfully using form: $($printDoc.DefaultPageSettings.PaperSize.PaperName)"
}
catch {
    Write-Error "Print Error: $_"
}
finally {
    $image.Dispose()
    $printDoc.Dispose()
}
