@echo off
for /f "delims=" %%x in ('dir /od /a-d /b logs\console\arc_*.log') do set latest=%%x
if defined latest (
    echo Opening latest log: logs\console\%latest%
    notepad "logs\console\%latest%"
) else (
    echo No log files found in logs\console\
)
