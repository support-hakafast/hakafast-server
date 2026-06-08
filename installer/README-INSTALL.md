# HAKAFAST — התקנה מדיסק-און-קי (Phase 1 + 2)

## מה מקבלים

- **Phase 1:** שרת מקומי, שמירת נתונים ב-`%ProgramData%\HAKAFAST`, אשף התקנה (`/setup`), כתובות LAN לזמנים חיים, באנר offline
- **Phase 2:** דף קבלה (`/reception`), דף תוצאות (`/results`), ייצוא CSV+JSON אוטומטי ל-`exports/` בסיום מקצה

## בניית חבילת USB

```powershell
cd installer
.\build-installer.ps1
```

אם מותקן Inno Setup 6 — נוצר `installer/output/HAKAFAST-Setup-1.0.0.exe`.

אחרת — העתק את התיקייה `installer/stage/` לדיסק-און-קי.

### Node portable (מומלץ ל-USB)

הורד [Node.js Windows x64 zip](https://nodejs.org/) וחלץ ל-`installer/node-portable/` כך ש-`installer/node-portable/node.exe` קיים. הסקריפט יארוז אותו בחבילה.

## התקנה במחשב האחראי

1. הרץ `HAKAFAST-Setup-1.0.0.exe` (או העתק `stage` ל-`C:\Program Files\HAKAFAST`)
2. בחר **Install Windows service** — השירות עולה אוטומטית עם Windows
3. נפתח `/setup` — הזן שם מסלול, מספרי קארטים, סיסמת מנהל (אופציונלי)
4. שמור את כתובות ה-LAN למסכי זמנים חיים ברשת המקומית

## כתובות

| מסך | URL |
|-----|-----|
| אשף התקנה | `http://127.0.0.1:5000/setup` |
| מרכז שליטה | `http://127.0.0.1:5000/admin/{track-slug}` |
| זמנים חיים | `http://127.0.0.1:5000/live-timing/{track-slug}` |
| קבלה | `http://127.0.0.1:5000/reception/{track-slug}` |
| תוצאות | `http://127.0.0.1:5000/results` |

## קבצים ונתונים

| נתיב | תוכן |
|------|------|
| `%ProgramData%\HAKAFAST\install.json` | הגדרות התקנה (מסלול, workspace) |
| `%ProgramData%\HAKAFAST\workspaces\` | snapshot JSON לכל workspace |
| `%ProgramData%\HAKAFAST\exports\` | CSV + JSON אוטומטי בסיום מקצה |

## משתני סביבה

| משתנה | ברירת מחדל |
|--------|------------|
| `HF_LOCAL_INSTALL=1` | מצב התקנה מקומית |
| `HF_DATA_DIR` | `%ProgramData%\HAKAFAST` |
| `PORT` | `5000` |

## בדיקה לפני ייצור

```powershell
$env:HF_LOCAL_INSTALL='1'
npm run build
npm start
# פתח http://127.0.0.1:5000/setup
npm run verify:timing
```

## הסרת שירות

```powershell
powershell -ExecutionPolicy Bypass -File install-service.ps1 -Uninstall
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
- בנייה: `dotnet publish` (אוטומטי ב-`build-installer.ps1` אם יש .NET SDK)
- `HF_KIOSK_URL` — override לכתובת (ברירת מחדל: `/admin/{track}`)

קיצורי מקלדת בקiosk: **F11** — מסגרת חלון, **Ctrl+Q** — יציאה.

### חתימת MSI (Code Signing)

```powershell
$env:HF_SIGN_PFX = 'C:\certs\hakafast.pfx'
$env:HF_SIGN_PASSWORD = 'your-password'
$env:HF_SIGN_TIMESTAMP = 'http://timestamp.digicert.com'  # optional
.\build-installer.ps1
```

חותם: `HAKAFAST-Setup-1.0.0.exe` + `HakafastKiosk.exe` (אם נבנה).

דרוש: Windows SDK (`signtool.exe`) + תעודת Code Signing.
