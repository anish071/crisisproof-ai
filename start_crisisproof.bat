@echo off
cd /d "%~dp0"
echo Starting CRISISPROOF API...
start "CRISISPROOF API" cmd /k ""C:\Users\Anish kumar tiwari\anaconda3_new\python.exe" -m uvicorn api:app --app-dir src --host 127.0.0.1 --port 8000"
timeout /t 2 /nobreak >nul
echo Starting CRISISPROOF website...
cd frontend
start "CRISISPROOF Website" cmd /k "npm.cmd run dev -- --host 127.0.0.1"
echo.
echo API docs: http://127.0.0.1:8000/docs
echo Website: check the Vite URL shown in the frontend window.
