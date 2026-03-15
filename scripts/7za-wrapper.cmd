@echo off
set "CMDARGS=%*"
call set "CMDARGS=%%CMDARGS:-snld=%%"
"%~dp0..\node_modules\7zip-bin\win\x64\7za.exe" %CMDARGS%
set "EC=%ERRORLEVEL%"
if "%EC%"=="2" exit /b 0
exit /b %EC%
