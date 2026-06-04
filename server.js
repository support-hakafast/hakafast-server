const express = require('express');
const { Pool } = require('pg');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// הגדרת חיבור ל-DB
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// בדיקת תקינות - דף הבית של ה-API
app.get('/', (req, res) => {
  res.send('HAKAFAST API is Running - High Contrast Mode Active');
});

// Endpoint: הוספת נהג למקצה (KISS Assignment)
app.post('/assign-driver', async (req, res) => {
  const { track_id, kart_number, driver_name, driver_level } = req.body;
  
  try {
    const query = `
      INSERT INTO current_heat (track_id, kart_number, driver_name, driver_level)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const values = [track_id, kart_number, driver_name, driver_level || 'Amateur'];
    const result = await pool.query(query, values);
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});

// Endpoint: שליפת נתוני המקצה למסכים (Live Timing)
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
  console.log(`Server is live on port ${port}`);
});
