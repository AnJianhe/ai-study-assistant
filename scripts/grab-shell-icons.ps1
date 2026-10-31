$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class ShellIco {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Auto)]
  public struct SHFILEINFO {
    public IntPtr hIcon;
    public int iIcon;
    public uint dwAttributes;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)] public string szDisplayName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)] public string szTypeName;
  }
  [DllImport("shell32.dll", CharSet = CharSet.Auto)]
  public static extern IntPtr SHGetFileInfo(string pszPath, uint dwFileAttributes, ref SHFILEINFO psfi, uint cbFileInfo, uint uFlags);
  [DllImport("user32.dll")] public static extern bool DestroyIcon(IntPtr hIcon);
}
'@
Add-Type -AssemblyName System.Drawing

function Grab-Icon($path, $size, $outFile) {
  $info = New-Object ShellIco+SHFILEINFO
  $flags = 0x100  # SHGFI_ICON
  if ($size -eq 'small') { $flags = $flags -bor 0x1 }
  $cb = [System.Runtime.InteropServices.Marshal]::SizeOf($info)
  $ok = [ShellIco]::SHGetFileInfo($path, 0, [ref]$info, $cb, $flags)
  if ($info.hIcon -eq [IntPtr]::Zero) { return $false }
  $icon = [System.Drawing.Icon]::FromHandle($info.hIcon)
  $bmp = $icon.ToBitmap()
  $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
  [ShellIco]::DestroyIcon($info.hIcon) | Out-Null
  return $true
}

$targets = @(
  @{ name = 'desktop-lnk'; path = 'G:\Desktop\AI学习助手.lnk' },
  @{ name = 'startmenu-lnk'; path = "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\AI学习助手.lnk" },
  @{ name = 'exe'; path = 'E:\AI 学习\ai-study-assistant\AI学习助手.exe' }
)
foreach ($t in $targets) {
  if (-not (Test-Path $t.path)) { Write-Output "$($t.name): missing"; continue }
  $out = Join-Path $env:TEMP ("shell-icon-" + $t.name + ".png")
  $okLarge = Grab-Icon $t.path 'large' $out
  $outSmall = Join-Path $env:TEMP ("shell-icon-" + $t.name + "-small.png")
  $okSmall = Grab-Icon $t.path 'small' $outSmall
  Write-Output ("{0}: large={1} {2} | small={3} {4}" -f $t.name, $okLarge, $out, $okSmall, $outSmall)
}
