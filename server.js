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

app.get('/api/translations', (req, res) => res.json(JSON.parse(fs.readFileSync('./translations.json'))));
app.get('/api/admin/pits', (req, res) => res.json(pitLines));
app.post('/api/admin/update-pits', (req, res) => { pitLines = req.body.newLines; res.json({success:true}); });
app.get('/api/heat-settings', (req, res) => res.json(heatSettings));
app.post('/api/admin/heat-settings', (req, res) => { heatSettings = req.body; res.json({success:true}); });

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
    result.rows.forEach((r, i) => { csv += `${i+1},${r.kart_number},"${r.driver_name}",${r.driver_level},${r.last_lap_time},${r.best_lap_time},${r.lap_count}\n`; });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.attachment('Results.csv');
    res.send(csv);
});

app.post('/assign-driver', async (req, res) => {
  let { track_id, kart_number, driver_name, driver_level, phone, email } = req.body;
  await pool.query(`INSERT INTO current_heat (track_id, kart_number, driver_name, driver_level) VALUES ($1, $2, $3, $4)`, [track_id, kart_number, driver_name, driver_level]);
  if (phone || email) {
    await pool.query(`INSERT INTO drivers (track_id, full_name, phone, email, driver_level) VALUES ($1, $2, $3, $4, $5) ON CONFLICT DO NOTHING`, [track_id, driver_name, phone, email, driver_level]);
  }
  res.status(201).json({ success: true });
});

app.get('/live-timing/:track_id', async (req, res) => {
  let order = heatSettings.type === 'sprint' ? "lap_count DESC, best_lap_time ASC" : "best_lap_time ASC NULLS LAST";
  const result = await pool.query(`SELECT * FROM current_heat WHERE track_id = $1 ORDER BY ${order} LIMIT 30`, [req.params.track_id]);
  res.json(result.rows);
});

app.post('/api/admin/clear-heat', async (req, res) => { await pool.query('DELETE FROM current_heat WHERE track_id = 1'); res.json({success:true}); });

app.listen(port, () => console.log("HAKAFAST Active"));