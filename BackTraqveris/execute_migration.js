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
-- MIGRACIÓN FASE 3: Sistema de Pagos
-- ============================================================

-- 1. Tabla tarjetas guardadas por empresa
CREATE TABLE IF NOT EXISTS tarjetas_guardadas (
  id SERIAL PRIMARY KEY,
  empresa_nombre VARCHAR(200) NOT NULL,
  alias VARCHAR(100),
  ultimos_4 VARCHAR(4),
  tipo_tarjeta VARCHAR(50),
  banco VARCHAR(100),
  vencimiento VARCHAR(7),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Ampliar movimientos_caja con referencia a tarjeta guardada
ALTER TABLE movimientos_caja
  ADD COLUMN IF NOT EXISTS id_tarjeta_guardada INTEGER,
  ADD COLUMN IF NOT EXISTS tarjeta_cuotas INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tarjeta_interes NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tarjeta_monto_total NUMERIC(14,2);
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
