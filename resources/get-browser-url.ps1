param(
    [string]$ProcessName,
    [string]$Hwnd
)

# Immediately capture the foreground window handle before any .NET loading
# This minimizes the race condition where the browser loses focus
Add-Type @"
using System;
using System.Runtime.InteropServices;

public class Win32 {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    public static extern int GetWindowText(IntPtr hWnd, System.Text.StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern int GetWindowTextLength(IntPtr hWnd);
}
"@

# Use pre-captured HWND if provided, otherwise capture now
if ($Hwnd) {
    $winHandle = [IntPtr]::new([long]$Hwnd)
} else {
    $winHandle = [Win32]::GetForegroundWindow()
}
if ($winHandle -eq [IntPtr]::Zero) { exit 0 }

# Get window title
$titleLen = [Win32]::GetWindowTextLength($winHandle)
$title = ""
if ($titleLen -gt 0) {
    $sb = New-Object System.Text.StringBuilder($titleLen + 1)
    [void][Win32]::GetWindowText($winHandle, $sb, $sb.Capacity)
    $title = $sb.ToString()
}

# Load UI Automation assemblies
try {
    Add-Type -AssemblyName UIAutomationClient | Out-Null
    Add-Type -AssemblyName UIAutomationTypes | Out-Null
} catch {
    exit 0
}

# Get the automation element from the captured HWND
try {
    $element = [System.Windows.Automation.AutomationElement]::FromHandle($winHandle)
} catch {
    exit 0
}

# Find Edit controls (address bar)
$editCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::Edit
)

try {
    $edits = $element.FindAll(
        [System.Windows.Automation.TreeScope]::Descendants,
        $editCondition
    )
} catch {
    exit 0
}

$url = ""

foreach ($edit in $edits) {
    try {
        $valuePattern = $null
        if ($edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valuePattern)) {
            $val = $valuePattern.Current.Value
            if ($val -and ($val -match '^https?://' -or $val -match '^[a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z]{2,})+')) {
                $url = $val
                break
            }
        }
    } catch {
        continue
    }
}

if (-not $url) { exit 0 }

# Ensure URL has protocol
if ($url -notmatch '^https?://') {
    $url = "https://$url"
}

# Parse page title by stripping browser name suffix
$pageTitle = $title
$suffixes = @(
    ' - Mozilla Firefox',
    ' - Firefox',
    ' - Google Chrome',
    ' - Chrome',
    ' - Microsoft Edge',
    ' - Brave',
    ' - Opera',
    ' - Vivaldi',
    " `u{2014} Mozilla Firefox",
    " `u{2014} Firefox",
    " `u{2014} Google Chrome",
    " `u{2014} Microsoft Edge"
)
foreach ($suffix in $suffixes) {
    if ($pageTitle.EndsWith($suffix)) {
        $pageTitle = $pageTitle.Substring(0, $pageTitle.Length - $suffix.Length)
        break
    }
}

# Output tab-separated url and title
Write-Output "$url`t$pageTitle"
