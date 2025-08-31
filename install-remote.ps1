# Script PowerShell para instalar todo remotamente
$remoteScript = @'
# Descargar Node.js
Write-Host "Descargando Node.js..." -ForegroundColor Green
Invoke-WebRequest -Uri "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi" -OutFile "C:\Users\Stream\node.msi"

# Instalar Node.js silenciosamente
Write-Host "Instalando Node.js..." -ForegroundColor Green
Start-Process msiexec.exe -ArgumentList "/i", "C:\Users\Stream\node.msi", "/quiet", "/norestart" -Wait

# Descargar FFmpeg
Write-Host "Descargando FFmpeg..." -ForegroundColor Green
Invoke-WebRequest -Uri "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip" -OutFile "C:\Users\Stream\ffmpeg.zip"

# Crear carpeta FFmpeg
New-Item -ItemType Directory -Force -Path "C:\ffmpeg"

# Extraer FFmpeg
Write-Host "Extrayendo FFmpeg..." -ForegroundColor Green
Expand-Archive -Path "C:\Users\Stream\ffmpeg.zip" -DestinationPath "C:\ffmpeg" -Force

# Copiar ejecutables al lugar correcto
$ffmpegFolder = Get-ChildItem -Path "C:\ffmpeg" -Directory | Where-Object {$_.Name -like "ffmpeg-*"} | Select-Object -First 1
if ($ffmpegFolder) {
    Copy-Item "$($ffmpegFolder.FullName)\bin\*" "C:\ffmpeg\" -Force
}

# Agregar al PATH
Write-Host "Configurando PATH..." -ForegroundColor Green
$path = [Environment]::GetEnvironmentVariable("Path", "Machine")
if ($path -notlike "*C:\ffmpeg*") {
    [Environment]::SetEnvironmentVariable("Path", "$path;C:\ffmpeg", "Machine")
}

# Agregar Node al PATH si no está
$nodePath = "C:\Program Files\nodejs"
if ($path -notlike "*nodejs*") {
    [Environment]::SetEnvironmentVariable("Path", "$path;$nodePath", "Machine")
}

# Crear carpeta del proyecto
Write-Host "Creando estructura del proyecto..." -ForegroundColor Green
New-Item -ItemType Directory -Force -Path "C:\srt-webrtc"

# Crear package.json
$packageJson = @'
{
  "name": "vmix-srt-webrtc",
  "version": "1.0.0",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.6.1",
    "cors": "^2.8.5"
  }
}
'@
$packageJson | Out-File -FilePath "C:\srt-webrtc\package.json" -Encoding UTF8

Write-Host "Instalacion base completada!" -ForegroundColor Green
'@

# Guardar y ejecutar
$remoteScript | Out-File -FilePath "remote-install.ps1" -Encoding UTF8