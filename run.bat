@echo off
setlocal
echo ==========================================================
echo  Starting Smart Resume-Job Matching System
echo ==========================================================

set "ROOT=%~dp0"
set "API_DIR=%ROOT%apps\api"
set "WEB_DIR=%ROOT%apps\web"

start "ResumeMatch Backend API (Port 8008)" cmd /k "cd /d "%API_DIR%" && set "PYTHONPATH=.;.venv\Lib\site-packages" && .venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8008 --reload"

start "ResumeMatch Frontend Client (Port 5173)" cmd /k "cd /d "%WEB_DIR%" && npm run dev"

timeout /t 3 /nobreak >nul
start http://localhost:5173

echo.
echo Services launched in background windows!
echo  - Frontend:   http://localhost:5173
echo  - Admin:      http://localhost:5173/admin/login
echo  - API Docs:   http://localhost:8008/docs
echo ==========================================================
pause
