const { Pool } = require('pg');
require('dotenv').config(); // Esto lee el archivo .env

const pool = new Pool({
  connectionString: "postgresql://traveris_user:jCKmw4oehBuzDlJGHeKik7Ne7s22fC5p@dpg-d6bilcur433s73d6dfp0-a.oregon-postgres.render.com:5432/traveris",
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;
