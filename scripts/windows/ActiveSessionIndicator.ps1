param(
  [Parameter(Mandatory = $true)]
  [string]$StatusPath,
  [Parameter(Mandatory = $true)]
  [string]$StopPath
)

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class KeyboardState {
  [DllImport("user32.dll")]
  public static extern short GetAsyncKeyState(int vKey);
}
"@

$form = New-Object System.Windows.Forms.Form
$form.Text = "GO TO WORK"
$form.TopMost = $true
$form.StartPosition = "Manual"
$form.FormBorderStyle = "FixedToolWindow"
$form.Width = 300
$form.Height = 160
$form.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#922f24")
$form.ForeColor = [System.Drawing.Color]::White
$form.Location = New-Object System.Drawing.Point([Math]::Max([System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea.Width - 320, 0), 24)

$title = New-Object System.Windows.Forms.Label
$title.Text = "AI CONTROL ACTIVE"
$title.Font = New-Object System.Drawing.Font("Segoe UI", 16, [System.Drawing.FontStyle]::Bold)
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point(16, 14)
$form.Controls.Add($title)

$details = New-Object System.Windows.Forms.Label
$details.Text = "Ctrl+Alt+F12 to stop"
$details.Font = New-Object System.Drawing.Font("Segoe UI", 11, [System.Drawing.FontStyle]::Regular)
$details.AutoSize = $true
$details.Location = New-Object System.Drawing.Point(16, 52)
$form.Controls.Add($details)

$countdown = New-Object System.Windows.Forms.Label
$countdown.Text = "Waiting for session data"
$countdown.Font = New-Object System.Drawing.Font("Segoe UI", 9, [System.Drawing.FontStyle]::Regular)
$countdown.AutoSize = $true
$countdown.Location = New-Object System.Drawing.Point(16, 82)
$form.Controls.Add($countdown)

$button = New-Object System.Windows.Forms.Button
$button.Text = "Emergency Stop"
$button.Width = 120
$button.Height = 32
$button.Location = New-Object System.Drawing.Point(16, 106)
$button.BackColor = [System.Drawing.ColorTranslator]::FromHtml("#f9ddd7")
$button.ForeColor = [System.Drawing.ColorTranslator]::FromHtml("#922f24")
$button.Add_Click({
  Set-Content -Path $StopPath -Value '{"source":"indicator-button"}' -Encoding UTF8
  $form.Close()
})
$form.Controls.Add($button)

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 250
$pressed = $false
$timer.Add_Tick({
  if (-not (Test-Path $StatusPath)) {
    $form.Close()
    return
  }

  $status = Get-Content $StatusPath -Raw | ConvertFrom-Json
  if (-not $status.active) {
    $form.Close()
    return
  }

  if ($status.expiresAt) {
    $remaining = [DateTime]::Parse($status.expiresAt).ToLocalTime() - [DateTime]::Now
    if ($remaining.TotalSeconds -lt 0) {
      $countdown.Text = "Session expires now"
    } else {
      $countdown.Text = "Lease ends in " + $remaining.ToString("mm\:ss")
    }
  }

  $ctrlDown = [KeyboardState]::GetAsyncKeyState(0x11) -lt 0
  $altDown = [KeyboardState]::GetAsyncKeyState(0x12) -lt 0
  $f12Down = [KeyboardState]::GetAsyncKeyState(0x7B) -lt 0

  if ($ctrlDown -and $altDown -and $f12Down) {
    if (-not $pressed) {
      $pressed = $true
      Set-Content -Path $StopPath -Value '{"source":"indicator-hotkey"}' -Encoding UTF8
      $form.Close()
    }
  } else {
    $pressed = $false
  }
})

$timer.Start()
[System.Windows.Forms.Application]::Run($form)
