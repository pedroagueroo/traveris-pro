const express = require('express');
const router = express.Router();
const pool = require('./db');

// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

// Obtener próximo número de recibo para una empresa
async function getNextNroRecibo(client, empresa_nombre) {
    const result = await client.query(
        'SELECT COALESCE(MAX(nro_recibo), 0) + 1 as next_nro FROM recibos WHERE empresa_nombre = $1',
        [empresa_nombre]
    );
    return result.rows[0].next_nro;
}

// Detectar banco por primeros dígitos de tarjeta (BIN)
function detectarBanco(nroTarjeta) {
    if (!nroTarjeta) return null;
    const num = nroTarjeta.replace(/\s/g, '');
    const prefix = num.substring(0, 6);

    // Visa
    if (num.startsWith('4')) {
        if (prefix.startsWith('451761') || prefix.startsWith('450799')) return 'Banco Nación (Visa)';
        if (prefix.startsWith('450601') || prefix.startsWith('455002')) return 'Banco Provincia (Visa)';
        if (prefix.startsWith('427562') || prefix.startsWith('450903')) return 'Banco Galicia (Visa)';
        if (prefix.startsWith('472825') || prefix.startsWith('476507')) return 'BBVA (Visa)';
        if (prefix.startsWith('426211') || prefix.startsWith('403478')) return 'Banco Santander (Visa)';
        if (prefix.startsWith('433155') || prefix.startsWith('454267')) return 'HSBC (Visa)';
        if (prefix.startsWith('458767') || prefix.startsWith('415829')) return 'Banco Macro (Visa)';
        return 'Visa';
    }
    // Mastercard
    if (num.startsWith('5') || (parseInt(prefix) >= 222100 && parseInt(prefix) <= 272099)) {
        if (prefix.startsWith('515073') || prefix.startsWith('525547')) return 'Banco Nación (Mastercard)';
        if (prefix.startsWith('517562') || prefix.startsWith('528956')) return 'Banco Galicia (Mastercard)';
        if (prefix.startsWith('546553') || prefix.startsWith('525499')) return 'BBVA (Mastercard)';
        if (prefix.startsWith('544407') || prefix.startsWith('548510')) return 'Banco Santander (Mastercard)';
        if (prefix.startsWith('531993') || prefix.startsWith('536390')) return 'Banco Macro (Mastercard)';
        return 'Mastercard';
    }
    // American Express
    if (num.startsWith('34') || num.startsWith('37')) return 'American Express';
    // Cabal
    if (prefix.startsWith('604244') || prefix.startsWith('589657')) return 'Cabal';
    // Naranja
    if (prefix.startsWith('589562')) return 'Tarjeta Naranja';

    return 'Otro';
}

// Enmascarar número de tarjeta (guardar solo últimos 4)
function enmascararTarjeta(nro) {
    if (!nro) return null;
    const limpio = nro.replace(/\s/g, '');
    if (limpio.length < 4) return '****';
    return '**** **** **** ' + limpio.slice(-4);
}

// ============================================================
// CREAR RECIBO (Se llama después de registrar un pago)
// ============================================================
router.post('/generar', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            id_reserva, id_movimiento, empresa_nombre,
            empresa_cuit, empresa_domicilio, empresa_titular,
            monto, moneda, metodo_pago,
            tarjeta_numero, tarjeta_vencimiento, tarjeta_cuotas, tarjeta_interes,
            cliente_nombre, cliente_dni, id_cliente,
            observaciones, concepto, tipo_recibo
        } = req.body;

        // Validaciones
        if (!empresa_nombre) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'empresa_nombre es obligatorio' });
        }
        if (!monto || isNaN(Number(monto))) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'monto inválido' });
        }

        // Generar número de recibo
        const nroRecibo = await getNextNroRecibo(client, empresa_nombre);

        // Detectar banco si hay tarjeta
        const bancoDetectado = detectarBanco(tarjeta_numero);
        const tarjetaEnmascarada = enmascararTarjeta(tarjeta_numero);

        const result = await client.query(
            `INSERT INTO recibos (
                nro_recibo, id_reserva, id_movimiento, id_cliente,
                empresa_nombre, empresa_cuit, empresa_domicilio, empresa_titular,
                tipo_recibo, monto, moneda, metodo_pago,
                tarjeta_numero, tarjeta_vencimiento, tarjeta_banco, tarjeta_titular,
                tarjeta_cuotas, tarjeta_interes,
                cliente_nombre, cliente_dni,
                observaciones, concepto
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
            RETURNING *`,
            [
                nroRecibo,
                id_reserva || null,
                id_movimiento || null,
                id_cliente || null,
                empresa_nombre,
                empresa_cuit || null,
                empresa_domicilio || null,
                empresa_titular || null,
                tipo_recibo || 'RECIBO_X',
                Number(monto),
                moneda || 'USD',
                metodo_pago || 'EFECTIVO',
                tarjetaEnmascarada,
                tarjeta_vencimiento || null,
                bancoDetectado,
                null, // tarjeta_titular — no se guarda por seguridad
                parseInt(tarjeta_cuotas) || 1,
                parseFloat(tarjeta_interes) || 0,
                cliente_nombre || null,
                cliente_dni || null,
                observaciones || null,
                concepto || 'Pago de servicios turísticos'
            ]
        );

        await client.query('COMMIT');
        res.json({ success: true, recibo: result.rows[0] });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("Error al generar recibo:", e);
        res.status(500).json({ error: "Error al generar el recibo" });
    } finally {
        client.release();
    }
});

// ============================================================
// OBTENER RECIBOS POR RESERVA
// ============================================================
router.get('/reserva/:idReserva', async (req, res) => {
    try {
        const { idReserva } = req.params;
        const result = await pool.query(
            'SELECT * FROM recibos WHERE id_reserva = $1 AND anulado = FALSE ORDER BY nro_recibo DESC',
            [idReserva]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error al obtener recibos" });
    }
});

// ============================================================
// OBTENER RECIBOS POR EMPRESA (listado general)
// ============================================================
router.get('/empresa/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const result = await pool.query(
            'SELECT * FROM recibos WHERE empresa_nombre = $1 ORDER BY nro_recibo DESC LIMIT 100',
            [empresa]
        );
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error al obtener recibos" });
    }
});

// ============================================================
// OBTENER UN RECIBO POR ID (para imprimir/ver)
// ============================================================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM recibos WHERE id = $1', [id]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Recibo no encontrado" });
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener recibo" });
    }
});

// ============================================================
// ANULAR RECIBO (soft delete)
// ============================================================
router.put('/anular/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'UPDATE recibos SET anulado = TRUE, fecha_anulacion = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
            [id]
        );
        if (result.rowCount === 0) return res.status(404).json({ error: "Recibo no encontrado" });
        res.json({ success: true, recibo: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: "Error al anular recibo" });
    }
});

module.exports = router;