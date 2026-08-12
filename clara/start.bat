@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Clara - 投稿案メーカー

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js が見つかりませんでした。
  echo   https://nodejs.org/ja から LTS版 をインストールしてから、もう一度このファイルを開いてください。
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo   初回セットアップ中です。1〜2分かかります。そのままお待ちください...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   セットアップに失敗しました。この画面をコピーして相談してください。
    echo.
    pause
    exit /b 1
  )
)

node server.js
pause
