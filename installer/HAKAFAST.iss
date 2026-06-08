; HAKAFAST local track installer — Inno Setup 6+
; Build: see build-installer.ps1
; Code signing (optional): set HF_SIGN_PFX + HF_SIGN_PASSWORD before build-installer.ps1

#define MyAppName "HAKAFAST"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "HAKAFAST"
#define MyAppURL "https://hakafast.com"

[Setup]
AppId={{A1B2C3D4-E5F6-7890-ABCD-EF1234567890}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=output
OutputBaseFilename=HAKAFAST-Setup-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
; SignedUninstaller=yes  ; enable after HF_SIGN_PFX signing is configured

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create desktop shortcut to Admin"; GroupDescription: "Shortcuts:"; Flags: checkedonce
Name: "kioskicon"; Description: "Create desktop shortcut to Kiosk (WebView2)"; GroupDescription: "Shortcuts:"; Flags: checkedonce
Name: "autostart"; Description: "Install Windows service (auto-start on boot)"; GroupDescription: "Service:"; Flags: checkedonce

[Files]
Source: "..\stage\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\HAKAFAST Admin"; Filename: "{app}\start-hakafast.bat"; Parameters: "admin"
Name: "{group}\HAKAFAST Kiosk"; Filename: "{app}\launch-kiosk.bat"
Name: "{group}\HAKAFAST Live Timing"; Filename: "{app}\start-hakafast.bat"; Parameters: "live"
Name: "{group}\HAKAFAST Reception"; Filename: "{app}\start-hakafast.bat"; Parameters: "reception"
Name: "{autodesktop}\HAKAFAST Admin"; Filename: "{app}\start-hakafast.bat"; Parameters: "admin"; Tasks: desktopicon
Name: "{autodesktop}\HAKAFAST Kiosk"; Filename: "{app}\launch-kiosk.bat"; Tasks: kioskicon

[Run]
Filename: "{app}\install-service.ps1"; Parameters: "-InstallDir ""{app}"""; Flags: runhidden waituntilterminated; Tasks: autostart
Filename: "{app}\start-hakafast.bat"; Description: "Launch HAKAFAST setup wizard"; Flags: postinstall nowait skipifsilent

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-service.ps1"" -Uninstall"; Flags: runhidden waituntilterminated

[Code]
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    { Data lives in ProgramData, not under Program Files }
  end;
end;
