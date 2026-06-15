; HAKAFAST local track installer — Inno Setup 6+
; Build: see build-installer.ps1
; Version passed via iscc /DMyAppVersion=1.0.0
; Code signing (optional): set HF_SIGN_PFX + HF_SIGN_PASSWORD before build-installer.ps1

#define MyAppName "HAKAFAST"
#ifndef MyAppVersion
  #define MyAppVersion "1.0.0"
#endif
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
; Show language selector only if multiple languages are enabled
ShowLanguageDialog=no
; Detect if running on Server OS and show warning
MinVersion=6.1sp1
; Always restart if files are in use (unlikely for Node.js but safe)
CloseApplications=yes
RestartApplications=no

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "hebrew"; MessagesFile: "compiler:Languages\Hebrew.isl"

[Tasks]
Name: "desktopicon"; Description: "Create desktop shortcut to Admin"; GroupDescription: "Shortcuts:"; Flags: checkedonce
Name: "kioskicon"; Description: "Create desktop shortcut to Kiosk (WebView2)"; GroupDescription: "Shortcuts:"; Flags: checkedonce
Name: "autostart"; Description: "Install Windows service (auto-start on boot)"; GroupDescription: "Service:"; Flags: checkedonce

[Files]
Source: "..\stage\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Check: CheckFilesSize

[Icons]
Name: "{group}\HAKAFAST Admin"; Filename: "{app}\start-hakafast.bat"; Parameters: "admin"; Comment: "Open HAKAFAST admin panel"
Name: "{group}\HAKAFAST Kiosk"; Filename: "{app}\launch-kiosk.bat"; Comment: "Open HAKAFAST in fullscreen kiosk mode"
Name: "{group}\HAKAFAST Live Timing"; Filename: "{app}\start-hakafast.bat"; Parameters: "live"; Comment: "Open live timing screen"
Name: "{group}\HAKAFAST Reception"; Filename: "{app}\start-hakafast.bat"; Parameters: "reception"; Comment: "Open driver reception"
Name: "{group}\HAKAFAST Results"; Filename: "{app}\start-hakafast.bat"; Parameters: "results"; Comment: "Open results page"
Name: "{group}\HAKAFAST Data Folder"; Filename: "{cmd}"; Parameters: "/C explorer ""{code:GetDataDir}"""; Comment: "Open HAKAFAST data folder"
Name: "{group}\HAKAFAST Uninstall"; Filename: "{uninstallexe}"; Comment: "Uninstall HAKAFAST"
Name: "{autodesktop}\HAKAFAST Admin"; Filename: "{app}\start-hakafast.bat"; Parameters: "admin"; Tasks: desktopicon
Name: "{autodesktop}\HAKAFAST Kiosk"; Filename: "{app}\launch-kiosk.bat"; Tasks: kioskicon

[Run]
Filename: "{app}\install-service.ps1"; Parameters: "-InstallDir ""{app}"""; Flags: runhidden waituntilterminated; Tasks: autostart
Filename: "{app}\start-hakafast.bat"; Parameters: "admin"; Description: "Launch HAKAFAST setup wizard"; Flags: postinstall nowait skipifsilent unchecked

[UninstallRun]
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install-service.ps1"" -Uninstall"; Flags: runhidden waituntilterminated

[Code]
var
  DataDirPage: TInputDirWizardPage;
  DataDirSet: Boolean;

function CheckFilesSize: Boolean;
begin
  Result := True;
end;

function GetDataDir(Param: String): String;
begin
  Result := ExpandConstant('{commonappdata}\HAKAFAST');
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    { Data lives in ProgramData, not under Program Files }
    { Ensure data directory exists }
    if not DirExists(GetDataDir('')) then
      CreateDir(GetDataDir(''));
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
  begin
    { Ask if user wants to keep data }
    if MsgBox('Delete HAKAFAST data files?', mbConfirmation, MB_YESNO) = IDYES then
    begin
      if DirExists(GetDataDir('')) then
        DelTree(GetDataDir(''), True, True, True);
    end;
  end;
end;