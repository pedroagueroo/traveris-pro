const express = require('express');
const router = express.Router();
const pool = require('./db');

// RUTA DE LOGIN
router.post('/login', async (req, res) => {
    const { user, pass } = req.body;
    console.log("Intento de login con:", user, pass); // <--- Esto aparecerá en tu consola negra

    try {
        const usuarioQuery = await pool.query(
            "SELECT * FROM usuarios WHERE nombre_usuario = $1", 
            [user]
        );

        if (usuarioQuery.rows.length === 0) {
            console.log("Usuario no encontrado en la DB");
            return res.status(401).json({ error: "Usuario no encontrado" });
        }

        const usuario = usuarioQuery.rows[0];
        console.log("Usuario encontrado en DB:", usuario.nombre_usuario, "Pass en DB:", usuario.password);

        if (usuario.password !== pass) {
            console.log("La contraseña no coincide");
            return res.status(401).json({ error: "Contraseña incorrecta" });
        }

        res.json({
            token: "TOKEN_PROVISORIO", 
            rol: usuario.rol,
            empresa_nombre: usuario.empresa_nombre,
            nombre_usuario: usuario.nombre_usuario
        });

    } catch (err) {
        console.error("Error grave:", err.message);
        res.status(500).json({ error: "Error en el servidor" });
    }
});

module.exports = router;