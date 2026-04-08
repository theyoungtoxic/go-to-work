param(
  [Parameter(Mandatory = $true)]
  [string]$Command,
  [Parameter(Mandatory = $true)]
  [string]$PayloadJson
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);
public static class Win32 {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int maxCount);
  [DllImport("user32.dll")] public static extern int GetWindowTextLength(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
"@

$payload = $PayloadJson | ConvertFrom-Json

# Comprehensive key-name-to-SendKeys mapping (shared by keyboard_key and keyboard_hotkey)
$keyNameMap = @{
  "enter" = "{ENTER}"; "return" = "{ENTER}"
  "tab" = "{TAB}"
  "escape" = "{ESC}"; "esc" = "{ESC}"
  "backspace" = "{BACKSPACE}"; "bs" = "{BACKSPACE}"
  "delete" = "{DELETE}"; "del" = "{DELETE}"
  "insert" = "{INSERT}"; "ins" = "{INSERT}"
  "home" = "{HOME}"; "end" = "{END}"
  "pageup" = "{PGUP}"; "pgup" = "{PGUP}"
  "pagedown" = "{PGDN}"; "pgdn" = "{PGDN}"
  "up" = "{UP}"; "down" = "{DOWN}"; "left" = "{LEFT}"; "right" = "{RIGHT}"
  "space" = " "
  "f1" = "{F1}"; "f2" = "{F2}"; "f3" = "{F3}"; "f4" = "{F4}"
  "f5" = "{F5}"; "f6" = "{F6}"; "f7" = "{F7}"; "f8" = "{F8}"
  "f9" = "{F9}"; "f10" = "{F10}"; "f11" = "{F11}"; "f12" = "{F12}"
  "capslock" = "{CAPSLOCK}"; "numlock" = "{NUMLOCK}"; "scrolllock" = "{SCROLLLOCK}"
  "break" = "{BREAK}"; "printscreen" = "{PRTSC}"; "prtsc" = "{PRTSC}"
}

# Modifier prefixes for keyboard_hotkey
$modifierMap = @{
  "ctrl" = "^"; "control" = "^"
  "alt" = "%"
  "shift" = "+"
}

function Escape-SendKeysText {
  param([string]$Text)
  $escaped = $Text.Replace("{", "{{}")
  $escaped = $escaped.Replace("}", "{}}")
  $escaped = $escaped.Replace("+", "{+}")
  $escaped = $escaped.Replace("^", "{^}")
  $escaped = $escaped.Replace("%", "{%}")
  $escaped = $escaped.Replace("~", "{~}")
  $escaped = $escaped.Replace("(", "{(}")
  $escaped = $escaped.Replace(")", "{)}")
  return $escaped
}

function Get-WindowTitle {
  param([IntPtr]$Handle)
  $length = [Win32]::GetWindowTextLength($Handle)
  $builder = New-Object System.Text.StringBuilder ($length + 1)
  [void][Win32]::GetWindowText($Handle, $builder, $builder.Capacity)
  return $builder.ToString()
}

function Get-AllWindows {
  $windows = New-Object System.Collections.Generic.List[object]
  $callback = [EnumWindowsProc]{
    param($hWnd, $lParam)
    if (-not [Win32]::IsWindowVisible($hWnd)) {
      return $true
    }

    $title = Get-WindowTitle -Handle $hWnd
    if ([string]::IsNullOrWhiteSpace($title)) {
      return $true
    }

    [uint32]$processId = 0
    [void][Win32]::GetWindowThreadProcessId($hWnd, [ref]$processId)
    $processName = ""
    try {
      $process = Get-Process -Id $processId -ErrorAction Stop
      $processName = "$($process.ProcessName).exe"
    } catch {
      $processName = "unknown.exe"
    }

    $windows.Add([pscustomobject]@{
      handle = "0x{0:X}" -f $hWnd.ToInt64()
      title = $title
      processName = $processName
    })

    return $true
  }
  [void][Win32]::EnumWindows($callback, [IntPtr]::Zero)
  return $windows
}

try {
  switch ($Command) {
    "list_windows" {
      $windows = Get-AllWindows
      @{ ok = $true; windows = $windows } | ConvertTo-Json -Depth 5
      exit 0
    }
    "get_active_window" {
      $handle = [Win32]::GetForegroundWindow()
      $title = Get-WindowTitle -Handle $handle
      [uint32]$processId = 0
      [void][Win32]::GetWindowThreadProcessId($handle, [ref]$processId)
      $processName = (Get-Process -Id $processId -ErrorAction Stop).ProcessName + ".exe"
      @{ ok = $true; window = @{ handle = ("0x{0:X}" -f $handle.ToInt64()); title = $title; processName = $processName } } | ConvertTo-Json -Depth 5
      exit 0
    }
    "focus_window" {
      $targetHandle = [IntPtr]::new([Convert]::ToInt64($payload.handle, 16))
      [void][Win32]::ShowWindowAsync($targetHandle, 9)
      [void][Win32]::SetForegroundWindow($targetHandle)
      @{ ok = $true; handle = $payload.handle } | ConvertTo-Json -Depth 5
      exit 0
    }
    "mouse_move" {
      [void][Win32]::SetCursorPos([int]$payload.x, [int]$payload.y)
      @{ ok = $true; x = [int]$payload.x; y = [int]$payload.y } | ConvertTo-Json -Depth 5
      exit 0
    }
    "mouse_click" {
      $button = [string]$payload.button
      if ($button -eq "right") {
        [Win32]::mouse_event(0x0008, 0, 0, 0, [UIntPtr]::Zero)
        [Win32]::mouse_event(0x0010, 0, 0, 0, [UIntPtr]::Zero)
      } else {
        [Win32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
        [Win32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
      }
      @{ ok = $true; button = $button } | ConvertTo-Json -Depth 5
      exit 0
    }
    "mouse_scroll" {
      [Win32]::mouse_event(0x0800, 0, 0, [uint32]([int]$payload.delta * 120), [UIntPtr]::Zero)
      @{ ok = $true; delta = [int]$payload.delta } | ConvertTo-Json -Depth 5
      exit 0
    }
    "keyboard_text" {
      [System.Windows.Forms.SendKeys]::SendWait((Escape-SendKeysText -Text ([string]$payload.text)))
      @{ ok = $true; textLength = ([string]$payload.text).Length } | ConvertTo-Json -Depth 5
      exit 0
    }
    "keyboard_key" {
      $rawKey = [string]$payload.key
      $lower = $rawKey.ToLowerInvariant()
      if ($keyNameMap.ContainsKey($lower)) {
        [System.Windows.Forms.SendKeys]::SendWait($keyNameMap[$lower])
      } elseif ($rawKey.Length -eq 1) {
        [System.Windows.Forms.SendKeys]::SendWait((Escape-SendKeysText -Text $rawKey))
      } else {
        throw "Unknown key: '$rawKey'. Use a recognized key name (enter, tab, f1, etc.) or a single character."
      }
      @{ ok = $true; key = $rawKey } | ConvertTo-Json -Depth 5
      exit 0
    }
    "keyboard_hotkey" {
      $keys = @($payload.keys)
      $parts = foreach ($key in $keys) {
        $lower = ([string]$key).ToLowerInvariant()
        if ($modifierMap.ContainsKey($lower)) {
          $modifierMap[$lower]
        } elseif ($keyNameMap.ContainsKey($lower)) {
          $keyNameMap[$lower]
        } elseif (([string]$key).Length -eq 1) {
          Escape-SendKeysText -Text ([string]$key)
        } else {
          throw "Unknown key in hotkey: '$key'. Use a recognized key name or a single character."
        }
      }
      [System.Windows.Forms.SendKeys]::SendWait(($parts -join ""))
      @{ ok = $true; keys = $keys } | ConvertTo-Json -Depth 5
      exit 0
    }
    "screenshot" {
      $screenshotsDir = [string]$payload.screenshotsDir
      $label = [string]$payload.label
      if ([string]::IsNullOrWhiteSpace($label)) {
        $label = "desktop"
      }
      $safeLabel = ($label -replace "[^a-zA-Z0-9-_]", "-").ToLowerInvariant()
      $path = Join-Path $screenshotsDir ("{0}-{1}.png" -f [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(), $safeLabel)

      $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
      $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
      $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
      $graphics.Dispose()
      $bitmap.Dispose()

      @{ ok = $true; path = $path } | ConvertTo-Json -Depth 5
      exit 0
    }
    default {
      throw "Unsupported command: $Command"
    }
  }
} catch {
  @{ ok = $false; error = $_.Exception.Message } | ConvertTo-Json -Depth 5
  exit 1
}
