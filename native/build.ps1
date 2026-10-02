# Builds native/bin/NativePanel.exe with the C# compiler that ships with .NET Framework 4.x,
# so the demo app needs no .NET SDK or Visual Studio.
$ErrorActionPreference = "Stop"

$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    throw "csc.exe not found at $csc (.NET Framework 4.x is required)"
}

$outDir = Join-Path $PSScriptRoot "bin"
New-Item -ItemType Directory -Force $outDir | Out-Null

& $csc /nologo /target:winexe /optimize+ /platform:x64 `
    "/out:$(Join-Path $outDir 'NativePanel.exe')" `
    "/win32manifest:$(Join-Path $PSScriptRoot 'app.manifest')" `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll `
    (Join-Path $PSScriptRoot "NativePanel.cs")

if ($LASTEXITCODE -ne 0) {
    throw "csc.exe failed with exit code $LASTEXITCODE"
}
Write-Host "Built $(Join-Path $outDir 'NativePanel.exe')"
