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
-- 1. Añadir columnas a movimientos_caja para trazabilidad de pagos completa
ALTER TABLE movimientos_caja 
ADD COLUMN IF NOT EXISTS banco VARCHAR(100),
ADD COLUMN IF NOT EXISTS numero_tarjeta VARCHAR(50),
ADD COLUMN IF NOT EXISTS cuotas INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS detalle_transaccion TEXT;

-- 2. Añadir columnas a reservas para Soft Delete y Moneda Base
ALTER TABLE reservas 
ADD COLUMN IF NOT EXISTS estado_eliminado BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS moneda_pago VARCHAR(10) DEFAULT 'USD';
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
