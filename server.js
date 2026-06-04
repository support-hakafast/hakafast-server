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

// משתנה גלובלי בזיכרון למצבת הקארטים הפעילים (KISS - טווח מספרים)
let activeKartsRange = { min: 1, max: 20 };

// הגשת קובץ התרגום
app.get('/api/translations', (req, res) => {
  const data = fs.readFileSync('./translations.json');
  res.json(JSON.parse(data));
});

// דף לקוחות (Live Timing)
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// דף מנהל (Admin) - מוגן ב-URL ייעודי
app.get('/admin', (req, res) => {
  res.sendFile(__dirname + '/admin.html');
});

// Endpoint: עדכון מצבת הקארטים ע"י ה-Admin
app.post('/api/admin/setup-karts', (req, res) => {
  const { min, max } = req.body;
  if(min && max) {
    activeKartsRange = { min: parseInt(min), max: parseInt(max) };
    return res.json({ success: true, range: activeKartsRange });
  }
  res.status(400).json({ success: false, error: 'Invalid range' });
});

// Endpoint: קבלת הקארטים הזמינים לשיבוץ
app.get('/api/admin/karts', (req, res) => {
  res.json(activeKartsRange);
});

// Endpoint לשיבוץ נהג (תומך גם בנהג אנונימי/זמני)
app.post('/assign-driver', async (req, res) => {
  let { track_id, kart_number, driver_name, driver_level, contact_info } = req.body;
  
  // הגדרת שם ברירת מחדל אם הושאר ריק (KISS)
  if (!driver_name) {
    driver_name = `קארט #${kart_number}`;
    driver_level = 'Amateur';
  }

  try {
    // אם הוכנס פרט זיהוי (מייל או טלפון), נשמור אותו בטבלת הנהגים הקבועים
    if (contact_info && contact_info.trim() !== "") {
      const driverCheck = await pool.query(
        'INSERT INTO drivers (track_id, full_name, contact_info, driver_level) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING RETURNING id',
        [track_id, driver_name, contact_info, driver_level]
      );
    }

    // הזרקה למקצה הפעיל
    const query = `
      INSERT INTO current_heat (track_id, kart_number, driver_name, driver_level)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const result = await pool.query(query, [track_id, kart_number, driver_name, driver_level]);
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// שליפת נתוני המקצה למסכים
app.get('/live-timing/:track_id', async (req, res) => {
  try {
    const query = `
      SELECT * FROM current_heat 
      WHERE track_id = $1 
      ORDER BY best_lap_time ASC NULLS LAST 
      LIMIT 30;
    `;
    const result = await pool.query(query, [req.params.track_id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Database error' });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});