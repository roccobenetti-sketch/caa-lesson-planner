@echo off
title CAA Lesson Planner
cd /d "%~dp0"
echo ===================================================
echo     CAA LESSON PLANNER - AVVIO IN CORSO
echo ===================================================
echo Apertura del browser all'indirizzo: http://localhost:8080
start http://localhost:8080
echo.
echo Server in esecuzione (premi Ctrl+C per fermarlo)...
python server.py
pause
