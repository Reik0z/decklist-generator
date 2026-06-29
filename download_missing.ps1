# download_missing.ps1
# Descarga las imágenes faltantes leyendo cards_local.json.
# Corrige el bug del script original: la URL tiene ?accountingTag=RB
# que GetExtension() incluía en el nombre del archivo (inválido en Windows).

$ScriptDir     = $PSScriptRoot          # siempre la carpeta del script
$JsonFile      = Join-Path $ScriptDir "cards_local.json"
$ThrottleLimit = 12   # descargas paralelas — baja si hay errores de red

$data = Get-Content $JsonFile -Raw | ConvertFrom-Json

# Filtrar solo las que realmente faltan (ruta relativa al script)
$missing = $data.items | Where-Object {
    $cleanPath = Join-Path $ScriptDir ($_.media.local_image -replace '\?.*$', '')
    -not (Test-Path $cleanPath)
}

$total = $missing.Count
if ($total -eq 0) {
    Write-Host "✓ No faltan imágenes." -ForegroundColor Green
    exit
}

Write-Host "Imágenes faltantes: $total — iniciando descarga con $ThrottleLimit hilos...`n"

$counter = [System.Collections.Concurrent.ConcurrentDictionary[string,int]]::new()
$counter.TryAdd('ok', 0) | Out-Null
$counter.TryAdd('fail', 0) | Out-Null

$missing | ForEach-Object -Parallel {

    $card      = $_
    $counter   = $using:counter

    # Ruta de destino: relativa al script, sin query string
    $savePath  = Join-Path $using:ScriptDir ($card.media.local_image -replace '\?.*$', '')

    # Crear carpeta si no existe
    $folder = Split-Path $savePath -Parent
    New-Item -ItemType Directory -Force -Path $folder | Out-Null

    # URL de descarga (con query string — es válida para HTTP)
    $url = $card.media.image_url

    try {
        Invoke-WebRequest -Uri $url -OutFile $savePath -ErrorAction Stop
        $counter.AddOrUpdate('ok', 1, { param($k,$v) $v + 1 }) | Out-Null
        Write-Host "⬇  $($card.name)" -ForegroundColor Cyan
    }
    catch {
        $counter.AddOrUpdate('fail', 1, { param($k,$v) $v + 1 }) | Out-Null
        Write-Host "✗  $($card.name)  →  $($_.Exception.Message)" -ForegroundColor Red
    }

} -ThrottleLimit $ThrottleLimit

$ok   = $counter['ok']
$fail = $counter['fail']

Write-Host "`n══════════════════════════════════════"
Write-Host "  Descargadas : $ok" -ForegroundColor Green
if ($fail -gt 0) {
    Write-Host "  Fallidas    : $fail (revisar arriba)" -ForegroundColor Yellow
}
Write-Host "══════════════════════════════════════"
