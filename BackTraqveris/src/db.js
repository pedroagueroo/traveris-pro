const { Pool } = require('pg'); // Importamos la librería de Postgres
require('dotenv').config();      // Cargamos las variables del archivo .env

// Configuramos el Pool con los datos del .env
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Exportamos el pool para usarlo en otros archivos
module.exports = pool;
