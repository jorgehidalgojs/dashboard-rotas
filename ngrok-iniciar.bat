@echo off
if not "%1"=="RUN" (
    start "ngrok - Dashboard Rotas" cmd /k "%~f0" RUN
    exit
)

title ngrok - Controlo de Despacho Diario
color 0B
cls

echo =======================================================
echo   NGROK - Acesso remoto via Internet
echo   Controlo de Despacho Diario - Chicken Palace
echo =======================================================
echo.

set NGROK_DIR=%~dp0ngrok-bin
set TOKEN_FILE=%~dp0.ngrok-token
set NGROK_EXE=

:: -------------------------------------------------------
:: 1. LOCALIZAR NGROK
:: -------------------------------------------------------
echo [1/4] Procurando ngrok...

where ngrok >nul 2>&1
if not errorlevel 1 (
    set NGROK_EXE=ngrok
    echo      Encontrado no PATH do sistema.
    goto :CHECK_TOKEN
)

if exist "%NGROK_DIR%\ngrok.exe" (
    set NGROK_EXE=%NGROK_DIR%\ngrok.exe
    echo      Encontrado em ngrok-bin\
    goto :CHECK_TOKEN
)

:: -------------------------------------------------------
:: 2. DESCARREGAR NGROK
:: -------------------------------------------------------
echo      Nao encontrado. A descarregar...
echo.

if not exist "%NGROK_DIR%" mkdir "%NGROK_DIR%"

powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip' -OutFile '%NGROK_DIR%\ngrok.zip' -UseBasicParsing"

if not exist "%NGROK_DIR%\ngrok.zip" (
    echo.
    echo  ERRO: Falha ao descarregar ngrok.
    echo.
    echo  Instale manualmente:
    echo   1. Va a https://ngrok.com/download
    echo   2. Descarregue a versao Windows AMD64
    echo   3. Extraia ngrok.exe para a pasta ngrok-bin\
    echo   4. Execute este ficheiro novamente.
    echo.
    pause
    exit /b 1
)

echo      A extrair...
powershell -Command "Expand-Archive -Path '%NGROK_DIR%\ngrok.zip' -DestinationPath '%NGROK_DIR%' -Force"
del /f /q "%NGROK_DIR%\ngrok.zip" >nul 2>&1

if not exist "%NGROK_DIR%\ngrok.exe" (
    echo  ERRO: Extracao falhou.
    pause
    exit /b 1
)

set NGROK_EXE=%NGROK_DIR%\ngrok.exe
echo      ngrok instalado com sucesso.

:: -------------------------------------------------------
:: 3. TOKEN DE AUTENTICACAO
:: -------------------------------------------------------
:CHECK_TOKEN
echo.
echo [2/4] Verificando token de autenticacao...

if exist "%TOKEN_FILE%" (
    echo      Token encontrado. OK.
    goto :CHECK_SERVER
)

echo.
echo  Token nao configurado. Necessario para usar o ngrok.
echo.
echo  PASSOS PARA OBTER O TOKEN GRATUITO:
echo   1. Aceda a: https://ngrok.com/signup
echo   2. Registe-se com email, Google ou GitHub
echo   3. Apos login aceda a:
echo      https://dashboard.ngrok.com/get-started/your-authtoken
echo   4. Copie o token que aparece na pagina
echo.
set /p NGROK_TOKEN=  Cole o token aqui e prima Enter:

if "%NGROK_TOKEN%"=="" (
    echo  Token vazio. A cancelar.
    pause
    exit /b 1
)

echo %NGROK_TOKEN%>"%TOKEN_FILE%"
echo      Token guardado em .ngrok-token para uso futuro.

:: -------------------------------------------------------
:: 4. CONFIGURAR TOKEN NO NGROK
:: -------------------------------------------------------
:CONFIGURE_TOKEN
set /p NGROK_TOKEN=<"%TOKEN_FILE%"
%NGROK_EXE% config add-authtoken %NGROK_TOKEN%
echo.

:: -------------------------------------------------------
:: 5. VERIFICAR SERVIDOR LOCAL
:: -------------------------------------------------------
:CHECK_SERVER
echo [3/4] Verificando servidor local em localhost:5173 ...

powershell -Command "try { Invoke-WebRequest -Uri 'http://localhost:5173' -TimeoutSec 3 -UseBasicParsing | Out-Null; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo.
    echo  AVISO: Servidor nao detectado em http://localhost:5173
    echo  Execute primeiro o ficheiro instalar-e-arrancar.bat
    echo.
    echo  Prima qualquer tecla para tentar abrir o tunel mesmo assim...
    pause >nul
) else (
    echo      Servidor local activo. OK.
)

:: -------------------------------------------------------
:: 6. INICIAR TUNEL
:: -------------------------------------------------------
echo.
echo [4/4] A abrir tunel para internet...
echo.
echo =======================================================
echo   O URL publico aparece na linha "Forwarding" abaixo.
echo   Exemplo: https://abcd-1234.ngrok-free.app
echo.
echo   Partilhe esse URL para aceder de qualquer lugar.
echo   Prima Ctrl+C para fechar o tunel.
echo =======================================================
echo.

%NGROK_EXE% http 5173

echo.
echo  Tunel encerrado.
pause
