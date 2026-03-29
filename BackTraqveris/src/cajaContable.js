// ============================================================================
// CAJA CONTABLE — Módulo financiero corregido y completo
// ============================================================================

const express = require('express');
const router = express.Router();
const pool = require('./db');
const { sqlCaseMonto, sqlCaseMontoReal } = require('./constantes');

// ─────────────────────────────────────────────────────────────────────────────
// REGISTRAR CUALQUIER MOVIMIENTO (Ingreso o Egreso)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/registrar', async (req, res) => {
    const { id_reserva, monto, moneda, tipo_movimiento, metodo_pago, observaciones, empresa_nombre } = req.body;

    if (!monto || monto <= 0) return res.status(400).json({ error: "El monto debe ser mayor a 0" });
    if (!moneda) return res.status(400).json({ error: "La moneda es requerida" });
    if (!tipo_movimiento) return res.status(400).json({ error: "El tipo de movimiento es requerido" });
    if (!empresa_nombre) return res.status(400).json({ error: "La empresa es requerida" });

    try {
        const query = `
            INSERT INTO movimientos_caja 
            (id_reserva, monto, moneda, tipo_movimiento, metodo_pago, observaciones, empresa_nombre, fecha_pago) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP) 
            RETURNING *`;

        const result = await pool.query(query, [
            id_reserva || null, monto, moneda, tipo_movimiento,
            metodo_pago || 'EFECTIVO', observaciones || '', empresa_nombre
        ]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error al registrar movimiento:", err);
        res.status(500).json({ error: "Error al registrar en caja" });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// PAGO DE DEUDA DE TARJETA — Transacción atómica (2 asientos)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/pagar-tarjeta', async (req, res) => {
    const client = await pool.connect();
    try {
        const { monto, moneda, metodo_pago_real, observaciones, empresa_nombre } = req.body;

        if (!monto || monto <= 0) return res.status(400).json({ error: "El monto debe ser mayor a 0" });
        if (!moneda) return res.status(400).json({ error: "La moneda es requerida" });
        if (!metodo_pago_real) return res.status(400).json({ error: "Debe indicar con qué medio paga la tarjeta" });
        if (!empresa_nombre) return res.status(400).json({ error: "La empresa es requerida" });

        await client.query('BEGIN');

        await client.query(
            `INSERT INTO movimientos_caja 
            (id_reserva, monto, moneda, tipo_movimiento, metodo_pago, observaciones, empresa_nombre, fecha_pago) 
            VALUES (NULL, $1, $2, 'CANCELACION_PASIVO_TARJETA', 'TARJETA', $3, $4, CURRENT_TIMESTAMP)`,
            [monto, moneda, observaciones || 'Cancelación deuda tarjeta', empresa_nombre]
        );

        await client.query(
            `INSERT INTO movimientos_caja 
            (id_reserva, monto, moneda, tipo_movimiento, metodo_pago, observaciones, empresa_nombre, fecha_pago) 
            VALUES (NULL, $1, $2, 'EGRESO_PAGO_TARJETA', $3, $4, $5, CURRENT_TIMESTAMP)`,
            [monto, moneda, metodo_pago_real, observaciones || 'Pago tarjeta con ' + metodo_pago_real, empresa_nombre]
        );

        await client.query('COMMIT');
        res.json({
            success: true,
            mensaje: `Deuda de tarjeta de ${moneda} ${monto} cancelada con ${metodo_pago_real}`
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error en pago de tarjeta:", err);
        res.status(500).json({ error: "Error al procesar el pago de tarjeta" });
    } finally {
        client.release();
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// BALANCE POR BILLETERAS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/balance-billeteras/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const caseMonto = sqlCaseMonto('monto');
        const query = `
            SELECT 
                metodo_pago,
                moneda,
                COALESCE(SUM(${caseMonto}), 0) as saldo
            FROM movimientos_caja
            WHERE empresa_nombre = $1
            GROUP BY metodo_pago, moneda
            ORDER BY metodo_pago, moneda
        `;
        const result = await pool.query(query, [empresa]);
        res.json(result.rows);
    } catch (err) {
        console.error("Error en balance billeteras:", err);
        res.status(500).json({ error: "Error en balance detallado" });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// BALANCE GENERAL (ARS + USD totales)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/balance-general/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const caseMonto = sqlCaseMonto('monto');
        const query = `
            SELECT 
                COALESCE(SUM(CASE WHEN moneda = 'ARS' THEN (${caseMonto}) ELSE 0 END), 0) as "saldoARS",
                COALESCE(SUM(CASE WHEN moneda = 'USD' THEN (${caseMonto}) ELSE 0 END), 0) as "saldoUSD"
            FROM movimientos_caja
            WHERE empresa_nombre = $1
        `;
        const result = await pool.query(query, [empresa]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error en balance general:", err);
        res.status(500).json({ error: "Error en balance" });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// REPORTE DIARIO
// ─────────────────────────────────────────────────────────────────────────────
router.get('/reporte-diario/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const hoy = new Date().toISOString().split('T')[0];
        const caseMontoReal = sqlCaseMontoReal();
        const query = `
            SELECT m.*, 
                   (${caseMontoReal}) as monto_real
            FROM movimientos_caja m
            WHERE m.empresa_nombre = $1
            AND DATE(m.fecha_pago) = $2
            ORDER BY m.fecha_pago DESC
        `;
        const result = await pool.query(query, [empresa, hoy]);
        res.json(result.rows);
    } catch (err) {
        console.error("Error en reporte diario:", err);
        res.status(500).json({ error: "Error en reporte" });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// CIERRE MENSUAL
// ─────────────────────────────────────────────────────────────────────────────
router.get('/cierre-mensual/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const { mes, anio } = req.query;

        const mesActual = mes || (new Date().getMonth() + 1);
        const anioActual = anio || new Date().getFullYear();
        const caseMonto = sqlCaseMonto('monto');

        const resumenTipos = await pool.query(`
            SELECT tipo_movimiento, moneda, COUNT(*) as cantidad,
                SUM(monto) as monto_bruto, SUM(${caseMonto}) as monto_neto
            FROM movimientos_caja
            WHERE empresa_nombre = $1 AND EXTRACT(MONTH FROM fecha_pago) = $2 AND EXTRACT(YEAR FROM fecha_pago) = $3
            GROUP BY tipo_movimiento, moneda ORDER BY tipo_movimiento
        `, [empresa, mesActual, anioActual]);

        const resumenMetodos = await pool.query(`
            SELECT metodo_pago, moneda, COALESCE(SUM(${caseMonto}), 0) as saldo
            FROM movimientos_caja
            WHERE empresa_nombre = $1 AND EXTRACT(MONTH FROM fecha_pago) = $2 AND EXTRACT(YEAR FROM fecha_pago) = $3
            GROUP BY metodo_pago, moneda ORDER BY metodo_pago
        `, [empresa, mesActual, anioActual]);

        const totales = await pool.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN moneda = 'ARS' THEN (${caseMonto}) ELSE 0 END), 0) as "totalARS",
                COALESCE(SUM(CASE WHEN moneda = 'USD' THEN (${caseMonto}) ELSE 0 END), 0) as "totalUSD",
                COUNT(*) as "cantidadMovimientos"
            FROM movimientos_caja
            WHERE empresa_nombre = $1 AND EXTRACT(MONTH FROM fecha_pago) = $2 AND EXTRACT(YEAR FROM fecha_pago) = $3
        `, [empresa, mesActual, anioActual]);

        const detalle = await pool.query(`
            SELECT m.*, (${caseMonto}) as monto_real, r.destino_final, c.nombre_completo as nombre_titular
            FROM movimientos_caja m
            LEFT JOIN reservas r ON m.id_reserva = r.id
            LEFT JOIN clientes c ON r.id_titular = c.id
            WHERE m.empresa_nombre = $1 AND EXTRACT(MONTH FROM m.fecha_pago) = $2 AND EXTRACT(YEAR FROM m.fecha_pago) = $3
            ORDER BY m.fecha_pago ASC
        `, [empresa, mesActual, anioActual]);

        const rentabilidad = await pool.query(`
            SELECT 
                COALESCE(SUM(total_venta_final_usd), 0) as "ventasTotales",
                COALESCE(SUM(costo_total_operador_usd), 0) as "costosTotales",
                COALESCE(SUM(total_venta_final_usd) - SUM(costo_total_operador_usd), 0) as "utilidadBruta",
                COUNT(*) as "reservasDelMes"
            FROM reservas WHERE empresa_nombre = $1
            AND EXTRACT(MONTH FROM fecha_creacion) = $2 AND EXTRACT(YEAR FROM fecha_creacion) = $3
        `, [empresa, mesActual, anioActual]);

        res.json({
            periodo: { mes: parseInt(mesActual), anio: parseInt(anioActual) },
            empresa, resumenTipos: resumenTipos.rows, resumenMetodos: resumenMetodos.rows,
            totales: totales.rows[0], rentabilidad: rentabilidad.rows[0], detalle: detalle.rows
        });
    } catch (err) {
        console.error("Error en cierre mensual:", err);
        res.status(500).json({ error: "Error al generar cierre mensual" });
    }
});

// PROXY: Dólar Blue para el Dashboard (evita CORS del frontend)
router.get('/dolar-blue', async (req, res) => {
    try {
        const response = await fetch('https://dolarapi.com/v1/dolares/blue');
        if (response.ok) {
            const data = await response.json();
            res.json({ compra: data.compra || 0, venta: data.venta || 0 });
        } else {
            res.json({ compra: 0, venta: 0 });
        }
    } catch (err) {
        console.warn("No se pudo obtener dólar blue:", err.message);
        res.json({ compra: 0, venta: 0 });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// COTIZACIONES COMPLETAS — CON FALLBACK ROBUSTO
// ─────────────────────────────────────────────────────────────────────────────
router.get('/cotizaciones-completas', async (req, res) => {
    try {
        const resultados = { dolar: 0, euro: 0, real: 0 };

        // Intentar obtener cada cotización independientemente
        try {
            const dolarRes = await fetch('https://dolarapi.com/v1/dolares/oficial');
            if (dolarRes.ok) {
                const dolar = await dolarRes.json();
                resultados.dolar = dolar.venta || 0;
            }
        } catch (e) { console.warn("No se pudo obtener dólar oficial"); }

        try {
            const euroRes = await fetch('https://dolarapi.com/v1/cotizaciones/eur');
            if (euroRes.ok) {
                const euro = await euroRes.json();
                resultados.euro = euro.venta || 0;
            }
        } catch (e) { console.warn("No se pudo obtener euro"); }

        try {
            const realRes = await fetch('https://dolarapi.com/v1/cotizaciones/brl');
            if (realRes.ok) {
                const real = await realRes.json();
                resultados.real = real.venta || 0;
            }
        } catch (e) { console.warn("No se pudo obtener real"); }

        res.json(resultados);
    } catch (err) {
        console.error("Error al obtener cotizaciones:", err);
        // Fallback: devolver ceros en vez de error 500
        res.json({ dolar: 0, euro: 0, real: 0 });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ELIMINAR MOVIMIENTO (Soft-delete con contramovimiento)
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params;

        const existente = await client.query('SELECT * FROM movimientos_caja WHERE id = $1', [id]);

        if (existente.rows.length === 0) {
            return res.status(404).json({ error: "Movimiento no encontrado" });
        }

        const mov = existente.rows[0];

        await client.query('BEGIN');

        await client.query(`
            INSERT INTO movimientos_caja 
            (id_reserva, monto, moneda, tipo_movimiento, metodo_pago, observaciones, empresa_nombre, fecha_pago) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
            [
                mov.id_reserva, mov.monto, mov.moneda,
                'ANULACION_' + mov.tipo_movimiento, mov.metodo_pago,
                `[ANULACIÓN] Reversión del movimiento #${id}. Original: ${mov.observaciones || 'Sin obs.'}`,
                mov.empresa_nombre
            ]
        );

        await client.query('DELETE FROM movimientos_caja WHERE id = $1', [id]);
        await client.query('COMMIT');

        res.json({ mensaje: "Movimiento anulado correctamente", movimiento_anulado: mov });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error al eliminar movimiento:", err);
        res.status(500).json({ error: "Error al eliminar el movimiento" });
    } finally {
        client.release();
    }
});

module.exports = router;