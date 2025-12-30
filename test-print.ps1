
param(
    [string]$PrinterName = "FIT FP-510 Raster"
)

Add-Type -AssemblyName System.Drawing

Write-Host "Attempting to print to: $PrinterName"

$text = "
================================
POS PRINTER TEST
================================
Date: $(Get-Date)
Printer: $PrinterName
--------------------------------
If you can read this,
PowerShell printing is WORKING!
================================
"

$printDoc = New-Object System.Drawing.Printing.PrintDocument
$printDoc.PrinterSettings.PrinterName = $PrinterName

if (!$printDoc.PrinterSettings.IsValid) {
    Write-Error "Printer '$PrinterName' is NOT VALID or NOT FOUND."
    Write-Host "Available Printers:"
    Get-Printer | Format-Table Name, PrinterStatus
    exit 1
}

$font = New-Object System.Drawing.Font("Consolas", 10)
$brush = [System.Drawing.Brushes]::Black

$printDoc.add_PrintPage({
    param($sender, $e)
    $e.Graphics.DrawString($text, $font, $brush, 10, 10)
})

try {
    $printDoc.Print()
    Write-Host "Print command sent successfully!"
}
catch {
    Write-Error "Print Failed: $_"
}
