import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

test(
  'installer parses in Windows PowerShell 5 with its actual on-disk encoding',
  { skip: process.platform !== 'win32' },
  () => {
    const file = resolve('companion/install.ps1').replaceAll("'", "''");
    const script = `$tokens=$null; $parseErrors=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('${file}', [ref]$tokens, [ref]$parseErrors); if ($parseErrors.Count -gt 0) { foreach ($item in $parseErrors) { [Console]::Error.WriteLine($item.Message) }; exit 1 }; [Console]::Write('OK')`;
    const output = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
      { windowsHide: true, encoding: 'utf8', env: { ...process.env, PSModulePath: '' } }
    );
    assert.equal(output.trim(), 'OK');
  }
);
