const { Pool } = require('pg');

const pool = new Pool({
  connectionString: "postgresql://traveris_user:jCKmw4oehBuzDlJGHeKik7Ne7s22fC5p@dpg-d6bilcur433s73d6dfp0-a/traveris",
  ssl: { rejectUnauthorized: false }
});

module.exports = pool;