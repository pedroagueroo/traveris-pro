// ============================================================================
// AUTH ROUTES — Login con JWT real
// ============================================================================
const express = require('express');
const router = express.Router();
const pool = require('./db');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./Authmiddleware');

// RUTA DE LOGIN — Genera JWT real
router.post('/login', async (req, res) => {
    try {
        const { user, pass } = req.body;

        if (!user || !pass) {
            return res.status(400).json({ error: "Usuario y contraseña son requeridos" });
        }

        const usuarioQuery = await pool.query(
            "SELECT * FROM usuarios WHERE nombre_usuario = $1", 
            [user]
        );

        if (usuarioQuery.rows.length === 0) {
            return res.status(401).json({ error: "Usuario no encontrado" });
        }

        const usuario = usuarioQuery.rows[0];

        // Comparación de contraseña (en producción usar bcrypt.compare)
        if (usuario.password !== pass) {
            return res.status(401).json({ error: "Contraseña incorrecta" });
        }

        // Generar JWT real con expiración de 12 horas
        const token = jwt.sign(
            { 
                id: usuario.id,
                nombre_usuario: usuario.nombre_usuario,
                rol: usuario.rol,
                empresa_nombre: usuario.empresa_nombre
            },
            JWT_SECRET,
            { expiresIn: '12h' }
        );

        res.json({
            token,
            rol: usuario.rol,
            empresa_nombre: usuario.empresa_nombre,
            nombre_usuario: usuario.nombre_usuario
        });

    } catch (err) {
        console.error("Error en login:", err);
        res.status(500).json({ error: "Error en el servidor" });
    }
});

module.exports = router;