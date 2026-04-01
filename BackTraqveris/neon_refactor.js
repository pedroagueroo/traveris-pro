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

async function run() {
    const client = await pool.connect();
    try {
        console.log("Iniciando migración en NeonDB para Refactor Financiero V2...");
        
        await client.query('BEGIN');
        
        console.log("-> 1. Modificando tabla reserva_servicios_detallados");
        await client.query("ALTER TABLE reserva_servicios_detallados ADD COLUMN IF NOT EXISTS moneda_venta VARCHAR(10) DEFAULT 'USD'");
        await client.query("ALTER TABLE reserva_servicios_detallados ADD COLUMN IF NOT EXISTS moneda_costo VARCHAR(10) DEFAULT 'USD'");
        await client.query("ALTER TABLE reserva_servicios_detallados ADD COLUMN IF NOT EXISTS metodo_pago VARCHAR(50)");
        
        // Ensure the fields are numeric instead of just varchar if needed. Usually they are numeric since I added them previously.
        
        await client.query('COMMIT');
        console.log("✅ Migración ejecutada correctamente.");
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("❌ Error en la migración:", e.message);
    } finally {
        client.release();
        pool.end();
    }
}

run();
