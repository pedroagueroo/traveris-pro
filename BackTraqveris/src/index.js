// ============================================================================
// INDEX.JS — Servidor principal con autenticación JWT
// ============================================================================

const express = require('express');
const cors = require('cors');
const pool = require('./db');
const { verificarToken, validarEmpresa } = require('./Authmiddleware');
const PORT = process.env.PORT || 3000;

const clientesRoutes = require('./clientes.routes');
const reservasRoutes = require('./reservas.routes');
const cajasRoutes = require('./caja.routes');
const authRoutes = require('./auth.routes');
const cajaContableRoutes = require('./cajaContable');
const importClientesRoutes = require('./importClientes.routes');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Servir archivos estáticos (uploads)
app.use('/uploads', express.static('uploads'));

// ─── RUTA PÚBLICA (sin JWT) ─────────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// ─── RUTAS PROTEGIDAS (con JWT) ─────────────────────────────────────────────
app.use('/api/clientes', verificarToken, clientesRoutes);
app.use('/api/reservas', verificarToken, reservasRoutes);
app.use('/api/caja', verificarToken, cajasRoutes);
app.use('/api/caja-contable', verificarToken, cajaContableRoutes);
app.use('/api/import-clientes', verificarToken, importClientesRoutes);

// ─── RUTA DE PRUEBA ─────────────────────────────────────────────────────────
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
    console.log(`🚀 Servidor Traveris escuchando en puerto ${PORT}`);
});

app.get('/', (req, res) => {
    res.send('Backend Traveris Pro funcionando 🚀');
});