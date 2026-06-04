const { Client } = require('pg');

// חיבור ל-Database באמצעות ה-URL מ-Render
const connectionString = process.env.DATABASE_URL;

const client = new Client({
  connectionString: connectionString,
  ssl: { rejectUnauthorized: false } // נדרש בחיבור ל-Render
});

async function initDB() {
  try {
    await client.connect();
    console.log("Connected to HAKAFAST DB successfully!");

    // יצירת טבלאות (SQL שכתבנו קודם)
    const createTablesQuery = `
      CREATE TABLE IF NOT EXISTS tracks (
          id SERIAL PRIMARY KEY,
          track_name VARCHAR(100) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS drivers (
          id SERIAL PRIMARY KEY,
          track_id INT REFERENCES tracks(id) ON DELETE CASCADE,
          full_name VARCHAR(100) NOT NULL,
          contact_info VARCHAR(100),
          driver_level VARCHAR(20) DEFAULT 'Amateur',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS current_heat (
          id SERIAL PRIMARY KEY,
          track_id INT REFERENCES tracks(id) ON DELETE CASCADE,
          kart_number INT NOT NULL,
          driver_name VARCHAR(100) NOT NULL,
          driver_level VARCHAR(20) DEFAULT 'Amateur',
          last_lap_time NUMERIC(6, 3),
          best_lap_time NUMERIC(6, 3),
          second_best_time NUMERIC(6, 3),
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await client.query(createTablesQuery);
    console.log("Tables are ready!");
    
  } catch (err) {
    console.error("Error initializing DB:", err);
  } finally {
    await client.end();
  }
}

initDB();
