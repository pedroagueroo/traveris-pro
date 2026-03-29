// ============================================================================
// INDEX.JS — Servidor principal con autenticación JWT
// ============================================================================
// CORRECCIÓN CRÍTICA: La ruta /cotizaciones-completas debe ser accesible
// sin JWT porque es datos públicos (cotización del dólar) y el dashboard
// la necesita inmediatamente al cargar.
// ============================================================================

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const pool = require('./db');
const { verificarToken, validarEmpresa } = require('./Authmiddleware');
const PORT = process.env.PORT || 3000;

const clientesRoutes = require('./clientes.routes');
const reservasRoutes = require('./reservas.routes');
const cajasRoutes = require('./caja.routes');
const authRoutes = require('./auth.routes');
const cajaContableRoutes = require('./cajaContable');
const importClientesRoutes = require('./importClientes.routes');
const recibosRoutes = require('./recibos.routes');

const app = express();

// 1. Añadimos cabeceras de seguridad
app.use(helmet()); 
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));

// 2. CORS bien configurado
const dominiosPermitidos = [
    process.env.FRONTEND_URL || 'https://traveris-pro.vercel.app', // Asegurarse de poner la URL de Vercel en la variable de entorno
    'http://localhost:4200'
];

const corsOptions = {
    origin: function (origin, callback) {
        if (!origin || dominiosPermitidos.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('No permitido por CORS'));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// 3. Rate Limit Básico para no saturar el servidor
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 1000, // Máximo de 1000 peticiones desde 1 IP cada 15 min.
    message: 'Límite de peticiones alcanzado.',
    standardHeaders: true, 
    legacyHeaders: false, 
});
app.use('/api', limiter);

// Limitador SUPER estricto para el Endpoint de Login (Fuerza Bruta)
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 10,  // Cierra si hay 10 intentos fallidos/exitosos por IP
    message: 'Demasiados intentos de inicio de sesión. Cuenta bloqueada temporalmente.',
    standardHeaders: true,
    legacyHeaders: false,
});
app.use('/api/auth/login', loginLimiter);

app.use(express.json({ limit: '10mb' }));

// Servir archivos estáticos (uploads)
app.use('/uploads', express.static('uploads'));

// ─── RUTAS PÚBLICAS (sin JWT) ───────────────────────────────────────────────
app.use('/api/auth', authRoutes);

// Cotizaciones es pública porque es solo lectura de datos públicos de API externa
// y el dashboard la necesita antes de que el interceptor pueda adjuntar el token
app.get('/api/caja-contable/cotizaciones-completas', (req, res, next) => {
    // Redirigir al handler del router de cajaContable
    req.url = '/cotizaciones-completas';
    cajaContableRoutes(req, res, next);
});

// ─── RUTAS PROTEGIDAS (con JWT) ─────────────────────────────────────────────
app.use('/api/clientes', verificarToken, clientesRoutes);
app.use('/api/reservas', verificarToken, reservasRoutes);
app.use('/api/caja', verificarToken, cajasRoutes);
app.use('/api/caja-contable', verificarToken, cajaContableRoutes);
app.use('/api/import-clientes', verificarToken, importClientesRoutes);

app.use('/api/recibos', recibosRoutes);

app.use('/api/uploads', express.static('uploads'));


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

app.get('/', (req, res) => {
    res.send('Backend Traveris Pro funcionando 🚀');
});

// ─── MANEJADORES GLOBALES DE ERRORES (Anti-Caídas Silenciosas) ──────────────
app.use((err, req, res, next) => {
    console.error('❌ Error general interceptado:', err.stack);
    res.status(500).json({ 
        error: "Error interno del servidor",
        mensaje: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

process.on('uncaughtException', (err) => {
    console.error('🔥 CRÍTICO - Excepción no capturada:', err);
    // En arquitecturas muy estrictas, aquí se hace un process.exit(1),
    // pero para evitar downtime inmediato, solo logueamos.
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 CRÍTICO - Promesa rechazada no manejada:', reason);
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor Traveris escuchando en puerto ${PORT}`);
});