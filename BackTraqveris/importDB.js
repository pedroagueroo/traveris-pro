const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: 'C:\\Users\\usuario\\OneDrive\\Escritorio\\BackTraqveris\\.env' });

// Connect to Neon
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

async function importSchema() {
  try {
    console.log('⏳ Conectando a Neon para inyectar esquema...');
    const client = await pool.connect();
    
    const sqlPath = "C:\\Users\\usuario\\OneDrive\\Escritorio\\esquema_agencia.sql";
    console.log(`⏳ Leyendo archivo SQL de: ${sqlPath}`);
    const sqlScript = fs.readFileSync(sqlPath, 'utf8');
    
    // El dump de pg_dump tiene una instrucción problemática para neon a veces:
    // \restrict o comandos del shell que pg falla en leer.
    // Vamos a limpiar todo lo que empiece con "\\"
    const cleanSql = sqlScript.split('\n').filter(line => !line.trim().startsWith('\\')).join('\n');

    console.log('⏳ Ejecutando Query SQL...');
    await client.query(cleanSql);
    
    console.log('✅ ESQUEMA IMPORTADO CON ÉXITO EN NEON!');
    client.release();
  } catch (err) {
    console.error('❌ ERROR CRÍTICO:', err.stack);
  } finally {
    pool.end();
  }
}

importSchema();
