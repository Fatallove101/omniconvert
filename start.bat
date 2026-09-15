@echo off
chcp 65001 >nul
title 万象转换 OmniConvert
REM 幂等启动：start.ps1 会自动接管旧服务、只开一次浏览器，可重复双击
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
