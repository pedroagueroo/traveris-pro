const { Pool } = require('pg');
require('dotenv').config(); // Esto lee el archivo .env

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Esto es vital para Render pero no para Local:
  ssl: process.env.DATABASE_URL.includes('render.com') ? { rejectUnauthorized: false } : false
});

module.exports = pool;
