@echo off
:: Manter janela sempre aberta
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

:: Log de erros para ficheiro
set LOG=%~dp0instalacao.log
echo Inicio: %date% %time% > "%LOG%"

:: -------------------------------------------------------
:: 1. NODE.JS
:: -------------------------------------------------------
echo [1/5] Verificando Node.js...
node -v >nul 2>&1
if errorlevel 1 (
    echo.
    echo  ERRO: Node.js nao encontrado!
    echo  Instale em: https://nodejs.org
    echo  Escolha a versao LTS e instale com opcoes padrao.
    echo  Depois feche e abra novamente este ficheiro.
    echo.
    echo ERRO: Node.js nao encontrado >> "%LOG%"
    pause
    exit /b 1
)
for /f %%v in ('node -v') do echo      Node.js %%v encontrado.
echo.

:: -------------------------------------------------------
:: 2. NPM
:: -------------------------------------------------------
echo [2/5] Verificando npm...
npm -v >nul 2>&1
if errorlevel 1 (
    echo  ERRO: npm nao encontrado. Reinstale o Node.js.
    echo ERRO: npm nao encontrado >> "%LOG%"
    pause
    exit /b 1
)
for /f %%v in ('npm -v') do echo      npm %%v encontrado.
echo.

:: -------------------------------------------------------
:: 3. FICHEIRO .ENV
:: -------------------------------------------------------
echo [3/5] Verificando configuracao...
if not exist "%~dp0.env" (
    if exist "%~dp0.env.example" (
        copy "%~dp0.env.example" "%~dp0.env" >nul
        echo      .env criado. Abrindo para configurar o IP do servidor...
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
:: 4. INSTALAR DEPENDENCIAS
:: -------------------------------------------------------
echo [4/5] Verificando modulos...

set PRECISA_INSTALAR=0
if not exist "%~dp0node_modules\vite\bin\vite.js" set PRECISA_INSTALAR=1
if not exist "%~dp0node_modules\react\index.js"   set PRECISA_INSTALAR=1

if "%PRECISA_INSTALAR%"=="1" (
    echo      Modulos em falta. A instalar...
    echo      ^(pode demorar 3-5 minutos^)
    echo.

    if exist "%~dp0node_modules" (
        echo      A limpar instalacao anterior...
        rmdir /s /q "%~dp0node_modules"
    )
    if exist "%~dp0package-lock.json" (
        del /f /q "%~dp0package-lock.json"
    )

    cd /d "%~dp0"
    npm install
    if errorlevel 1 (
        echo.
        echo  ERRO: npm install falhou.
        echo  Verifique ligacao a internet.
        echo  Tente executar como Administrador ^(clique direito no .bat^).
        echo ERRO: npm install falhou >> "%LOG%"
        pause
        exit /b 1
    )

    if not exist "%~dp0node_modules\vite\bin\vite.js" (
        echo.
        echo  ERRO: vite nao instalado apos npm install.
        echo  Execute como Administrador.
        echo ERRO: vite ausente apos install >> "%LOG%"
        pause
        exit /b 1
    )

    echo.
    echo      Instalacao concluida com sucesso!
) else (
    echo      Todos os modulos encontrados. OK.
)
echo.

:: -------------------------------------------------------
:: 5. ARRANCAR
:: -------------------------------------------------------
echo [5/5] A iniciar servidor...
echo.
echo =======================================================
echo   Servidor em: http://localhost:5173
echo   Prima Ctrl+C para parar.
echo =======================================================
echo.

cd /d "%~dp0"
timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"

node "%~dp0node_modules\vite\bin\vite.js"

echo.
echo Servidor parado.
pause
