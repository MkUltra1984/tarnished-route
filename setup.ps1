# One-time setup on a new Windows PC. Run from the project folder:  powershell -ExecutionPolicy Bypass -File setup.ps1
# Installs Node.js and Git if missing, project packages, the headless test browser and the map upscaler.

function Test-Tool($name) { [bool](Get-Command $name -ErrorAction SilentlyContinue) }

if (-not (Test-Tool node)) { winget install --id OpenJS.NodeJS.LTS -e --silent --accept-package-agreements --accept-source-agreements }
if (-not (Test-Tool git))  { winget install --id Git.Git -e --silent --accept-package-agreements --accept-source-agreements }
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User')

npm install --no-fund --no-audit
npx playwright install chromium

$bin = Join-Path $PSScriptRoot 'tools\bin'
if (-not (Test-Path "$bin\realesrgan\realesrgan-ncnn-vulkan.exe")) {
  New-Item -ItemType Directory -Force $bin | Out-Null
  Invoke-WebRequest -Uri 'https://github.com/xinntao/Real-ESRGAN/releases/download/v0.2.5.0/realesrgan-ncnn-vulkan-20220424-windows.zip' -OutFile "$bin\realesrgan.zip" -UseBasicParsing
  Expand-Archive "$bin\realesrgan.zip" -DestinationPath "$bin\realesrgan" -Force
  Remove-Item "$bin\realesrgan.zip"
}

if (-not [Environment]::GetEnvironmentVariable('OPENAI_API_KEY','User')) {
  Write-Host ''
  Write-Host 'OPENAI_API_KEY is not set on this PC. Set it yourself (it is not stored in the repository):'
  Write-Host '  setx OPENAI_API_KEY "sk-..."'
}
Write-Host ''
Write-Host 'Setup finished. Open this folder in VS Code, start Claude Code and say: read HANDOFF.md and continue.'
