@echo off
chcp 65001 >nul
title Controlo de Despacho Diário — Chicken Palace

echo.
echo  ┌─────────────────────────────────────────────────────┐
echo  │   CONTROLO DE DESPACHO DIÁRIO · Chicken Palace      │
echo  │   Configuração e arranque em modo desenvolvimento    │
echo  └─────────────────────────────────────────────────────┘
echo.

:: ── 1. Verificar Node.js ─────────────────────────────────────────────────────
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERRO] Node.js nao encontrado.
    echo  Por favor instale Node.js 18+ em: https://nodejs.org
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER% detectado.

:: ── 2. Verificar/criar .env ──────────────────────────────────────────────────
if not exist ".env" (
    if exist ".env.example" (
        echo.
        echo  [AVISO] Ficheiro .env nao encontrado.
        echo  A criar .env a partir de .env.example...
        copy ".env.example" ".env" >nul
        echo.
        echo  IMPORTANTE: edite o ficheiro .env e configure
        echo  o IP correcto do servidor Odoo antes de continuar.
        echo  Exemplo: VITE_API_URL=http://192.168.1.10:8069/api/dashboard/full
        echo.
        echo  Prima qualquer tecla para abrir o .env no Bloco de Notas...
        pause >nul
        notepad ".env"
        echo.
        echo  Prima qualquer tecla para continuar apos guardar o .env...
        pause >nul
    ) else (
        echo  [AVISO] A criar .env minimo...
        echo VITE_API_URL=http://192.168.1.XXX:8069/api/dashboard/full> .env
    )
) else (
    echo  [OK] Ficheiro .env encontrado.
)

:: ── 3. Instalar dependências (verifica vite especificamente) ──────────────────
if not exist "node_modules\.bin\vite.cmd" (
    echo.
    echo  [INFO] A instalar dependencias (npm install)...
    echo  Isto pode demorar alguns minutos na primeira execucao.
    echo.
    call npm install
    if %errorlevel% neq 0 (
        echo.
        echo  [ERRO] Falha ao instalar dependencias.
        echo  Verifique a ligacao a internet e tente novamente.
        pause
        exit /b 1
    )
    echo.
    echo  [OK] Dependencias instaladas com sucesso.
) else (
    echo  [OK] Dependencias ja instaladas.
)

:: ── 4. Arrancar servidor de desenvolvimento ──────────────────────────────────
echo.
echo  [INFO] A iniciar servidor de desenvolvimento...
echo  Abra o browser em:  http://localhost:5173
echo  Prima Ctrl+C para parar o servidor.
echo.

call npm run dev

pause
