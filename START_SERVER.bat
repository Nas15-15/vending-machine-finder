@echo off
title Vending Machine Finder - Starting Server
color 0A

echo ========================================
echo   Vending Machine Finder
echo   Starting Development Server...
echo ========================================
echo.

cd /d "%~dp0"

echo Checking Node.js installation...
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo Node.js found!
echo.
echo Starting server on http://localhost:5173
echo.
echo Press Ctrl+C to stop the server
echo ========================================
echo.

npm run dev

pause












