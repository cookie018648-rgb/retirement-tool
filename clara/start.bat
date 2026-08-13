@echo off
rem ---------------------------------------------------------------
rem This file must stay ASCII-only. cmd.exe reads .bat files with the
rem system codepage (932 on Japanese Windows), so UTF-8 Japanese text
rem here gets mojibaked and parsed as commands. All Japanese messages
rem belong in server.js, which prints them after chcp 65001 below.
rem ---------------------------------------------------------------
setlocal
cd /d "%~dp0"
title Clara
chcp 65001 >nul

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js is not installed.
  echo   Install the LTS version from https://nodejs.org/ja and try again.
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo.
  echo   First-time setup. This takes 1-2 minutes. Please wait...
  echo.
  call npm install --no-audit --no-fund
  if errorlevel 1 (
    echo.
    echo   Setup failed. Please send a screenshot of this window.
    echo.
    pause
    exit /b 1
  )
)

node server.js
pause
