param([Parameter(Mandatory=$true)][ValidatePattern('^[a-p]{32}$')][string]$ExtensionId)
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -le 5) {
  $env:PSModulePath = $PSHOME + '\Modules;' + [Environment]::GetFolderPath('ProgramFiles') + '\WindowsPowerShell\Modules'
}
$runtime = (Get-Command node.exe -ErrorAction Stop).Source
$version = & $runtime --version
if ([int]($version.TrimStart('v').Split('.')[0]) -lt 22) { throw 'Zainstaluj Node.js 22 lub nowszy.' }
$targetDirectory = Join-Path $env:LOCALAPPDATA 'OKStudy\native-host'
New-Item -ItemType Directory -Path $targetDirectory -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'dist\host.cjs') -Destination (Join-Path $targetDirectory 'host.cjs') -Force
$launcher = Join-Path $targetDirectory 'host.cmd'
$launchText = '@echo off' + "`r`n" + '"' + $runtime + '" "' + (Join-Path $targetDirectory 'host.cjs') + '" %*' + "`r`n"
[IO.File]::WriteAllText($launcher, $launchText, [Text.Encoding]::Default)
$manifest = @{name='pl.okstudy.chatgpt'; description='OKStudy ChatGPT connection'; path=$launcher; type='stdio'; allowed_origins=@("chrome-extension://$ExtensionId/")} | ConvertTo-Json
$manifestPath = Join-Path $targetDirectory 'pl.okstudy.chatgpt.json'
[IO.File]::WriteAllText($manifestPath, $manifest, [Text.UTF8Encoding]::new($false))
foreach ($browserKey in @('Google\Chrome','Microsoft\Edge','BraveSoftware\Brave-Browser')) {
  $registryPath = "HKCU:\Software\$browserKey\NativeMessagingHosts\pl.okstudy.chatgpt"
  New-Item -Path $registryPath -Force | Out-Null
  Set-Item -LiteralPath $registryPath -Value $manifestPath
}
Write-Host 'Moduł OKStudy zainstalowany dla bieżącego użytkownika. Wróć do ustawień rozszerzenia i wybierz Continue with ChatGPT.'
