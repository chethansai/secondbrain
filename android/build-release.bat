@echo off
REM build-release.bat
REM Run this from the rnnotetaking\android directory to build the release APK.
REM It clears CLASSPATH and sets JAVA_HOME to Android Studio's JBR to avoid
REM the "-classpath requires class path specification" JVM error.

set CLASSPATH=
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr

echo Building release APK...
call gradlew.bat assembleRelease

if %ERRORLEVEL% equ 0 (
  echo.
  echo BUILD SUCCESSFUL
  echo APK output: app\build\outputs\apk\release\app-release.apk
) else (
  echo.
  echo BUILD FAILED - check errors above
)
