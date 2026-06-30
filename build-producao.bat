@echo off
chcp 65001 >nul
title Build Produção — Controlo de Despacho Diário

echo.
echo  [INFO] A gerar build de produção...
echo.

if not exist "node_modules" (
    echo  [INFO] A instalar dependências primeiro...
    npm install
)

npm run build

if %errorlevel% equ 0 (
    echo.
    echo  ┌─────────────────────────────────────────────────────┐
    echo  │  Build concluído com sucesso!                        │
    echo  │  Ficheiros em: .\dist\                               │
    echo  │                                                      │
    echo  │  Para servir localmente:  npm run preview            │
    echo  │  Para produção: copiar pasta dist\ para o servidor   │
    echo  └─────────────────────────────────────────────────────┘
) else (
    echo  [ERRO] Falha no build.
)

echo.
pause
