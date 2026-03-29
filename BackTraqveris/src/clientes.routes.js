// ============================================================================
// CLIENTES ROUTES — Corregido con verificación de reservas en DELETE
// ============================================================================

const express = require('express');
const router = express.Router();
const pool = require('./db');
const transporter = require('./mailer');

const multer = require('multer');
const fs = require('fs');
const path = require('path');

// ─── ENVIAR SALUDO DE CUMPLEAÑOS ─────────────────────────────────────────────
router.post('/enviar-saludo-cumple', async (req, res) => {
    const { email, nombre, empresa_nombre } = req.body;
    const emailFrom = process.env.AGENCIA_EMAIL || 'noreply@agencia.com';
    const nombreAgencia = empresa_nombre || 'Tu Agencia de Viajes';

    const mailOptions = {
        from: `"${nombreAgencia}" <${emailFrom}>`,
        to: email,
        subject: `¡Feliz Cumpleaños ${nombre}! 🎂`,
        html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 500px; margin: 0 auto; text-align: center;">
                <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 12px 12px 0 0;">
                    <h1 style="color: white; margin: 0; font-size: 28px;">¡Feliz Cumpleaños!</h1>
                </div>
                <div style="background: white; padding: 30px; border: 1px solid #e0e0e0;">
                    <h2 style="color: #333;">Querido/a ${nombre},</h2>
                    <p style="color: #555; line-height: 1.6;">Desde <strong>${nombreAgencia}</strong> te deseamos un día muy especial lleno de alegría y buenos momentos.</p>
                    <p style="color: #555; line-height: 1.6;">¡Que este nuevo año te traiga muchos viajes increíbles! ✈️</p>
                </div>
                <div style="background: #f8f9fa; padding: 15px; border-radius: 0 0 12px 12px; border: 1px solid #e0e0e0; border-top: none;">
                    <p style="margin: 0; font-size: 12px; color: #888;">${nombreAgencia} — Agencia de Viajes y Turismo</p>
                </div>
            </div>`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    } catch (error) {
        console.error("Error al enviar saludo:", error);
        res.status(500).json({ error: error.message });
    }
});

// ─── RADAR DE CUMPLEAÑOS ─────────────────────────────────────────────────────
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

// ─── OBTENER CLIENTES FILTRADOS POR EMPRESA ──────────────────────────────────
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

// ─── OBTENER UN CLIENTE POR ID ───────────────────────────────────────────────
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

// ─── CREAR CLIENTE ───────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
    const c = req.body;
    
    // Validaciones
    if (!c.nombre_completo || !c.dni_pasaporte) {
        return res.status(400).json({ error: "Nombre y DNI/Pasaporte son obligatorios" });
    }

    try {
        const query = `INSERT INTO clientes 
            (nombre_completo, dni_pasaporte, email, telefono, fecha_nacimiento, 
             cuit_cuil, nacionalidad, pasaporte_nro, pasaporte_emision, pasaporte_vencimiento,
             sexo, pref_asiento, pref_comida, observaciones_salud, empresa_nombre,
             dni_emision, dni_vencimiento)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`;
        
        const values = [
            c.nombre_completo, c.dni_pasaporte, c.email || '', c.telefono || '',
            c.fecha_nacimiento || null, c.cuit_cuil || '', c.nacionalidad || 'Argentina',
            c.pasaporte_nro || '', c.pasaporte_emision || null, c.pasaporte_vencimiento || null,
            c.sexo || 'M', c.pref_asiento || 'INDIFERENTE', c.pref_comida || '',
            c.observaciones_salud || '', c.empresa_nombre,
            c.dni_emision || null, c.dni_vencimiento || null
        ];
        
        const result = await pool.query(query, values);
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error al crear cliente:", err);
        res.status(500).json({ error: err.message });
    }
});

// ─── ACTUALIZAR CLIENTE ──────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const c = req.body;
    try {
        const query = `UPDATE clientes SET 
                nombre_completo = $1, dni_pasaporte = $2, email = $3, telefono = $4, fecha_nacimiento = $5,
                cuit_cuil = $6, nacionalidad = $7, pasaporte_nro = $8, pasaporte_emision = $9, pasaporte_vencimiento = $10,
                sexo = $11, pref_asiento = $12, pref_comida = $13, observaciones_salud = $14,
                dni_emision = $15, dni_vencimiento = $16
            WHERE id = $17`;

        const values = [
            c.nombre_completo, c.dni_pasaporte, c.email || '', c.telefono || '',
            c.fecha_nacimiento || null, c.cuit_cuil || '', c.nacionalidad || 'Argentina',
            c.pasaporte_nro || '', c.pasaporte_emision || null, c.pasaporte_vencimiento || null,
            c.sexo || 'M', c.pref_asiento || 'INDIFERENTE', c.pref_comida || '',
            c.observaciones_salud || '',
            c.dni_emision || null, c.dni_vencimiento || null, id
        ];
        await pool.query(query, values);
        res.json({ message: "Actualizado con éxito" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── ELIMINAR CLIENTE ────────────────────────────────────────────────────────
// CORREGIDO: Verifica reservas activas antes de eliminar
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Verificar si tiene reservas activas como titular
        const reservasActivas = await pool.query(
            `SELECT COUNT(*) as total FROM reservas 
             WHERE id_titular = $1 AND estado IN ('ABIERTO', 'EN_CURSO')`, [id]
        );
        
        if (parseInt(reservasActivas.rows[0].total) > 0) {
            return res.status(400).json({ 
                error: `No se puede eliminar: el cliente tiene ${reservasActivas.rows[0].total} reserva(s) activa(s). Cierre las reservas primero.` 
            });
        }

        // Verificar si es pasajero en reservas activas
        const comoAcompanante = await pool.query(
            `SELECT COUNT(*) as total FROM reserva_pasajeros rp
             JOIN reservas r ON rp.id_reserva = r.id
             WHERE rp.id_cliente = $1 AND r.estado IN ('ABIERTO', 'EN_CURSO')`, [id]
        );
        
        if (parseInt(comoAcompanante.rows[0].total) > 0) {
            return res.status(400).json({ 
                error: `No se puede eliminar: el cliente es pasajero en ${comoAcompanante.rows[0].total} reserva(s) activa(s).` 
            });
        }

        await pool.query('DELETE FROM clientes WHERE id = $1', [id]);
        res.json({ message: "Eliminado" });
    } catch (err) {
        console.error("Error al eliminar cliente:", err);
        res.status(500).json({ error: "Error al eliminar" });
    }
});

// --- CONFIGURACIÓN MULTER PARA CLIENTES ---
const { createS3Uploader } = require('./s3.config');
const uploadClientes = createS3Uploader('clientes');
 
// SUBIR ARCHIVO A UN CLIENTE
router.post('/:id/subir-archivo', uploadClientes.single('archivo'), async (req, res) => {
    try {
        const { id } = req.params;
        const filename = req.file.key || req.file.filename || req.file.originalname;
        const filePath = req.file.location || req.file.path;
        const result = await pool.query(
            `INSERT INTO cliente_archivos (id_cliente, nombre_archivo, ruta_archivo, tipo_archivo) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [id, filename, filePath, req.file.mimetype]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error al subir archivo de cliente:", err);
        res.status(500).json({ error: "Error al subir archivo" });
    }
});
 
// OBTENER ARCHIVOS DE UN CLIENTE
router.get('/:id/archivos', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'SELECT * FROM cliente_archivos WHERE id_cliente = $1 ORDER BY fecha_subida DESC', [id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener archivos del cliente" });
    }
});
 
// ELIMINAR ARCHIVO DE UN CLIENTE
router.delete('/archivo/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const fileData = await pool.query('SELECT ruta_archivo FROM cliente_archivos WHERE id = $1', [id]);
        if (fileData.rows.length > 0) {
            const p = fileData.rows[0].ruta_archivo;
            if (p && !p.startsWith('http') && fs.existsSync(p)) fs.unlinkSync(p);
        }
        await pool.query('DELETE FROM cliente_archivos WHERE id = $1', [id]);
        res.json({ mensaje: "Archivo eliminado" });
    } catch (err) {
        res.status(500).json({ error: "Error al eliminar archivo" });
    }
});

module.exports = router;