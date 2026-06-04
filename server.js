const express = require('express');
const { Pool } = require('pg');
const fs = require('fs');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// פונקציה להרצת עדכוני מבנה ב-Database באופן אוטומטי (Auto-Migration)
async function migrateDB() {
  try {
    console.log("Checking for database updates...");
    
    // 1. הוספת עמודות טלפון ומייל לטבלת נהגים (אם אינן קיימות)
    await pool.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS phone VARCHAR(50);`);
    await pool.query(`ALTER TABLE drivers ADD COLUMN IF NOT EXISTS email VARCHAR(100);`);
    
    // 2. הוספת עמודת ספירת הקפות למקצה הנוכחי (עבור מרוצי ספרינט)
    await pool.query(`ALTER TABLE current_heat ADD COLUMN IF NOT EXISTS lap_count INT DEFAULT 0;`);
    
    console.log("Database migrations completed successfully!");
  } catch (err) {
    console.error("Error running migrations:", err);
  }
}

// הפעלת המיגרציה מיד עם חיבור השרת
migrateDB();

// משתנים גלובליים דינמיים בזיכרון השרת (KISS)
let pitLines = { 1: [], 2: [] }; // מתחיל מ-2 ליינים דינמיים כברירת מחדל
let currentHeatSettings = {
  type: 'time', // 'time', 'endurance', 'sprint'
  duration: 10,  // דקות
  targetLaps: 0  // רלוונטי רק לספרינט
};

app.get('/api/translations', (req, res) => {
  res.json(JSON.parse(fs.readFileSync('./translations.json')));
});

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/admin', (req, res) => res.sendFile(__dirname + '/admin.html'));

// ניהול ליינים מה-Admin
app.get('/api/admin/pits', (req, res) => res.json(pitLines));

app.post('/api/admin/update-pits', (req, res) => {
  const { newLines } = req.body;
  if (newLines) {
    pitLines = newLines;
    return res.json({ success: true, pitLines });
  }
  res.status(400).json({ success: false });
});

// עדכון הגדרות מקצה מה-Admin
app.post('/api/admin/heat-settings', (req, res) => {
  const { type, duration, targetLaps } = req.body;
  currentHeatSettings = { type, duration: parseInt(duration), targetLaps: parseInt(targetLaps) };
  res.json({ success: true, currentHeatSettings });
});

app.get('/api/heat-settings', (req, res) => res.json(currentHeatSettings));

// ניקוי המקצה הנוכחי (כשמתחילים מקצה חדש)
app.post('/api/admin/clear-heat', async (req, res) => {
  try {
    await pool.query('DELETE FROM current_heat WHERE track_id = 1');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// שיבוץ נהג (תומך בהפרדת שדות טלפון ומייל)
app.post('/assign-driver', async (req, res) => {
  let { track_id, kart_number, driver_name, driver_level, phone, email } = req.body;
  
  if (!driver_name) driver_name = `קארט #${kart_number}`;

  try {
    // שמירה ל-DB לטווח ארוך רק אם הוכנס פרט זיהוי אחד לפחות
    if ((phone && phone.trim() !== "") || (email && email.trim() !== "")) {
      await pool.query(
        `INSERT INTO drivers (track_id, full_name, phone, email, driver_level) 
         VALUES ($1, $2, $3, $4, $5) 
         ON CONFLICT DO NOTHING`,
        [track_id, driver_name, phone || null, email || null, driver_level || 'Amateur']
      );
    }

    // הזרקה למקצה הנוכחי
    const result = await pool.query(
      `INSERT INTO current_heat (track_id, kart_number, driver_name, driver_level, lap_count)
       VALUES ($1, $2, $3, $4, 0) RETURNING *`,
      [track_id, kart_number, driver_name, driver_level || 'Amateur']
    );
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// שליפת נתוני המקצה למסכי לקוחות (עם מיון דינמי לפי סוג המרוץ!)
app.get('/live-timing/:track_id', async (req, res) => {
  try {
    let orderBy = "best_lap_time ASC NULLS LAST"; // דיפולט למקצי זמן וסיבולת
    
    if (currentHeatSettings.type === 'sprint') {
      orderBy = "lap_count DESC, best_lap_time ASC NULLS LAST"; // ספרינט: מי שיש לו הכי הרבה הקפות מוביל
    }

    const query = `SELECT * FROM current_heat WHERE track_id = $1 ORDER BY ${orderBy} LIMIT 30;`;
    const result = await pool.query(query, [req.params.track_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.listen(port, () => console.log(`HAKAFAST Engine running on port ${port}`));