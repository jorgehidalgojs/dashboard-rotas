@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
title Controlo de Despacho Diario - Instalacao

echo.
echo  =====================================================
echo   CONTROLO DE DESPACHO DIARIO - Chicken Palace
echo   Instalacao completa e arranque
echo  =====================================================
echo.

:: ═══════════════════════════════════════════════════════
:: 1. VERIFICAR NODE.JS
:: ═══════════════════════════════════════════════════════
echo [1/5] Verificando Node.js...

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ERRO: Node.js nao encontrado no sistema.
    echo.
    echo  Por favor instale Node.js 18 ou superior:
    echo  https://nodejs.org/en/download
    echo.
    echo  Recomendamos a versao LTS ^(Long Term Support^).
    echo  Apos instalar, feche esta janela e execute
    echo  novamente este ficheiro.
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v 2^>^&1') do set NODE_VER=%%v
echo  OK - Node.js !NODE_VER! encontrado.

:: Verificar versao minima (18+)
for /f "tokens=1 delims=." %%a in ('node -e "process.stdout.write(process.version.slice(1))" 2^>^&1') do set NODE_MAJOR=%%a
if !NODE_MAJOR! lss 18 (
    echo.
    echo  AVISO: Node.js !NODE_VER! pode ser demasiado antigo.
    echo  Recomendamos Node.js 18 ou superior.
    echo  Continuar mesmo assim? Prima qualquer tecla ou feche para cancelar.
    pause >nul
)

:: ═══════════════════════════════════════════════════════
:: 2. VERIFICAR NPM
:: ═══════════════════════════════════════════════════════
echo.
echo [2/5] Verificando npm...

where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo  ERRO: npm nao encontrado. Reinstale o Node.js.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('npm -v 2^>^&1') do set NPM_VER=%%v
echo  OK - npm !NPM_VER! encontrado.

:: ═══════════════════════════════════════════════════════
:: 3. CONFIGURAR .ENV
:: ═══════════════════════════════════════════════════════
echo.
echo [3/5] Verificando configuracao .env...

if not exist ".env" (
    if exist ".env.example" (
        copy ".env.example" ".env" >nul
        echo  AVISO: .env criado a partir de .env.example
        echo.
        echo  -------------------------------------------------------
        echo  IMPORTANTE: Configure o IP do servidor Odoo no .env
        echo  Exemplo: VITE_API_URL=http://192.168.1.10:8069/api/...
        echo  -------------------------------------------------------
        echo.
        echo  A abrir .env no Bloco de Notas para configurar...
        echo  Guarde o ficheiro e feche o Bloco de Notas para continuar.
        echo.
        pause >nul
        notepad ".env"
        echo  Prima qualquer tecla para continuar apos guardar...
        pause >nul
    ) else (
        echo  AVISO: Criando .env padrao...
        echo VITE_API_URL=http://192.168.1.XXX:8069/api/dashboard/full>.env
        echo  Edite o ficheiro .env com o IP correcto do servidor Odoo.
    )
) else (
    echo  OK - .env encontrado.
)

:: ═══════════════════════════════════════════════════════
:: 4. INSTALAR DEPENDENCIAS (sempre limpo se houver erros)
:: ═══════════════════════════════════════════════════════
echo.
echo [4/5] Instalando dependencias...

:: Verificar se vite esta instalado e funcional
set NEED_INSTALL=0
if not exist "node_modules" set NEED_INSTALL=1
if not exist "node_modules\.bin\vite.cmd" set NEED_INSTALL=1
if not exist "node_modules\react\index.js" set NEED_INSTALL=1
if not exist "node_modules\leaflet\dist\leaflet.js" set NEED_INSTALL=1

if !NEED_INSTALL! equ 1 (
    echo  Modulos em falta ou incompletos. A instalar...
    echo.

    :: Limpar instalacao corrompida se existir
    if exist "node_modules" (
        echo  A remover node_modules corrompido...
        rmdir /s /q "node_modules" 2>nul
    )
    if exist "package-lock.json" (
        echo  A remover package-lock.json...
        del /f /q "package-lock.json" 2>nul
    )

    echo.
    echo  A instalar todos os modulos (pode demorar 2-5 minutos)...
    echo.

    :: Configurar npm para evitar problemas comuns no Windows
    npm config set scripts-prepend-node-path true >nul 2>&1

    call npm install --no-audit --no-fund --prefer-offline 2>nul
    if %errorlevel% neq 0 (
        echo.
        echo  Primeira tentativa falhou. A tentar com registry alternativo...
        echo.
        call npm install --no-audit --no-fund --registry https://registry.npmjs.org
        if %errorlevel% neq 0 (
            echo.
            echo  ERRO: Falha ao instalar dependencias.
            echo.
            echo  Possiveis causas:
            echo   - Sem ligacao a internet
            echo   - Firewall a bloquear npm
            echo   - Permissoes insuficientes ^(tente executar como Administrador^)
            echo.
            pause
            exit /b 1
        )
    )

    :: Verificar instalacao
    if not exist "node_modules\.bin\vite.cmd" (
        echo.
        echo  ERRO: vite nao foi instalado correctamente.
        echo  Tente executar este ficheiro como Administrador.
        pause
        exit /b 1
    )

    echo.
    echo  OK - Dependencias instaladas com sucesso.
) else (
    echo  OK - Todas as dependencias ja estao instaladas.
)

:: ═══════════════════════════════════════════════════════
:: 5. ARRANCAR SERVIDOR DE DESENVOLVIMENTO
:: ═══════════════════════════════════════════════════════
echo.
echo [5/5] A iniciar servidor...
echo.
echo  =====================================================
echo   Servidor a iniciar em: http://localhost:5173
echo.
echo   - Abra o browser e aceda ao endereco acima
echo   - Prima Ctrl+C nesta janela para parar o servidor
echo  =====================================================
echo.

:: Abrir browser automaticamente apos 3 segundos
start "" /b cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:5173"

:: Usar vite directamente via node para evitar problemas de PATH
node node_modules\.bin\vite --host

if %errorlevel% neq 0 (
    echo.
    echo  ERRO ao iniciar o servidor. A tentar via npm...
    call npm run dev
)

echo.
pause
