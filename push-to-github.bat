@echo off
echo ========================================
echo  Solia - Push to GitHub (Private Repo)
echo ========================================
echo.

REM Check if git is installed
git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git is not installed!
    echo Please install Git from https://git-scm.com/download/win
    pause
    exit /b 1
)

echo [1/6] Initializing git repository...
git init
if errorlevel 1 (
    echo Git already initialized
)

echo.
echo [2/6] Adding all files (except .env.local)...
git add .

echo.
echo [3/6] Checking what will be committed...
echo ----------------------------------------
git status --short
echo ----------------------------------------
echo.
echo WARNING: Make sure .env.local is NOT listed above!
echo If you see .env.local, press Ctrl+C to cancel!
echo.
pause

echo.
echo [4/6] Creating initial commit...
git commit -m "Initial commit: Solia AI NFT Marketplace"

echo.
echo [5/6] Setting up GitHub remote...
echo.
echo IMPORTANT: Enter your GitHub repository URL
echo Example: https://github.com/YOUR-USERNAME/solia.git
echo.
set /p REPO_URL="Enter GitHub repo URL: "

git remote remove origin 2>nul
git remote add origin %REPO_URL%

echo.
echo [6/6] Pushing to GitHub...
git branch -M main
git push -u origin main

echo.
echo ========================================
echo  SUCCESS! Code pushed to GitHub
echo ========================================
echo.
echo Next steps:
echo 1. Go to your GitHub repository
echo 2. Verify it's set to PRIVATE
echo 3. Check that .env.local is NOT there
echo.
pause
