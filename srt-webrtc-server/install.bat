@echo off
echo ============================================
echo   Instalador SRT-WebRTC Server para vMix
echo ============================================
echo.

:: Verificar si Node.js está instalado
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js no está instalado. Descargando...
    echo.
    
    :: Descargar Node.js
    echo Descargando Node.js v20.11.0...
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi' -OutFile '%TEMP%\node.msi'"
    
    :: Instalar Node.js
    echo Instalando Node.js...
    msiexec /i "%TEMP%\node.msi" /quiet /norestart
    
    echo Node.js instalado correctamente.
    echo.
) else (
    echo [OK] Node.js ya está instalado
    node --version
    echo.
)

:: Verificar si FFmpeg está instalado
ffmpeg -version >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] FFmpeg no está instalado. Descargando...
    echo.
    
    :: Crear carpeta para FFmpeg
    if not exist "C:\ffmpeg" mkdir C:\ffmpeg
    
    :: Descargar FFmpeg
    echo Descargando FFmpeg...
    powershell -Command "Invoke-WebRequest -Uri 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip' -OutFile '%TEMP%\ffmpeg.zip'"
    
    :: Extraer FFmpeg
    echo Extrayendo FFmpeg...
    powershell -Command "Expand-Archive -Path '%TEMP%\ffmpeg.zip' -DestinationPath 'C:\ffmpeg' -Force"
    
    :: Mover archivos al lugar correcto
    for /d %%i in (C:\ffmpeg\ffmpeg-*) do (
        xcopy "%%i\bin\*" "C:\ffmpeg\" /Y
    )
    
    :: Agregar FFmpeg al PATH
    echo Agregando FFmpeg al PATH...
    setx PATH "%PATH%;C:\ffmpeg" /M >nul 2>&1
    
    echo FFmpeg instalado correctamente.
    echo.
) else (
    echo [OK] FFmpeg ya está instalado
    ffmpeg -version 2>&1 | findstr "version"
    echo.
)

:: Instalar dependencias de Node.js
echo Instalando dependencias del servidor...
call npm install

:: Verificar instalación
if %errorlevel% equ 0 (
    echo.
    echo ============================================
    echo   INSTALACION COMPLETADA EXITOSAMENTE!
    echo ============================================
    echo.
    echo Para iniciar el servidor ejecute:
    echo   npm start
    echo.
    echo O haga doble clic en: start-server.bat
    echo.
    echo Configuracion de vMix:
    echo   URL: srt://127.0.0.1:9999?mode=caller
    echo   Codec: H.264
    echo   Audio: AAC
    echo ============================================
) else (
    echo.
    echo [ERROR] Hubo un problema con la instalacion
    echo Por favor, ejecute manualmente: npm install
)

pause