@echo off
chcp 65001 >nul
echo 正在启动考研数学真题复盘网站 (http://127.0.0.1:5174) ...
start "" http://127.0.0.1:5174
python -m http.server 5174 --bind 127.0.0.1
pause
