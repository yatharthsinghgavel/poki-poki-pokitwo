@echo off
title Poketwo Autocatcher
cd /d "%~dp0"
echo Installing dependencies...
npm install
echo Starting bot...
start "" "http://localhost:3000"
node index.js
pause
