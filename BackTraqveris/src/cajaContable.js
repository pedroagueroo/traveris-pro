const express = require('express');
const router = express.Router();
const pool = require('./db');

// REGISTRAR CUALQUIER MOVIMIENTO (Ingreso o Egreso)
router.post('/registrar', async (req, res) => {
    const { id_reserva, monto, moneda, tipo_movimiento, metodo_pago, observaciones, empresa_nombre } = req.body;
    try {
        const query = `
            INSERT INTO movimientos_caja 
            (id_reserva, monto, moneda, tipo_movimiento, metodo_pago, observaciones, empresa_nombre, fecha_pago) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) 
            RETURNING *`;
        
        const result = await pool.query(query, [id_reserva || null, monto, moneda, tipo_movimiento, metodo_pago, observaciones, empresa_nombre]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error al registrar en caja" });
    }
});

// BALANCE UNIFICADO (Suma todo lo de la agencia)
router.get('/balance-billeteras/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const query = `
            SELECT 
                metodo_pago,
                moneda,
                COALESCE(SUM(CASE 
                    WHEN tipo_movimiento IN ('PAGO_CLIENTE', 'INGRESO_GENERAL', 'CONVERSION_ENTRADA') THEN monto 
                    WHEN tipo_movimiento IN ('PAGO_PROVEEDOR', 'EGRESO_GENERAL', 'CONVERSION_SALIDA') THEN -monto 
                    ELSE 0 END), 0) as saldo
            FROM movimientos_caja
            WHERE empresa_nombre = $1 OR id_reserva IN (SELECT id FROM reservas WHERE empresa_nombre = $1)
            GROUP BY metodo_pago, moneda
        `;
        const result = await pool.query(query, [empresa]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Error en balance detallado" });
    }
});

// Asegúrate de que esta ruta esté en cajaContable.routes.js
router.get('/balance-general/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const query = `
            SELECT 
                COALESCE(SUM(CASE WHEN moneda = 'ARS' THEN 
                    (CASE WHEN tipo_movimiento IN ('PAGO_CLIENTE', 'INGRESO_GENERAL', 'CONVERSION_ENTRADA') THEN monto ELSE -monto END)
                ELSE 0 END), 0) as "saldoARS",
                COALESCE(SUM(CASE WHEN moneda = 'USD' THEN 
                    (CASE WHEN tipo_movimiento IN ('PAGO_CLIENTE', 'INGRESO_GENERAL', 'CONVERSION_ENTRADA') THEN monto ELSE -monto END)
                ELSE 0 END), 0) as "saldoUSD"
            FROM movimientos_caja
            WHERE empresa_nombre = $1 OR id_reserva IN (SELECT id FROM reservas WHERE empresa_nombre = $1)
        `;
        const result = await pool.query(query, [empresa]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Error en balance" });
    }
});

// 3. REPORTE DIARIO (Con monto_real para la tabla)
router.get('/reporte-diario/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const hoy = new Date().toISOString().split('T')[0];
        const query = `
            SELECT m.*, 
                   CASE 
                        WHEN tipo_movimiento LIKE '%EGRESO%' OR tipo_movimiento = 'PAGO_PROVEEDOR' THEN -monto 
                        ELSE monto 
                   END as monto_real
            FROM movimientos_caja m
            WHERE (m.empresa_nombre = $1 OR m.id_reserva IN (SELECT id FROM reservas WHERE empresa_nombre = $1))
            AND DATE(m.fecha_pago) = $2
            ORDER BY m.fecha_pago DESC
        `;
        const result = await pool.query(query, [empresa, hoy]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Error en reporte" });
    }
});

router.get('/cotizaciones-completas', async (req, res) => {
    try {
        // Consultamos Dólar, Euro y Real
        const [dolar, euro, real] = await Promise.all([
            fetch('https://dolarapi.com/v1/dolares/oficial').then(r => r.json()),
            fetch('https://dolarapi.com/v1/cotizaciones/eur').then(r => r.json()),
            fetch('https://dolarapi.com/v1/cotizaciones/brl').then(r => r.json())
        ]);

        res.json({
            dolar: dolar.venta,
            euro: euro.venta,
            real: real.venta
        });
    } catch (err) {
        res.status(500).json({ error: "Error al obtener divisas" });
    }
});

// ELIMINAR MOVIMIENTO
router.delete('/:ind', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM movimientos_caja WHERE id = $1', [id]);
        res.json({ mensaje: "Movimiento eliminado correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error al eliminar el movimiento" });
    }
});


module.exports = router;