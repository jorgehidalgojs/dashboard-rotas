@echo off
:: Manter janela sempre aberta
if not "%1"=="JANELA" (
    start "ngrok - Controlo de Despacho Diario" cmd /k "%~f0" JANELA
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

set NGROK_EXE=
set NGROK_DIR=%~dp0ngrok-bin

:: -------------------------------------------------------
:: 1. PROCURAR NGROK (PATH do sistema ou pasta local)
:: -------------------------------------------------------
echo [1/4] Procurando ngrok...

where ngrok >nul 2>&1
if not errorlevel 1 (
    set NGROK_EXE=ngrok
    echo      ngrok encontrado no PATH do sistema.
    goto VERIFICAR_TOKEN
)

if exist "%NGROK_DIR%\ngrok.exe" (
    set NGROK_EXE="%NGROK_DIR%\ngrok.exe"
    echo      ngrok encontrado em %NGROK_DIR%
    goto VERIFICAR_TOKEN
)

:: -------------------------------------------------------
:: 2. INSTALAR NGROK
:: -------------------------------------------------------
echo      ngrok nao encontrado. A instalar...
echo.

:: Verificar se tem PowerShell para download
where powershell >nul 2>&1
if errorlevel 1 (
    echo  ERRO: PowerShell nao encontrado.
    echo  Instale o ngrok manualmente em: https://ngrok.com/download
    pause
    exit /b 1
)

if not exist "%NGROK_DIR%" mkdir "%NGROK_DIR%"

echo      A descarregar ngrok para Windows...
powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri 'https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip' -OutFile '%NGROK_DIR%\ngrok.zip' -UseBasicParsing}"

if not exist "%NGROK_DIR%\ngrok.zip" (
    echo.
    echo  ERRO: Falha ao descarregar ngrok.
    echo  Verifique a ligacao a internet.
    echo.
    echo  Alternativa manual:
    echo   1. Aceda a https://ngrok.com/download
    echo   2. Descarregue a versao Windows
    echo   3. Extraia ngrok.exe para esta pasta: %NGROK_DIR%
    echo   4. Execute este ficheiro novamente.
    pause
    exit /b 1
)

echo      A extrair ngrok...
powershell -Command "Expand-Archive -Path '%NGROK_DIR%\ngrok.zip' -DestinationPath '%NGROK_DIR%' -Force"
del /f /q "%NGROK_DIR%\ngrok.zip"

if not exist "%NGROK_DIR%\ngrok.exe" (
    echo  ERRO: Extracao falhou.
    pause
    exit /b 1
)

set NGROK_EXE="%NGROK_DIR%\ngrok.exe"
echo      ngrok instalado com sucesso!

:: -------------------------------------------------------
:: 3. VERIFICAR / CONFIGURAR TOKEN
:: -------------------------------------------------------
:VERIFICAR_TOKEN
echo.
echo [2/4] Verificando autenticacao ngrok...

:: Ler token do ficheiro de configuracao local
set TOKEN_FILE=%~dp0.ngrok-token
set NGROK_TOKEN=

if exist "%TOKEN_FILE%" (
    set /p NGROK_TOKEN=<"%TOKEN_FILE%"
)

if "%NGROK_TOKEN%"=="" (
    echo.
    echo  Para usar o ngrok e necessario um token gratuito.
    echo.
    echo  COMO OBTER O TOKEN ^(gratis^):
    echo   1. Aceda a: https://dashboard.ngrok.com/signup
    echo   2. Registe-se com email ou Google/GitHub
    echo   3. Apos login, va a: https://dashboard.ngrok.com/get-started/your-authtoken
    echo   4. Copie o token e cole abaixo
    echo.
    set /p NGROK_TOKEN=  Cole o seu token aqui e prima Enter:

    if "!NGROK_TOKEN!"=="" (
        echo  Token vazio. Cancelando.
        pause
        exit /b 1
    )

    :: Guardar token para proximas execucoes
    echo !NGROK_TOKEN!>"%TOKEN_FILE%"
    echo      Token guardado para uso futuro.
)

:: Configurar token no ngrok
echo      A configurar token...
%NGROK_EXE% config add-authtoken %NGROK_TOKEN% >nul 2>&1
if errorlevel 1 (
    echo  AVISO: Erro ao configurar token. Tentando mesmo assim...
)
echo      Token configurado.

:: -------------------------------------------------------
:: 4. VERIFICAR SERVIDOR DEV A CORRER
:: -------------------------------------------------------
echo.
echo [3/4] Verificando servidor local...

powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:5173' -TimeoutSec 3 -UseBasicParsing; exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo.
    echo  AVISO: Servidor local nao detectado em http://localhost:5173
    echo.
    echo  Certifique-se que o servidor de desenvolvimento esta a correr.
    echo  Execute primeiro o ficheiro: instalar-e-arrancar.bat
    echo.
    set /p CONTINUAR=  Continuar mesmo assim? (S/N):
    if /i "!CONTINUAR!" neq "S" (
        pause
        exit /b 0
    )
) else (
    echo      Servidor local detectado. OK.
)

:: -------------------------------------------------------
:: 5. INICIAR TUNEL NGROK
:: -------------------------------------------------------
echo.
echo [4/4] A iniciar tunel ngrok...
echo.
echo =======================================================
echo   O URL publico aparece abaixo em "Forwarding"
echo   Exemplo: https://xxxx-xx-xx.ngrok-free.app
echo.
echo   Partilhe esse URL para aceder de qualquer lugar.
echo   Prima Ctrl+C para fechar o tunel.
echo =======================================================
echo.

%NGROK_EXE% http 5173 --log=stdout

echo.
echo Tunel fechado.
pause
