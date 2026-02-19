const express = require('express');
const cors = require('cors');
const pool = require('./db'); // Aquí llamamos a tu archivo de conexión
const PORT = process.env.PORT || 3000;


const clientesRoutes = require('./clientes.routes');
const reservasRoutes = require('./reservas.routes');
const cajasRoutes = require('./caja.routes')
const authRoutes = require('./auth.routes'); // Verifica que la ruta al archivo sea correcta
const cajaContableRoutes = require('./cajaContable');
const mailer = require('./mailer');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/clientes', clientesRoutes);
app.use('/reservas', reservasRoutes);
app.use('/caja',cajasRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/caja-contable', cajaContableRoutes);
app.use('/uploads', express.static('uploads'));


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
