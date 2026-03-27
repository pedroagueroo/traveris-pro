const express = require('express');
const cors = require('cors');
const pool = require('./db'); // Aquí llamamos a tu archivo de conexión
const PORT = process.env.PORT || 3000;


const clientesRoutes = require('./clientes.routes');
const reservasRoutes = require('./reservas.routes');
const cajasRoutes = require('./caja.routes')
const authRoutes = require('./auth.routes'); // Verifica que la ruta al archivo sea correcta
const cajaContableRoutes = require('./cajaContable');
const importClientesRoutes = require('./importClientes.routes'); // Importación masiva Excel
const mailer = require('./mailer');
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
// Modificá estas líneas en tu index.js de la carpeta backend
app.use('/api/clientes', clientesRoutes);    // Agregamos /api
app.use('/api/reservas', reservasRoutes);    // Agregamos /api
app.use('/api/caja', cajasRoutes);            // Agregamos /api
app.use('/api/auth', authRoutes);             // Ya lo tenía
app.use('/api/caja-contable', cajaContableRoutes); // Ya lo tenía
app.use('/api/import-clientes', importClientesRoutes); // Importación masiva desde Excel


// Esta es una ruta de prueba para ver si la base de datos responde
app.get('/probar-conexion', async (req, res) => {
  try {
    const resDB = await pool.query('SELECT NOW()');
    res.send(`¡Conexión exitosa! La hora en la base de datos es: ${resDB.rows[0].now}`);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error al conectar con la base de datos");
  }
});

app.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
});

app.get('/', (req, res) => {
  res.send('Backend funcionando 🚀');
});
