@echo off
chcp 65001 >nul
title 万象转换 OmniConvert
echo 正在启动万象转换本地服务...
start "" /min powershell -ExecutionPolicy Bypass -File "%~dp0server.ps1"
timeout /t 1 /nobreak >nul
start "" "http://localhost:8137"
echo 已在浏览器打开 http://localhost:8137
echo 关闭后台的 PowerShell 窗口即可停止服务。
