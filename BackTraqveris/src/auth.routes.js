const express = require('express');
const router = express.Router();
const pool = require('./db');

// RUTA DE LOGIN
router.post('/login', async (req, res) => {
    try {
        const { user, pass } = req.body;

        console.log("👉 BODY:", req.body);
        console.log("👉 Intento de login con:", user, pass);

        // 🔎 QUERY
        const usuarioQuery = await pool.query(
            "SELECT * FROM usuarios WHERE nombre_usuario = $1", 
            [user]
        );

        console.log("👉 RESULTADO QUERY:", usuarioQuery.rows);

        if (usuarioQuery.rows.length === 0) {
            console.log("❌ Usuario no encontrado en la DB");
            return res.status(401).json({ error: "Usuario no encontrado" });
        }

        const usuario = usuarioQuery.rows[0];

        console.log("👉 Usuario encontrado:");
        console.log("   nombre_usuario:", usuario.nombre_usuario);
        console.log("   password DB:", usuario.password);
        console.log("   rol:", usuario.rol);

        // 🔐 COMPARACIÓN
        console.log("👉 Comparando:");
        console.log("   pass ingresada:", pass);
        console.log("   pass DB:", usuario.password);

        if (usuario.password !== pass) {
            console.log("❌ La contraseña no coincide");
            return res.status(401).json({ error: "Contraseña incorrecta" });
        }

        console.log("✅ LOGIN CORRECTO");

        res.json({
            token: "TOKEN_PROVISORIO", 
            rol: usuario.rol,
            empresa_nombre: usuario.empresa_nombre,
            nombre_usuario: usuario.nombre_usuario
        });

    } catch (err) {
        console.error("🔥 ERROR GRAVE LOGIN:", err);
        res.status(500).json({ error: "Error en el servidor" });
    }
});

module.exports = router;