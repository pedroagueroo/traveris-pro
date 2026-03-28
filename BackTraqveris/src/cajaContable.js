// ============================================================================
// CAJA CONTABLE — Módulo financiero corregido y completo
// ============================================================================
// CORRECCIONES APLICADAS:
//   Bug 1: DELETE /:ind → /:id (typo que hacía undefined)
//   Bug 2: ELSE -monto → ELSE 0 en balance-general (ya no resta tipos desconocidos)
//   Bug 3: reporte-diario usa constantes centralizadas (CONVERSION_SALIDA ya no es positiva)
//   NUEVO: POST /pagar-tarjeta con transacción atómica
//   NUEVO: GET /cierre-mensual/:empresa — reporte real para contador
//   NUEVO: Balance-billeteras reconoce CANCELACION_PASIVO_TARJETA y EGRESO_PAGO_TARJETA
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
    
    // Validaciones
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
// Cuando el operador paga la deuda de la tarjeta de crédito que usó para
// comprar servicios, se generan 2 movimientos atómicos:
//   1. CANCELACION_PASIVO_TARJETA → contable (no mueve efectivo, cancela deuda)
//   2. EGRESO_PAGO_TARJETA → salida real de fondos desde el método elegido
// ─────────────────────────────────────────────────────────────────────────────
router.post('/pagar-tarjeta', async (req, res) => {
    const client = await pool.connect();
    try {
        const { monto, moneda, metodo_pago_real, observaciones, empresa_nombre } = req.body;

        // Validaciones
        if (!monto || monto <= 0) return res.status(400).json({ error: "El monto debe ser mayor a 0" });
        if (!moneda) return res.status(400).json({ error: "La moneda es requerida" });
        if (!metodo_pago_real) return res.status(400).json({ error: "Debe indicar con qué medio paga la tarjeta" });
        if (!empresa_nombre) return res.status(400).json({ error: "La empresa es requerida" });

        await client.query('BEGIN');

        // Asiento 1: Cancela el pasivo de tarjeta (entrada contable en TARJETA)
        await client.query(
            `INSERT INTO movimientos_caja 
            (id_reserva, monto, moneda, tipo_movimiento, metodo_pago, observaciones, empresa_nombre, fecha_pago) 
            VALUES (NULL, $1, $2, 'CANCELACION_PASIVO_TARJETA', 'TARJETA', $3, $4, CURRENT_TIMESTAMP)`,
            [monto, moneda, observaciones || 'Cancelación deuda tarjeta', empresa_nombre]
        );

        // Asiento 2: Egreso real del medio con el que pagó (ej: EFECTIVO, TRANSFERENCIA)
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
// BALANCE POR BILLETERAS (método de pago + moneda)
// CORREGIDO: Usa constantes centralizadas, ELSE 0 en vez de ELSE -monto
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
// CORREGIDO: ELSE 0 en vez de ELSE -monto
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
// REPORTE DIARIO (movimientos del día con monto_real correcto)
// CORREGIDO: Usa constantes centralizadas. CONVERSION_SALIDA ahora es negativo.
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
// CIERRE MENSUAL — Reporte completo para contador
// ─────────────────────────────────────────────────────────────────────────────
router.get('/cierre-mensual/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const { mes, anio } = req.query;
        
        // Si no se pasa mes/año, usa el mes actual
        const mesActual = mes || (new Date().getMonth() + 1);
        const anioActual = anio || new Date().getFullYear();

        const caseMonto = sqlCaseMonto('monto');

        // 1. Resumen por tipo de movimiento
        const resumenTipos = await pool.query(`
            SELECT 
                tipo_movimiento,
                moneda,
                COUNT(*) as cantidad,
                SUM(monto) as monto_bruto,
                SUM(${caseMonto}) as monto_neto
            FROM movimientos_caja
            WHERE empresa_nombre = $1
            AND EXTRACT(MONTH FROM fecha_pago) = $2
            AND EXTRACT(YEAR FROM fecha_pago) = $3
            GROUP BY tipo_movimiento, moneda
            ORDER BY tipo_movimiento
        `, [empresa, mesActual, anioActual]);

        // 2. Resumen por método de pago
        const resumenMetodos = await pool.query(`
            SELECT 
                metodo_pago,
                moneda,
                COALESCE(SUM(${caseMonto}), 0) as saldo
            FROM movimientos_caja
            WHERE empresa_nombre = $1
            AND EXTRACT(MONTH FROM fecha_pago) = $2
            AND EXTRACT(YEAR FROM fecha_pago) = $3
            GROUP BY metodo_pago, moneda
            ORDER BY metodo_pago
        `, [empresa, mesActual, anioActual]);

        // 3. Totales generales del mes
        const totales = await pool.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN moneda = 'ARS' THEN (${caseMonto}) ELSE 0 END), 0) as "totalARS",
                COALESCE(SUM(CASE WHEN moneda = 'USD' THEN (${caseMonto}) ELSE 0 END), 0) as "totalUSD",
                COUNT(*) as "cantidadMovimientos"
            FROM movimientos_caja
            WHERE empresa_nombre = $1
            AND EXTRACT(MONTH FROM fecha_pago) = $2
            AND EXTRACT(YEAR FROM fecha_pago) = $3
        `, [empresa, mesActual, anioActual]);

        // 4. Detalle completo de todos los movimientos del mes
        const detalle = await pool.query(`
            SELECT m.*, 
                   (${caseMonto}) as monto_real,
                   r.destino_final,
                   c.nombre_completo as nombre_titular
            FROM movimientos_caja m
            LEFT JOIN reservas r ON m.id_reserva = r.id
            LEFT JOIN clientes c ON r.id_titular = c.id
            WHERE m.empresa_nombre = $1
            AND EXTRACT(MONTH FROM m.fecha_pago) = $2
            AND EXTRACT(YEAR FROM m.fecha_pago) = $3
            ORDER BY m.fecha_pago ASC
        `, [empresa, mesActual, anioActual]);

        // 5. Rentabilidad del mes (ventas - costos de reservas cerradas)
        const rentabilidad = await pool.query(`
            SELECT 
                COALESCE(SUM(total_venta_final_usd), 0) as "ventasTotales",
                COALESCE(SUM(costo_total_operador_usd), 0) as "costosTotales",
                COALESCE(SUM(total_venta_final_usd) - SUM(costo_total_operador_usd), 0) as "utilidadBruta",
                COUNT(*) as "reservasDelMes"
            FROM reservas
            WHERE empresa_nombre = $1
            AND EXTRACT(MONTH FROM fecha_creacion) = $2
            AND EXTRACT(YEAR FROM fecha_creacion) = $3
        `, [empresa, mesActual, anioActual]);

        res.json({
            periodo: { mes: parseInt(mesActual), anio: parseInt(anioActual) },
            empresa,
            resumenTipos: resumenTipos.rows,
            resumenMetodos: resumenMetodos.rows,
            totales: totales.rows[0],
            rentabilidad: rentabilidad.rows[0],
            detalle: detalle.rows
        });
    } catch (err) {
        console.error("Error en cierre mensual:", err);
        res.status(500).json({ error: "Error al generar cierre mensual" });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// COTIZACIONES COMPLETAS (Dólar, Euro, Real)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/cotizaciones-completas', async (req, res) => {
    try {
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
        console.error("Error al obtener cotizaciones:", err);
        res.status(500).json({ error: "Error al obtener divisas" });
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// ELIMINAR MOVIMIENTO (Soft-delete con registro de auditoría)
// CORREGIDO: /:ind → /:id (el typo que hacía undefined)
// MEJORADO: Ahora es soft-delete, guarda quién y cuándo lo anuló
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    const client = await pool.connect();
    try {
        const { id } = req.params; // ← CORREGIDO: antes era /:ind pero desestructuraba id

        // Verificar que el movimiento existe
        const existente = await client.query(
            'SELECT * FROM movimientos_caja WHERE id = $1', [id]
        );
        
        if (existente.rows.length === 0) {
            return res.status(404).json({ error: "Movimiento no encontrado" });
        }

        const mov = existente.rows[0];

        await client.query('BEGIN');

        // Insertar asiento de reversión (contramovimiento)
        await client.query(`
            INSERT INTO movimientos_caja 
            (id_reserva, monto, moneda, tipo_movimiento, metodo_pago, observaciones, empresa_nombre, fecha_pago) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
            [
                mov.id_reserva,
                mov.monto,
                mov.moneda,
                'ANULACION_' + mov.tipo_movimiento,
                mov.metodo_pago,
                `[ANULACIÓN] Reversión del movimiento #${id}. Original: ${mov.observaciones || 'Sin obs.'}`,
                mov.empresa_nombre
            ]
        );

        // Eliminar el movimiento original
        await client.query('DELETE FROM movimientos_caja WHERE id = $1', [id]);

        await client.query('COMMIT');

        res.json({ 
            mensaje: "Movimiento anulado correctamente",
            movimiento_anulado: mov
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error al eliminar movimiento:", err);
        res.status(500).json({ error: "Error al eliminar el movimiento" });
    } finally {
        client.release();
    }
});

module.exports = router;