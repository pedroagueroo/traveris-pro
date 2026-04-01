const { Pool } = require('pg');
require('dotenv').config({ path: 'C:\\Users\\usuario\\OneDrive\\Escritorio\\BackTraqveris\\.env' });

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT || 5432,
  ssl: {
      require: true,
      rejectUnauthorized: false
  }
});

const sql = `
-- ============================================================
-- MIGRACIÓN FASE 1: Fix editar reserva + campos nuevos
-- ============================================================

-- 1. Columnas hora_salida/hora_llegada (FIX CRÍTICO: causa error 500 al editar vuelos)
ALTER TABLE reserva_servicios_detallados 
  ADD COLUMN IF NOT EXISTS hora_salida VARCHAR(10),
  ADD COLUMN IF NOT EXISTS hora_llegada VARCHAR(10);

-- 2. Campo fecha_llegada para servicio de vuelos
ALTER TABLE reserva_servicios_detallados 
  ADD COLUMN IF NOT EXISTS fecha_llegada DATE;

-- 3. Campos operador/expediente/observaciones a nivel servicio (prep Fase 2)
ALTER TABLE reserva_servicios_detallados
  ADD COLUMN IF NOT EXISTS operador_mayorista VARCHAR(200),
  ADD COLUMN IF NOT EXISTS nro_expediente VARCHAR(100),
  ADD COLUMN IF NOT EXISTS observaciones_servicio TEXT;
`;

async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('⏳ Ejecutando migración en Neon...');
    await client.query(sql);
    console.log('✅ MIGRACIÓN EXITOSA!');
  } catch (err) {
    console.error('❌ ERROR EN MIGRACIÓN:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
