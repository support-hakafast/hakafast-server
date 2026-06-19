# HAKAFAST — התקנה מדיסק-און-קי (Phase 1 + 2)

## מה מקבלים

- **Phase 1:** שרת מקומי, שמירת נתונים ב-`%ProgramData%\HAKAFAST`, אשף התקנה (`/setup`), כתובות LAN לזמנים חיים, באנר offline
- **Phase 2:** דף קבלה (`/reception`), דף תוצאות (`/results`), ייצוא CSV+JSON אוטומטי ל-`exports/` בסיום מקצה
- **Phase 3 (אופציונלי):** Rentix webhook, WebView2 Kiosk Shell, חתימת MSI

## דרישות מערכת לבנייה

- **Windows 10+** (64-bit)
- **Node.js 18+** (https://nodejs.org)
- **npm** (מגיע עם Node.js)
- **Inno Setup 6** (אופציונלי, ליצירת exe) — https://jrsoftware.org/isdl.php
- **.NET SDK 8+** (אופציונלי, לבניית Kiosk WebView2)
- **Windows SDK** (אופציונלי, לחתימה)

## בניית חבילת USB

```powershell
cd installer
.\build-installer.ps1
```

הסקריפט יבצע:
1. בדיקות מקדימות (Node, npm, גרסה)
2. בניית frontend (`npm run build`)
3. העתקת קבצים נדרשים לתיקיית `stage/`
4. אריזת Node.js prtable (אם קיים ב-`installer/node-portable/`)
5. בניית WebView2 Kiosk (אם יש .NET SDK)
6. התקנת תלויות production (`npm ci --omit=dev`)
7. קומפילציה של Inno Setup installer (אם `iscc` זמין) ל-`installer/output/`
8. חתימת קוד (אם מוגדר)

### Node portable (מומלץ ל-USB)

הורד [Node.js Windows x64 zip](https://nodejs.org/) וחלץ ל-`installer/node-portable/` כך ש-`installer/node-portable/node.exe` קיים. הסקריפט יארוז אותו בחבילה.

אם לא תספק Node portable — השרת ישתמש ב-Node.js המותקן במחשב היעד.

### חתימת MSI (Code Signing)

```powershell
$env:HF_SIGN_PFX = 'C:\certs\hakafast.pfx'
$env:HF_SIGN_PASSWORD = 'your-password'
$env:HF_SIGN_TIMESTAMP = 'http://timestamp.digicert.com'  # optional
.\build-installer.ps1
```

חותם: `HAKAFAST-Setup-*.exe` + `HakafastKiosk.exe` (אם נבנה).

דרוש: Windows SDK (`signtool.exe`) + תעודת Code Signing.

## התקנה במחשב האחראי

### שיטה A — מתקין Inno Setup (.exe)

1. הרץ `HAKAFAST-Setup-*.exe` מתוך `installer/output/`
2. בחר **Install Windows service** — השירות עולה אוטומטית עם Windows
3. בחר Shortcuts (Admin, Kiosk) לשולחן העבודה
4. לאחר ההתקנה, ייפתח אשף ההגדרה (`/setup`)
5. הזן שם מסלול, מספרי קארטים, סיסמת מנהל (אופציונלי)
6. שמור את כתובות ה-LAN למסכי זמנים חיים ברשת המקומית

### שיטה B — USB / העתקה ידנית

1. העתק את תוכן תיקיית `installer/stage/` ל-`C:\Program Files\HAKAFAST`
2. הרץ כמנהל: `powershell -ExecutionPolicy Bypass -File "C:\Program Files\HAKAFAST\install-service.ps1"`
3. פתח בדפדפן: `http://127.0.0.1:5000/setup`

### שיטה C — הרצה ישירה (ללא התקנת שירות)

```powershell
cd C:\Program Files\HAKAFAST
start-hakafast.bat admin
```

ניתן גם: `start-hakafast.bat setup`, `start-hakafast.bat live`, `start-hakafast.bat reception`, `start-hakafast.bat results`

## תפריט התחל

לאחר התקנת Inno Setup:

| קיצור | פתח |
|-------|------|
| HAKAFAST Admin | פאנל ניהול |
| HAKAFAST Kiosk | מסך מלא (WebView2 / Edge) |
| HAKAFAST Live Timing | זמנים חיים |
| HAKAFAST Reception | קבלת נהגים |
| HAKAFAST Results | תוצאות |
| HAKAFAST Data Folder | תיקיית נתונים (`%ProgramData%\HAKAFAST`) |
| HAKAFAST Uninstall | הסרת התקנה |

## כתובות

| מסך | URL |
|-----|-----|
| אשף התקנה | `http://127.0.0.1:5000/setup` |
| מרכז שליטה | `http://127.0.0.1:5000/admin/{track-slug}` |
| זמנים חיים | `http://127.0.0.1:5000/live-timing/{track-slug}` |
| קבלה | `http://127.0.0.1:5000/reception/{track-slug}` |
| תוצאות | `http://127.0.0.1:5000/results` |
| הזמנות (קיוסק) | `http://127.0.0.1:5000/booking/{track-slug}` |
| פורטל HQ (הנפקת רישיונות) | `http://YOUR-HQ-SERVER:5000/hq` |

## קבצים ונתונים

| נתיב | תוכן |
|------|------|
| `%ProgramData%\HAKAFAST\install.json` | הגדרות התקנה (מסלול, workspace) |
| `%ProgramData%\HAKAFAST\workspaces\` | snapshot JSON לכל workspace |
| `%ProgramData%\HAKAFAST\exports\` | CSV + JSON אוטומטי בסיום מקצה |
| `%ProgramData%\HAKAFAST\logs\` | לוגים של שירות Windows |

## משתני סביבה

| משתנה | ברירת מחדל | תיאור |
|--------|------------|-------|
| `HF_LOCAL_INSTALL=1` | `1` | מצב התקנה מקומית |
| `HF_DATA_DIR` | `%ProgramData%\HAKAFAST` | תיקיית נתונים |
| `PORT` | `5000` | פורט שרת |
| `HF_KIOSK_URL` | אוטומטי | URL ל-kiosk (override) |
| `HF_KIOSK_MODE` | — | מצב kiosk |
| `NODE_ENV` | `production` | מצב Node.js |
| `HF_LICENSE_KEYS` | — | מפתחות רישיון (מופרדים בפסיק) |
| `AMB_DECODER_HOST` | — | IP של דקודר AMB/MyLaps |
| `AMB_DECODER_PORT` | `5403` | פורט TCP של הדקודר |
| `AMB_TRANSPONDER_MAP` | — | JSON: מיפוי טרנספונדר→קארט |
| `HQ_PASSWORD` | — | סיסמת פורטל HQ (בשרת HQ בלבד) |
| `HQ_SECRET` | — | סוד TOTP לפורטל HQ (בשרת HQ בלבד) |

## ניהול שירות

### התקנת שירות

```powershell
# מתוך תיקיית ההתקנה
powershell -ExecutionPolicy Bypass -File install-service.ps1
```

### הסרת שירות

```powershell
powershell -ExecutionPolicy Bypass -File install-service.ps1 -Uninstall
```

### בדיקת סטטוס

```powershell
Get-Service HAKAFAST
```

### צפייה בלוגים

```powershell
Get-Content "$env:ProgramData\HAKAFAST\logs\service.log" -Tail 50
```

## הסרת התקנה מלאה

1. הסר שירות: `install-service.ps1 -Uninstall`
2. מחק תיקייה: `rm -r "$env:ProgramData\HAKAFAST"` (לשמור נתונים?)
3. מחק תיקיית התקנה: `rm -r "C:\Program Files\HAKAFAST"`
4. (אופציונלי) נקה משתני סביבה: `[Environment]::SetEnvironmentVariable('HF_LOCAL_INSTALL', $null, 'Machine')`

## בדיקה לפני ייצור

```powershell
$env:HF_LOCAL_INSTALL='1'
npm run build
npm start
# פתח http://127.0.0.1:5000/setup
npm run verify:timing
```

---

## Phase 3 — Rentix, Kiosk, חתימת MSI

### Rentix webhook / API

| Endpoint | תיאור |
|----------|--------|
| `GET /api/webhooks/rentix/status` | סטטוס חיבור |
| `POST /api/webhooks/rentix` | קבלת נהגים (webhook) |
| `POST /api/webhooks/rentix/sync` | משיכת הזמנות מ-Rentix API |
| `POST /api/install/rentix` | שמירת הגדרות ב-`install.json` |

**Webhook — הוספת נהג לתור:**

```json
POST /api/webhooks/rentix
Headers: X-HF-Rentix-Secret: <your-secret>
{
  "event": "driver.queue",
  "driver": { "name": "יוסי כהן", "phone": "0501234567", "driver_level": "Amateur" }
}
```

**Rentix API sync** (cms.rentix.biz):

```powershell
# ב-install.json או POST /api/install/rentix:
# publicKey, secretKey, rentId, webhookSecret, resultsWebhookUrl
POST /api/webhooks/rentix/sync
{ "lastDays": 1, "limit": 50 }
```

**ייצוא תוצאות ל-Rentix** — בסיום מקצה, POST אוטומטי ל-`resultsWebhookUrl` עם payload `heat.results`.

### WebView2 Kiosk Shell

- `launch-kiosk.bat` — פותח `HakafastKiosk.exe` (WebView2) במסך מלא
- Fallback: Edge/Chrome kiosk mode אם ה-exe לא נבנה
- הזנת track slug אוטומטית מ-`install.json`
- `HF_KIOSK_URL` — override לכתובת
- בנייה: `dotnet publish` (אוטומטי ב-`build-installer.ps1` אם יש .NET SDK)

קיצורי מקלדת בקiosk: **F11** — מסגרת חלון, **Ctrl+Q** — יציאה.

## תמיכה

- אימייל: support.hakafast@gmail.com
- אתר: https://hakafast.com