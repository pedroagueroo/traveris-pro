const { Pool } = require('pg');
require('dotenv').config();

// db.js - Versión de diagnóstico
const pool = new Pool({
  user: process.env.DB_USER,
  host: '127.0.0.1', 
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: 5432, // <--- SI EN EL PASO 1 VISTE 5433, CAMBIALO ACÁ
  ssl: false 
});

// Prueba de conexión inmediata al arrancar
pool.connect((err, client, release) => {
  if (err) {
    return console.error('❌ ERROR CRÍTICO DE CONEXIÓN A LA DB:', err.stack);
  }
  console.log('✅ CONEXIÓN EXITOSA A POSTGRESQL LOCAL (agencia_db)');
  release();
});

module.exports = pool;