@echo off
cd /d "%~dp0"
py -3 --version >nul 2>&1
if not errorlevel 1 (
  py -3 start-local.py
  goto end
)
python --version >nul 2>&1
if not errorlevel 1 (
  python start-local.py
  goto end
)
echo Python 3 is required. Install Python 3 from python.org, then run this file again.
:end
pause
