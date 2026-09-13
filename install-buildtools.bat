@echo off
REM ============================================================
REM  Install VS Build Tools 2022 (MSVC + Windows SDK) for Tauri
REM  Right-click this file and "Run as administrator" is NOT
REM  needed - it will request elevation by itself (click YES
REM  on the UAC popup).
REM ============================================================
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting administrator rights... Please click YES on the UAC popup.
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

echo ============================================
echo  Admin rights OK. Installing VS Build Tools
echo  (C++ compiler for Rust/Tauri, ~2GB download,
echo   takes 10-30 minutes. Do NOT shut down.)
echo ============================================
winget install --id Microsoft.VisualStudio.2022.BuildTools --accept-source-agreements --accept-package-agreements --override "--quiet --wait --norestart --nocache --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

if %errorlevel%==0 (
  echo.
  echo ====== INSTALL SUCCESS ======
  echo Go back to ZCode and say: build
) else (
  echo.
  echo ====== INSTALL FAILED, exit code %errorlevel% ======
  echo Take a screenshot and send it to ZCode.
)
pause
