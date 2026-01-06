@echo off
echo Starting Vending Machine Location Finder...
echo.
cd /d "%~dp0"
echo Current directory: %CD%
echo.
echo Starting development server...
echo Frontend: http://localhost:5173
echo Backend API: http://localhost:4242
echo Press Ctrl+C to stop the server
echo.
npm run dev
pause







