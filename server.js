const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const session = require('express-session'); // הוספת סשן לאבטחת האדמין
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// הגדרת מערכת Session פשוטה ומאובטחת (KISS)
app.use(session({
  secret: 'hakafast_secret_key_2026',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // יממה אחת
}));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function migrateDB() {
  try {
    await pool.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS phone VARCHAR(50);`);
    await pool.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS email VARCHAR(100);`);
    await pool.query(`ALTER TABLE current_heat ADD COLUMN IF NOT EXISTS lap_count INT DEFAULT 0;`);
    await pool.query(`CREATE TABLE IF NOT EXISTS heat_history (id SERIAL PRIMARY KEY, track_id INT, heat_type VARCHAR(50), results JSONB, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);`);
    console.log("Migrations successful.");
  } catch (err) { console.error(err); }
}
migrateDB();

let pitLines = [{ id: 1, name: "ליין ימין", active: true, karts: [] }, { id: 2, name: "ליין שמאל", active: true, karts: [] }];
let heatSettings = { type: 'time', duration: 10, targetLaps: 0 };

// מיפוי זמני של מסלולים לסיסמאות הגישה שלהם (במציאות זה יישלף מה-DB)
const trackCredentials = {
  'holyland-racing': 'fast123',
  'go-karting': 'track2026',
  'demo-track': 'admin'
};

app.get('/api/translations', (req, res) => res.json(JSON.parse(fs.readFileSync('./translations.json'))));
app.get('/api/admin/pits', (req, res) => res.json(pitLines));
app.post('/api/admin/update-pits', (req, res) => { pitLines = req.body.newLines; res.json({success:true}); });
app.get('/api/heat-settings', (req, res) => res.json(heatSettings));
app.post('/api/admin/heat-settings', (req, res) => { heatSettings = req.body; res.json({success:true}); });

// נתיב התחברות דינמי לאדמין (מכניזם אבטחה)
app.post('/api/admin/login/:trackName', (req, res) => {
  const { trackName } = req.params;
  const { password } = req.body;
  
  if (trackCredentials[trackName] && trackCredentials[trackName] === password) {
    req.session.authenticatedTrack = trackName;
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, error: "Password incorrect" });
});

// הגשת דף האדמין - רק אם המשתמש מורשה ועבר את האבטחה
app.get('/admin/:trackName', (req, res) => {
  const { trackName } = req.params;
  
  // אם לא רשום כבעל סיסמה למסלול זה - נציג לו דף התחברות פשוט
  if (req.session.authenticatedTrack !== trackName) {
    return res.send(`
      <!DOCTYPE html>
      <html lang="he" dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>HAKAFAST | Login</title>
        <style>
          body { font-family: system-ui, sans-serif; background: #f4f7f6; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; color: #000080; }
          .login-box { background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border-top: 5px solid #000080; text-align: center; width: 320px; }
          input { width: 100%; padding: 10px; margin: 15px 0; border: 1px solid #cbd5e0; border-radius: 6px; box-sizing: border-box; }
          button { background: #000080; color: white; border: none; padding: 11px 18px; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%; }
          button:hover { background: #40E0D0; color: #000080; }
        </style>
      </head>
      <body>
        <div class="login-box">
          <h2>HAKAFAST LOGIN</h2>
          <p>ניהול מסלול: <b>${trackName}</b></p>
          <input type="password" id="pass" placeholder="הזן סיסמת מנהל">
          <button onclick="login()">התחבר למערכת</button>
        </div>
        <script>
          async function login() {
            const password = document.getElementById('pass').value;
            const res = await fetch('/api/admin/login/${trackName}', {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ password })
            });
            const data = await res.json();
            if(data.success) {
              window.location.reload();
            } else {
              alert("סיסמה שגויה!");
            }
          }
        </script>
      </body>
      </html>
    `);
  }
  
  res.sendFile(__dirname + '/admin.html');
});

// הגשת דף הלקוחות הציבורי - פתוח לכולם לצפייה בלבד ללא סיסמה
app.get('/live-timing/:trackName', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// הפניית ברירת מחדל של דף הבית למסלול דמו
app.get('/', (req, res) => res.redirect('/live-timing/demo-track'));

app.post('/api/admin/finish-heat', async (req, res) => {
    const data = await pool.query('SELECT * FROM current_heat WHERE track_id = 1');
    if (data.rows.length > 0) {
        await pool.query('INSERT INTO heat_history (track_id, heat_type, results) VALUES ($1, $2, $3)', [1, heatSettings.type, JSON.stringify(data.rows)]);
    }
    res.json({ success: true });
});

app.get('/api/admin/export-csv', async (req, res) => {
    const result = await pool.query('SELECT * FROM current_heat WHERE track_id = 1 ORDER BY best_lap_time ASC');
    let csv = '\uFEFFPos,Kart,Driver,Level,Last,Best,Laps\n';
    result.rows.forEach((r, i) => { csv += `${i+1},${r.kart_number},"${r.driver_name}",${r.driver_level || ''},${r.last_lap_time || ''},${r.best_lap_time || ''},${r.lap_count}\n`; });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('Results.csv');
    res.send(csv);
});

app.post('/assign-driver', async (req, res) => {
  let { track_id, kart_number, driver_name, driver_level, phone, email } = req.body;
  try {
    await pool.query(`INSERT INTO current_heat (track_id, kart_number, driver_name, driver_level) VALUES ($1, $2, $3, $4)`, 
      [track_id, kart_number, driver_name, driver_level || null]);
      
    if (phone || email) {
      await pool.query(`INSERT INTO drivers (track_id, full_name, phone, email, driver_level) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`, 
        [track_id, driver_name, phone || null, email || null, driver_level || 'Amateur']);
    }
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
  }
});

app.post('/api/admin/update-driver-level', async (req, res) => {
  const { lookup, level } = req.body;
  try {
    const result = await pool.query(`UPDATE drivers SET driver_level = $1 WHERE phone = $2 OR email = $2 RETURNING *`, [level, lookup]);
    if(result.rowCount > 0) res.json({ success: true });
    else res.json({ success: false, error: "Driver not found" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/live-timing-data/:track_id', async (req, res) => {
  let order = heatSettings.type === 'sprint' ? "lap_count DESC, best_lap_time ASC" : "best_lap_time ASC NULLS LAST";
  const result = await pool.query(`SELECT * FROM current_heat WHERE track_id = $1 ORDER BY ${order} LIMIT 30`, [req.params.track_id]);
  res.json(result.rows);
});

app.post('/api/admin/clear-heat', async (req, res) => { await pool.query('DELETE FROM current_heat WHERE track_id = 1'); res.json({success:true}); });

app.listen(port, () => console.log("HAKAFAST Active"));