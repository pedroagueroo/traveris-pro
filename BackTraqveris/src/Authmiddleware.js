// ============================================================================
// MIDDLEWARE DE AUTENTICACIÓN JWT
// ============================================================================
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'traveris_secret_key_2026_cambiar_en_produccion';

// Middleware que verifica el token JWT en cada request
function verificarToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
        return res.status(401).json({ error: 'Token de autenticación requerido' });
    }

    const token = authHeader.split(' ')[1]; // "Bearer <token>"
    
    if (!token) {
        return res.status(401).json({ error: 'Formato de token inválido' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.usuario = decoded; // { id, nombre_usuario, rol, empresa_nombre }
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Token expirado o inválido' });
    }
}

// Middleware que valida que empresa_nombre del body/params coincida con el del token
function validarEmpresa(req, res, next) {
    const empresaToken = req.usuario?.empresa_nombre;
    const empresaReq = req.params.empresa || req.body?.empresa_nombre;
    
    if (empresaReq && empresaToken && empresaReq !== empresaToken) {
        return res.status(403).json({ error: 'No tiene permiso para acceder a datos de otra agencia' });
    }
    
    next();
}

module.exports = { verificarToken, validarEmpresa, JWT_SECRET };