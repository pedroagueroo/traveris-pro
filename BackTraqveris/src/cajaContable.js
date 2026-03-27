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

// PAGAR DEUDA DE TARJETA (doble asiento atómico)
router.post('/pagar-tarjeta', async (req, res) => {
    const { monto, nombre_tarjeta, observaciones, empresa_nombre } = req.body;

    if (!monto || monto <= 0) return res.status(400).json({ error: "Monto inválido" });
    if (!nombre_tarjeta) return res.status(400).json({ error: "Falta nombre de tarjeta" });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const obs = observaciones || `Cancelación deuda ${nombre_tarjeta}`;

        // Asiento 1: Egreso de efectivo (reduce EFECTIVO)
        await client.query(`
            INSERT INTO movimientos_caja 
            (monto, moneda, tipo_movimiento, metodo_pago, observaciones, empresa_nombre, fecha_pago)
            VALUES ($1, 'ARS', 'EGRESO_PAGO_TARJETA', 'EFECTIVO', $2, $3, NOW())
        `, [monto, obs, empresa_nombre]);

        // Asiento 2: Cancelación pasivo (reduce saldo negativo de TARJETA)
        await client.query(`
            INSERT INTO movimientos_caja 
            (monto, moneda, tipo_movimiento, metodo_pago, observaciones, empresa_nombre, fecha_pago)
            VALUES ($1, 'ARS', 'CANCELACION_PASIVO_TARJETA', $2, $3, $4, NOW())
        `, [monto, nombre_tarjeta, obs, empresa_nombre]);

        await client.query('COMMIT');
        res.json({ success: true, mensaje: `Pago de ${nombre_tarjeta} registrado por $${monto}` });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: "Error al registrar pago de tarjeta" });
    } finally {
        client.release();
    }
});

// REPORTE DE CIERRE MENSUAL
router.get('/cierre-mensual/:empresa', async (req, res) => {
    const { empresa } = req.params;
    const { mes, anio } = req.query; // Ej: ?mes=3&anio=2026

    const mesNum = parseInt(mes) || new Date().getMonth() + 1;
    const anioNum = parseInt(anio) || new Date().getFullYear();

    // Primer y último día del mes
    const desde = `${anioNum}-${String(mesNum).padStart(2, '0')}-01`;
    const hasta = new Date(anioNum, mesNum, 0).toISOString().split('T')[0]; // último día

    try {
        const [movimientos, saldos, totales] = await Promise.all([
            // Todos los movimientos del período
            pool.query(`
                SELECT m.*, r.id as nro_legajo
                FROM movimientos_caja m
                LEFT JOIN reservas r ON m.id_reserva = r.id
                WHERE (m.empresa_nombre = $1 OR m.id_reserva IN (SELECT id FROM reservas WHERE empresa_nombre = $1))
                AND DATE(m.fecha_pago) BETWEEN $2 AND $3
                ORDER BY m.fecha_pago ASC
            `, [empresa, desde, hasta]),

            // Saldos por billetera (al cierre)
            pool.query(`
                SELECT 
                    metodo_pago,
                    moneda,
                    COALESCE(SUM(CASE 
                        WHEN tipo_movimiento IN ('PAGO_CLIENTE','INGRESO_GENERAL','CONVERSION_ENTRADA','CANCELACION_PASIVO_TARJETA') THEN monto 
                        WHEN tipo_movimiento IN ('PAGO_PROVEEDOR','EGRESO_GENERAL','CONVERSION_SALIDA','EGRESO_PAGO_TARJETA') THEN -monto 
                        ELSE 0 END), 0) as saldo_al_cierre
                FROM movimientos_caja
                WHERE (empresa_nombre = $1 OR id_reserva IN (SELECT id FROM reservas WHERE empresa_nombre = $1))
                AND DATE(fecha_pago) <= $2
                GROUP BY metodo_pago, moneda
                ORDER BY moneda, metodo_pago
            `, [empresa, hasta]),

            // Totales del período
            pool.query(`
                SELECT 
                    moneda,
                    COALESCE(SUM(CASE WHEN tipo_movimiento IN ('PAGO_CLIENTE','INGRESO_GENERAL','CONVERSION_ENTRADA') THEN monto ELSE 0 END),0) as total_ingresos,
                    COALESCE(SUM(CASE WHEN tipo_movimiento IN ('PAGO_PROVEEDOR','EGRESO_GENERAL','CONVERSION_SALIDA','EGRESO_PAGO_TARJETA') THEN monto ELSE 0 END),0) as total_egresos
                FROM movimientos_caja
                WHERE (empresa_nombre = $1 OR id_reserva IN (SELECT id FROM reservas WHERE empresa_nombre = $1))
                AND DATE(fecha_pago) BETWEEN $2 AND $3
                GROUP BY moneda
            `, [empresa, desde, hasta])
        ]);

        res.json({
            empresa,
            periodo: { desde, hasta, mes: mesNum, anio: anioNum },
            movimientos: movimientos.rows,
            saldos_por_cuenta: saldos.rows,
            totales_periodo: totales.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error al generar cierre mensual" });
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