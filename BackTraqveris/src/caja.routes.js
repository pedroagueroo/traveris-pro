const express = require('express');
const router = express.Router();
const pool = require('./db');
const { obtenerCotizacionDolar } = require('./cotizacion.service');

// 1. CONVERTIR MONEDA (Lógica de Transacción - Mantenemos tu código)
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

// 2. OBTENER MOVIMIENTOS DE UNA RESERVA (Arregla el error 404 del detalle)
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

// 4. REGISTRAR PAGO Y ELIMINAR (Tus códigos originales)
router.post('/', async (req, res) => {
    const { id_reserva, monto, moneda, tipo_movimiento } = req.body;
    try {
        const nuevo = await pool.query('INSERT INTO movimientos_caja (id_reserva, monto, moneda, tipo_movimiento, fecha_pago) VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) RETURNING *', [id_reserva, monto, moneda, tipo_movimiento]);
        res.json(nuevo.rows[0]);
    } catch (err) { res.status(500).json({ error: "Error al registrar" }); }
});

// ELIMINAR MOVIMIENTO (Corregido)
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'DELETE FROM movimientos_caja WHERE id = $1',
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Movimiento no encontrado" });
        }

        res.json({ mensaje: "Movimiento eliminado correctamente" });
    } catch (err) {
        console.error("Error al eliminar movimiento:", err);
        res.status(500).json({ error: "Error interno del servidor" });
    }
});


module.exports = router;