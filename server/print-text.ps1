
param(
    [string]$PrinterName,
    [string]$Content,
    [string]$ContentPath
)

Add-Type -AssemblyName System.Drawing

if ($ContentPath -and (Test-Path $ContentPath)) {
    $Content = Get-Content -Path $ContentPath -Raw
}

$printDoc = New-Object System.Drawing.Printing.PrintDocument

$printDoc = New-Object System.Drawing.Printing.PrintDocument
$printDoc.PrinterSettings.PrinterName = $PrinterName

if (!$printDoc.PrinterSettings.IsValid) {
    Write-Error "Printer '$PrinterName' not found."
    exit 1
}

$font = New-Object System.Drawing.Font("Consolas", 9)
$brush = [System.Drawing.Brushes]::Black

$printDoc.add_PrintPage({
    param($sender, $e)
    # Simple pagination could be added here, but for now assuming single long slip or auto-break
    $e.Graphics.DrawString($Content, $font, $brush, 5, 5)
})

try {
    $printDoc.Print()
    Write-Host "Printed successfully"
}
catch {
    Write-Error "Print Failed: $_"
    exit 1
}
