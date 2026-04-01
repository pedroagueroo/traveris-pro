const express = require('express');
const router = express.Router();
const pool = require('./db');
const { obtenerCotizacionDolar } = require('./cotizacion.service');

// 1. CONVERTIR MONEDA
router.post('/convertir-moneda', async (req, res) => {
    const client = await pool.connect();
    try {
        let { id_reserva, monto_origen, moneda_origen, moneda_destino, cotizacion } = req.body;
        if (!cotizacion) {
            cotizacion = await obtenerCotizacionDolar();
            if (!cotizacion) return res.status(500).send("No se pudo obtener la cotización.");
        }
        await client.query('BEGIN');
        await client.query(
            "INSERT INTO movimientos_caja (id_reserva, monto, moneda, tipo_movimiento, fecha_pago) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)",
            [id_reserva, -monto_origen, moneda_origen, 'CONVERSION_SALIDA']
        );
        const monto_destino = (moneda_origen === 'ARS') ? (monto_origen / cotizacion) : (monto_origen * cotizacion);
        await client.query(
            "INSERT INTO movimientos_caja (id_reserva, monto, moneda, tipo_movimiento, fecha_pago) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)",
            [id_reserva, monto_destino, moneda_destino, 'CONVERSION_ENTRADA']
        );
        await client.query('COMMIT');
        res.json({ mensaje: "Conversión realizada", cotizacion_utilizada: cotizacion, monto_convertido: monto_destino });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).send("Error en la conversión");
    } finally { client.release(); }
});

// 2. OBTENER MOVIMIENTOS DE UNA RESERVA
router.get('/reserva/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            'SELECT * FROM movimientos_caja WHERE id_reserva = $1 ORDER BY fecha_pago DESC',
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener movimientos" });
    }
});

// 3. OBTENER ÚLTIMOS 5 (Dashboard filtrado)
router.get('/ultimos/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const result = await pool.query(`
            SELECT m.*, r.id as nro_legajo 
            FROM movimientos_caja m
            JOIN reservas r ON m.id_reserva = r.id
            WHERE r.empresa_nombre = $1
            ORDER BY m.id DESC LIMIT 5`, [empresa]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Error en movimientos recientes" });
    }
});

// 4. REGISTRAR PAGO (expandido con datos de tarjeta)
router.post('/', async (req, res) => {
    const { id_reserva, monto, moneda, tipo_movimiento, metodo_pago, observaciones,
            tarjeta_banco, tarjeta_cuotas, tarjeta_interes, tarjeta_monto_total,
            id_tarjeta_guardada } = req.body;
    try {
        const nuevo = await pool.query(
            `INSERT INTO movimientos_caja 
             (id_reserva, monto, moneda, tipo_movimiento, metodo_pago, observaciones,
              tarjeta_banco, tarjeta_cuotas, tarjeta_interes, tarjeta_monto_total,
              id_tarjeta_guardada, fecha_pago) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP) 
             RETURNING *`,
            [id_reserva, monto, moneda, tipo_movimiento, 
             metodo_pago || 'EFECTIVO', observaciones || null,
             tarjeta_banco || null, tarjeta_cuotas || 1, tarjeta_interes || 0, 
             tarjeta_monto_total || null, id_tarjeta_guardada || null]
        );
        res.json(nuevo.rows[0]);
    } catch (err) {
        console.error("Error al registrar pago:", err);
        res.status(500).json({ error: "Error al registrar pago" });
    }
});

// ELIMINAR MOVIMIENTO
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM movimientos_caja WHERE id = $1', [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Movimiento no encontrado" });
        }
        res.json({ mensaje: "Movimiento eliminado correctamente" });
    } catch (err) {
        console.error("Error al eliminar movimiento:", err);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});

// ============================================================
// TARJETAS GUARDADAS
// ============================================================

// Listar tarjetas de una empresa
router.get('/tarjetas/:empresa', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM tarjetas_guardadas WHERE empresa_nombre = $1 ORDER BY alias ASC',
            [req.params.empresa]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Error tarjetas:", err);
        res.status(500).json({ error: "Error al obtener tarjetas" });
    }
});

// Crear tarjeta guardada
router.post('/tarjetas', async (req, res) => {
    const { empresa_nombre, alias, ultimos_4, tipo_tarjeta, banco, vencimiento } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO tarjetas_guardadas (empresa_nombre, alias, ultimos_4, tipo_tarjeta, banco, vencimiento) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [empresa_nombre, alias, ultimos_4, tipo_tarjeta, banco, vencimiento]
        );
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error crear tarjeta:", err);
        res.status(500).json({ error: "Error al guardar tarjeta" });
    }
});

// Eliminar tarjeta guardada  
router.delete('/tarjetas/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM tarjetas_guardadas WHERE id = $1', [req.params.id]);
        res.json({ mensaje: "Tarjeta eliminada" });
    } catch (err) {
        console.error("Error eliminar tarjeta:", err);
        res.status(500).json({ error: "Error al eliminar tarjeta" });
    }
});

module.exports = router;
