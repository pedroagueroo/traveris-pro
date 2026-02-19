const express = require('express');
const router = express.Router();
const pool = require('./db');
const transporter = require('./mailer'); // 👈 ESTA ES LA LÍNEA QUE FALTA

router.post('/enviar-saludo-cumple', async (req, res) => {
    const { email, nombre } = req.body;

    const mailOptions = {
        from: '"Vicka Turismo" <tu-email@gmail.com>',
        to: email,
        subject: `🎂 ¡Feliz Cumpleaños ${nombre}!`,
        html: `<h1>¡Felicitaciones!</h1><p>Desde Vicka Turismo te deseamos lo mejor.</p>`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    } catch (error) {
        console.log("ERROR NODEMAILER:", error); // Esto te dirá por qué no sale el mail
        res.status(500).json({ error: error.message });
    }
});

router.get('/radar/cumpleanios/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const query = `
            SELECT nombre_completo, email, fecha_nacimiento 
            FROM clientes 
            WHERE empresa_nombre = $1 
            AND EXTRACT(MONTH FROM fecha_nacimiento) = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(DAY FROM fecha_nacimiento) = EXTRACT(DAY FROM CURRENT_DATE)
        `;
        const result = await pool.query(query, [empresa]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Error en radar de cumple" });
    }
});

// 1. OBTENER CLIENTES FILTRADOS POR EMPRESA
router.get('/agencia/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const todosClientes = await pool.query(
            "SELECT * FROM clientes WHERE empresa_nombre = $1 ORDER BY id DESC",
            [empresa]
        );
        res.json(todosClientes.rows);
    } catch (err) {
        res.status(500).json({ error: "Error al traer la lista" });
    }
});

// 2. OBTENER UN CLIENTE POR ID
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const cliente = await pool.query("SELECT * FROM clientes WHERE id = $1", [id]);
        if (cliente.rows.length === 0) return res.status(404).json({ error: "No existe el cliente" });
        res.json(cliente.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Error de servidor" });
    }
});

// 3. REGISTRAR NUEVO CLIENTE (Actualizado con DNI fechas)
router.post('/', async (req, res) => {
    const c = req.body;
    try {
        const query = `INSERT INTO clientes (
            nombre_completo, dni_pasaporte, email, telefono, fecha_nacimiento,
            cuit_cuil, nacionalidad, pasaporte_nro, pasaporte_emision, pasaporte_vencimiento,
            sexo, pref_asiento, pref_comida, observaciones_salud, empresa_nombre,
            dni_emision, dni_vencimiento -- NUEVOS CAMPOS
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17) RETURNING *`;

        const values = [
            c.nombre_completo || '', c.dni_pasaporte || '', c.email || '', c.telefono || '',
            c.fecha_nacimiento || null, c.cuit_cuil || '', c.nacionalidad || 'Argentina',
            c.pasaporte_nro || '', c.pasaporte_emision || null, c.pasaporte_vencimiento || null,
            c.sexo || 'M', c.pref_asiento || 'INDIFERENTE', c.pref_comida || '',
            c.observaciones_salud || '',
            c.empresa_nombre, // <--- Faltaba esta coma si la línea de abajo existe
            c.dni_emision || null,
            c.dni_vencimiento || null // // VALORES NUEVOS (Comentario corregido)
        ];
        const nuevoCliente = await pool.query(query, values);
        res.status(201).json(nuevoCliente.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. ACTUALIZAR CLIENTE (Actualizado con DNI fechas)
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const c = req.body;
    try {
        const query = `UPDATE clientes SET 
                nombre_completo = $1, dni_pasaporte = $2, email = $3, telefono = $4, fecha_nacimiento = $5,
                cuit_cuil = $6, nacionalidad = $7, pasaporte_nro = $8, pasaporte_emision = $9, pasaporte_vencimiento = $10,
                sexo = $11, pref_asiento = $12, pref_comida = $13, observaciones_salud = $14,
                dni_emision = $15, dni_vencimiento = $16 -- NUEVOS CAMPOS
            WHERE id = $17`;

        const values = [
            c.nombre_completo, c.dni_pasaporte, c.email || '', c.telefono || '',
            c.fecha_nacimiento || null, c.cuit_cuil || '', c.nacionalidad || 'Argentina',
            c.pasaporte_nro || '', c.pasaporte_emision || null, c.pasaporte_vencimiento || null,
            c.sexo || 'M', c.pref_asiento || 'INDIFERENTE', c.pref_comida || '',
            c.observaciones_salud || '',
            c.dni_emision || null, c.dni_vencimiento || null, id // VALORES NUEVOS
        ];
        await pool.query(query, values);
        res.json({ message: "Actualizado con éxito" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. ELIMINAR CLIENTE
router.delete('/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM clientes WHERE id = $1', [req.params.id]);
        res.json({ message: "Eliminado" });
    } catch (err) {
        res.status(500).json({ error: "Error al eliminar" });
    }
});

module.exports = router;