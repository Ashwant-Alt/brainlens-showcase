param([string]$JobsDirectory = 'D:\BrainLens-research\website-runtime-v2\jobs', [string]$BriscBundle = 'D:\BrainLens-research\brisc-2d-prototype-v1\model-bundle-v1\bundle.json', [string]$SliceJobsDirectory = 'D:\BrainLens-research\brisc-2d-prototype-v1\website-runs-v1')

$ErrorActionPreference = 'Stop'
$taskJobsDirectory = [IO.Path]::GetFullPath($JobsDirectory)
if ([IO.Path]::GetPathRoot($taskJobsDirectory) -ine 'D:\' -or $taskJobsDirectory.TrimEnd('\') -ieq 'D:') {
    throw 'Choose a dedicated processing folder on D:.'
}
if (-not (Test-Path -LiteralPath 'D:\')) { throw 'The D: drive is unavailable.' }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js is required to start BrainLens.' }
if (@(Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue).Count -gt 0) {
    Write-Output 'A server is already running at http://127.0.0.1:3000/. Leave it running.'
    return
}
$taskTemporaryDirectory = Join-Path (Split-Path -Parent $taskJobsDirectory) 'temp'
New-Item -ItemType Directory -Path $taskJobsDirectory,$taskTemporaryDirectory -Force | Out-Null
$env:MRI_JOBS_DIR = $taskJobsDirectory
$env:BRAINLENS_BRISC_BUNDLE = [IO.Path]::GetFullPath($BriscBundle)
$env:BRAINLENS_SLICE_JOBS_DIR = [IO.Path]::GetFullPath($SliceJobsDirectory)
$env:TEMP = $taskTemporaryDirectory
$env:TMP = $taskTemporaryDirectory
Push-Location -LiteralPath $PSScriptRoot
try { node --env-file-if-exists=.env server.mjs } finally { Pop-Location }
