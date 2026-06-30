@echo off
if not "%1"=="JANELA" (
    start "Controlo de Despacho Diario" cmd /k "%~f0" JANELA
    exit
)

title Controlo de Despacho Diario - Chicken Palace
color 0A
cls

echo =======================================================
echo   CONTROLO DE DESPACHO DIARIO - Chicken Palace
echo =======================================================
echo.

cd /d "%~dp0"
set LOG=%~dp0instalacao.log
echo Inicio: %date% %time% > "%LOG%"

:: -------------------------------------------------------
:: 1. NODE.JS
:: -------------------------------------------------------
echo [1/6] Verificando Node.js...
node -v >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERRO: Node.js nao encontrado!
    echo  Instale em: https://nodejs.org  (versao LTS)
    echo  Apos instalar, feche e abra novamente este ficheiro.
    echo.
    pause
    exit /b 1
)
for /f %%v in ('node -v') do echo      Node.js %%v encontrado.
echo.

:: -------------------------------------------------------
:: 2. NPM
:: -------------------------------------------------------
echo [2/6] Verificando npm...
npm -v >nul 2>&1
if errorlevel 1 (
    echo  ERRO: npm nao encontrado. Reinstale o Node.js.
    pause
    exit /b 1
)
for /f %%v in ('npm -v') do echo      npm %%v encontrado.
echo.

:: -------------------------------------------------------
:: 3. ACTUALIZAR CODIGO (git pull)
:: -------------------------------------------------------
echo [3/6] Actualizando codigo do repositorio...
where git >nul 2>&1
if errorlevel 1 (
    echo      git nao encontrado. A saltar actualizacao.
) else (
    git pull --quiet 2>nul
    if errorlevel 1 (
        echo      Sem ligacao ao repositorio ou sem alteracoes.
    ) else (
        echo      Codigo actualizado com sucesso.
    )
)
echo.

:: -------------------------------------------------------
:: 4. FICHEIRO .ENV
:: -------------------------------------------------------
echo [4/6] Verificando configuracao .env...
if not exist "%~dp0.env" (
    if exist "%~dp0.env.example" (
        copy "%~dp0.env.example" "%~dp0.env" >nul
        echo      .env criado. A abrir para configurar IP do servidor...
        notepad "%~dp0.env"
        echo      Prima qualquer tecla apos guardar o .env...
        pause >nul
    ) else (
        echo      A criar .env minimo...
        echo VITE_API_URL=http://192.168.1.XXX:8069/api/dashboard/full>"%~dp0.env"
    )
) else (
    echo      .env encontrado. OK.
)
echo.

:: -------------------------------------------------------
:: 5. INSTALAR DEPENDENCIAS
:: -------------------------------------------------------
echo [5/6] Verificando modulos...

set PRECISA_INSTALAR=0
if not exist "%~dp0node_modules\vite\bin\vite.js" set PRECISA_INSTALAR=1
if not exist "%~dp0node_modules\react\index.js"   set PRECISA_INSTALAR=1

if "%PRECISA_INSTALAR%"=="1" (
    echo      Modulos em falta. A instalar...
    echo      Pode demorar 3-5 minutos na primeira vez.
    echo.

    if exist "%~dp0node_modules" (
        echo      A limpar instalacao anterior...
        rmdir /s /q "%~dp0node_modules"
    )
    if exist "%~dp0package-lock.json" del /f /q "%~dp0package-lock.json"

    npm install
    if errorlevel 1 (
        echo.
        echo  ERRO: npm install falhou.
        echo  Verifique ligacao a internet.
        echo  Tente clicar com botao direito no .bat e escolher
        echo  "Executar como Administrador".
        pause
        exit /b 1
    )

    if not exist "%~dp0node_modules\vite\bin\vite.js" (
        echo.
        echo  ERRO: vite nao instalado. Execute como Administrador.
        pause
        exit /b 1
    )

    echo.
    echo      Instalacao concluida!
) else (
    echo      Todos os modulos presentes. OK.
)
echo.

:: -------------------------------------------------------
:: 6. GARANTIR allowedHosts NO VITE CONFIG
:: -------------------------------------------------------
echo [6/6] A verificar configuracao do servidor...

:: Reescrever vite.config.js garantindo allowedHosts sempre presente
(
echo import { defineConfig } from 'vite'
echo import react from '@vitejs/plugin-react'
echo import tailwindcss from '@tailwindcss/vite'
echo.
echo export default defineConfig^({
echo   plugins: [react^(^), tailwindcss^(^)],
echo.
echo   server: {
echo     allowedHosts: 'all',
echo   },
echo.
echo   build: {
echo     chunkSizeWarningLimit: 1000,
echo     sourcemap: false,
echo     target: 'es2020',
echo     rollupOptions: {
echo       output: {
echo         manualChunks: {
echo           'vendor-react': ['react', 'react-dom'],
echo           'vendor-map': ['leaflet', 'react-leaflet', 'leaflet.markercluster'],
echo           'vendor-ui': ['framer-motion', '@tanstack/react-virtual', '@tanstack/react-query'],
echo           'vendor-icons': ['lucide-react'],
echo         },
echo       },
echo     },
echo   },
echo.
echo   optimizeDeps: {
echo     include: ['leaflet', 'leaflet.markercluster'],
echo   },
echo }^)
) > "%~dp0vite.config.js"

echo      Configuracao OK.
echo.

:: -------------------------------------------------------
:: 7. ARRANCAR SERVIDOR
:: -------------------------------------------------------
echo [7/7] A iniciar servidor...
echo.
echo =======================================================
echo   Servidor local:  http://localhost:5173
echo   Prima Ctrl+C para parar o servidor.
echo =======================================================
echo.

timeout /t 2 /nobreak >nul
start "" "http://localhost:5173"

node "%~dp0node_modules\vite\bin\vite.js" --host

echo.
echo Servidor parado.
pause
