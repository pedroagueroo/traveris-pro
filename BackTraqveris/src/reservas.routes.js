const express = require('express');
const router = express.Router();
const pool = require('./db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const transporter = require('./mailer');

// ============================================================
// FUNCIONES DE SANITIZACIÓN REUTILIZABLES
// ============================================================

function sanitizeString(value) {
    if (value === undefined || value === null || value === '') return null;
    return String(value).trim();
}

function sanitizeNumber(value) {
    if (value === '' || value === null || value === undefined) return null;
    const n = Number(value);
    return isNaN(n) ? null : n;
}

function sanitizeInteger(value) {
    if (value === '' || value === null || value === undefined) return null;
    const n = parseInt(value, 10);
    return isNaN(n) ? null : n;
}

function sanitizeDate(value) {
    if (!value || value === '' || value === 'Invalid Date' || value === 'null') return null;
    // Si viene con T (ISO), tomamos solo la parte de fecha para campos date
    if (typeof value === 'string' && value.includes('T')) {
        return value.split('T')[0];
    }
    return value;
}

function sanitizeDecimal(value, fallback = 0) {
    if (value === '' || value === null || value === undefined) return fallback;
    const n = parseFloat(value);
    return isNaN(n) ? fallback : n;
}

// ============================================================
// RUTA: Enviar Documentación por Mail
// ============================================================
router.post('/:id/enviar-documento', async (req, res) => {
    try {
        const { id } = req.params;
        const { destinatario, nombreCliente, tipoDoc, destino } = req.body;

        const mailOptions = {
            from: 'Vicka Turismo <tu-email@gmail.com>',
            to: destinatario,
            subject: `📄 Tu ${tipoDoc} de viaje a ${destino} - Vicka Turismo`,
            html: `
                <div style="font-family: Arial, sans-serif; color: #333;">
                    <h2>¡Hola, ${nombreCliente}!</h2>
                    <p>Esperamos que estés muy bien. Te adjuntamos tu <b>${tipoDoc}</b> correspondiente a tu próximo viaje a <b>${destino}</b>.</p>
                    <p>Cualquier duda, estamos a tu disposición.</p>
                    <br><hr>
                    <p style="font-size: 0.8rem; color: #777;">Vicka Turismo - Agencia de Viajes y Turismo</p>
                </div>`
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "Email enviado con éxito" });
    } catch (err) {
        console.error("Error al enviar mail:", err);
        res.status(500).json({ error: "Error al enviar el correo" });
    }
});

// ============================================================
// CONFIGURACIÓN DE ARCHIVOS (MULTER)
// ============================================================
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = './uploads';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage });

router.post('/:id/subir-archivo', upload.single('archivo'), async (req, res) => {
    try {
        const { id } = req.params;
        const { filename, mimetype, path: filePath } = req.file;
        const query = `INSERT INTO reserva_archivos (id_reserva, nombre_archivo, ruta_archivo, tipo_archivo) VALUES ($1, $2, $3, $4) RETURNING *`;
        const result = await pool.query(query, [id, filename, filePath, mimetype]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error al subir archivo" });
    }
});

router.get('/:id/archivos', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('SELECT * FROM reserva_archivos WHERE id_reserva = $1', [id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener archivos" });
    }
});

router.delete('/archivo/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const fileData = await pool.query('SELECT ruta_archivo FROM reserva_archivos WHERE id = $1', [id]);
        if (fileData.rows.length > 0) {
            const p = fileData.rows[0].ruta_archivo;
            if (fs.existsSync(p)) fs.unlinkSync(p);
        }
        await pool.query('DELETE FROM reserva_archivos WHERE id = $1', [id]);
        res.json({ mensaje: "Archivo eliminado" });
    } catch (err) {
        res.status(500).json({ error: "Error al eliminar archivo" });
    }
});

// ============================================================
// DASHBOARD STATS
// ============================================================
router.get('/dashboard/stats/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const abiertas = await pool.query("SELECT COUNT(*) FROM reservas WHERE empresa_nombre = $1 AND estado = 'ABIERTO'", [empresa]);
        const cerradas = await pool.query("SELECT COUNT(*) FROM reservas WHERE empresa_nombre = $1 AND estado = 'CERRADO'", [empresa]);
        const canceladas = await pool.query("SELECT COUNT(*) FROM reservas WHERE empresa_nombre = $1 AND estado = 'CANCELADO'", [empresa]);
        res.json({
            abiertas: parseInt(abiertas.rows[0].count),
            cerradas: parseInt(cerradas.rows[0].count),
            canceladas: parseInt(canceladas.rows[0].count)
        });
    } catch (err) {
        res.status(500).json({ error: "Error al calcular stats" });
    }
});

// ============================================================
// ACTUALIZAR ESTADO
// ============================================================
router.put('/:id/estado', async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body;
    try {
        const result = await pool.query('UPDATE reservas SET estado = $1 WHERE id = $2 RETURNING *', [estado, id]);
        res.json({ mensaje: "Estado actualizado", reserva: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: "Error al cambiar estado" });
    }
});

// ============================================================
// CREAR RESERVA (POST) — CORREGIDO CON SANITIZACIÓN COMPLETA
// ============================================================
router.post('/', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            id_titular, destino_final, fecha_viaje_salida, fecha_viaje_regreso,
            cotizacion_dolar, operador_mayorista, nro_expediente_operador, empresa_nombre,
            gastos_administrativos_usd, bonificacion_descuento_usd, total_venta_final_usd,
            costo_total_operador_usd, observaciones_internas, servicios, acompaniantes,
            vuelos, fecha_limite_pago
        } = req.body;

        // --- SANITIZAR datos de la reserva principal ---
        const safeReserva = {
            id_titular:                 sanitizeInteger(id_titular),
            destino_final:              sanitizeString(destino_final),
            fecha_viaje_salida:         sanitizeDate(fecha_viaje_salida),
            fecha_viaje_regreso:        sanitizeDate(fecha_viaje_regreso),
            cotizacion_dolar:           sanitizeDecimal(cotizacion_dolar, null),
            operador_mayorista:         sanitizeString(operador_mayorista),
            nro_expediente_operador:    sanitizeString(nro_expediente_operador),
            empresa_nombre:             sanitizeString(empresa_nombre),
            gastos_administrativos_usd: sanitizeDecimal(gastos_administrativos_usd, 0),
            bonificacion_descuento_usd: sanitizeDecimal(bonificacion_descuento_usd, 0),
            total_venta_final_usd:      sanitizeDecimal(total_venta_final_usd, 0),
            costo_total_operador_usd:   sanitizeDecimal(costo_total_operador_usd, 0),
            observaciones_internas:     sanitizeString(observaciones_internas),
            fecha_limite_pago:          sanitizeDate(fecha_limite_pago)
        };

        // Validación mínima: titular obligatorio
        if (!safeReserva.id_titular) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: "El titular es obligatorio (id_titular inválido)" });
        }

        const resReserva = await client.query(
            `INSERT INTO reservas (
                id_titular, destino_final, fecha_viaje_salida, fecha_viaje_regreso,
                cotizacion_dolar, operador_mayorista, nro_expediente_operador, empresa_nombre,
                gastos_administrativos_usd, bonificacion_descuento_usd, total_venta_final_usd,
                costo_total_operador_usd, observaciones_internas, estado, fecha_limite_pago
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ABIERTO',$14) RETURNING id`,
            [
                safeReserva.id_titular,
                safeReserva.destino_final,
                safeReserva.fecha_viaje_salida,
                safeReserva.fecha_viaje_regreso,
                safeReserva.cotizacion_dolar,
                safeReserva.operador_mayorista,
                safeReserva.nro_expediente_operador,
                safeReserva.empresa_nombre,
                safeReserva.gastos_administrativos_usd,
                safeReserva.bonificacion_descuento_usd,
                safeReserva.total_venta_final_usd,
                safeReserva.costo_total_operador_usd,
                safeReserva.observaciones_internas,
                safeReserva.fecha_limite_pago
            ]
        );
        const idReserva = resReserva.rows[0].id;

        // --- INSERT servicios detallados (sanitizado) ---
        if (Array.isArray(servicios) && servicios.length > 0) {
            for (const s of servicios) {
                const d = s.detalles || {};
                await client.query(
                    `INSERT INTO reserva_servicios_detallados (
                        id_reserva, tipo_item, costo_neto_operador, venta_bruta_cliente,
                        hotel_nombre, ciudad, check_in, check_out, regimen,
                        aerolinea, nro_vuelo, origen, destino, pnr,
                        plan_asistencia, nro_poliza, cobertura_detalles,
                        pais_destino, nro_tramite, fecha_vencimiento_visa,
                        crucero_nombre, crucero_cabina, crucero_itinerario,
                        nombre_item, servicio_descripcion, excursion_fecha
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
                    [
                        idReserva,
                        sanitizeString(s.tipo_item),
                        sanitizeDecimal(s.costo_neto_operador, 0),
                        sanitizeDecimal(s.venta_bruta_cliente, 0),
                        sanitizeString(d.hotel_nombre),
                        sanitizeString(d.ciudad),
                        sanitizeDate(d.check_in),
                        sanitizeDate(d.check_out),
                        sanitizeString(d.regimen),
                        sanitizeString(d.aerolinea),
                        sanitizeString(d.nro_vuelo),
                        sanitizeString(d.origen),
                        sanitizeString(d.destino),
                        sanitizeString(d.pnr),
                        sanitizeString(d.plan),
                        sanitizeString(d.nro_poliza),
                        sanitizeString(d.cobertura),
                        sanitizeString(d.pais),
                        sanitizeString(d.nro_tramite),
                        sanitizeDate(d.fecha_vencimiento),
                        sanitizeString(d.crucero_nombre),
                        sanitizeString(d.crucero_cabina),
                        sanitizeString(d.crucero_itinerario),
                        sanitizeString(d.nombre_servicio),
                        sanitizeString(d.servicio_descripcion),
                        sanitizeDate(d.fecha)
                    ]
                );
            }
        }

        // --- INSERT acompañantes (sanitizado) ---
        if (Array.isArray(acompaniantes) && acompaniantes.length > 0) {
            for (const a of acompaniantes) {
                const idCliente = sanitizeInteger(a.id_cliente);
                if (!idCliente) continue; // Saltear acompañantes sin cliente seleccionado
                await client.query(
                    `INSERT INTO reserva_pasajeros (id_reserva, id_cliente, tipo_pasajero, es_titular) VALUES ($1, $2, $3, FALSE)`,
                    [idReserva, idCliente, sanitizeString(a.tipo_pasajero) || 'ADULTO']
                );
            }
        }

        // --- INSERT vuelos (sanitizado) ---
        if (Array.isArray(vuelos) && vuelos.length > 0) {
            for (const v of vuelos) {
                // Solo insertar si tiene al menos aerolínea o nro de vuelo
                if (!sanitizeString(v.aerolinea) && !sanitizeString(v.nro_vuelo)) continue;
                await client.query(
                    `INSERT INTO reserva_vuelos (id_reserva, aerolinea, nro_vuelo, codigo_pnr, origen_iata, destino_iata, fecha_salida) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [
                        idReserva,
                        sanitizeString(v.aerolinea),
                        sanitizeString(v.nro_vuelo),
                        sanitizeString(v.codigo_pnr),
                        sanitizeString(v.origen_iata),
                        sanitizeString(v.destino_iata),
                        sanitizeDate(v.fecha_salida)
                    ]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, id: idReserva });

    } catch (e) {
        await client.query('ROLLBACK');
        console.error("ERROR en POST /reservas:", e.message, e.detail || '');
        res.status(500).json({
            error: "Error al crear legajo",
            detalle: process.env.NODE_ENV === 'development' ? e.message : undefined
        });
    } finally {
        client.release();
    }
});

// ============================================================
// OBTENER RESERVA COMPLETA PARA EDICIÓN
// ============================================================
router.get('/completa/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const resReserva = await pool.query('SELECT * FROM reservas WHERE id = $1', [id]);
        if (resReserva.rows.length === 0) return res.status(404).json({ error: "No existe" });

        const resAcomp = await pool.query('SELECT id_cliente, tipo_pasajero FROM reserva_pasajeros WHERE id_reserva = $1', [id]);
        const resServ = await pool.query('SELECT * FROM reserva_servicios_detallados WHERE id_reserva = $1', [id]);

        const serviciosMapeados = resServ.rows.map(s => ({
            tipo_item: s.tipo_item,
            costo_neto_operador: s.costo_neto_operador,
            venta_bruta_cliente: s.venta_bruta_cliente,
            detalles: {
                hotel_nombre: s.hotel_nombre, ciudad: s.ciudad, check_in: s.check_in, check_out: s.check_out, regimen: s.regimen,
                aerolinea: s.aerolinea, nro_vuelo: s.nro_vuelo, origen: s.origen, destino: s.destino, pnr: s.pnr, fecha: s.excursion_fecha,
                plan: s.plan_asistencia, nro_poliza: s.nro_poliza, cobertura: s.cobertura_detalles,
                pais: s.pais_destino, nro_tramite: s.nro_tramite, fecha_vencimiento: s.fecha_vencimiento_visa,
                crucero_nombre: s.crucero_nombre, crucero_cabina: s.crucero_cabina, crucero_itinerario: s.crucero_itinerario,
                nombre_servicio: s.nombre_item, servicio_descripcion: s.servicio_descripcion
            }
        }));

        res.json({ reserva: resReserva.rows[0], acompaniantes: resAcomp.rows, servicios: serviciosMapeados });
    } catch (err) {
        console.error("Error en GET /completa:", err);
        res.status(500).json({ error: "Error al traer legajo completo" });
    }
});

// ============================================================
// ACTUALIZAR RESERVA (PUT) — CORREGIDO CON SANITIZACIÓN COMPLETA
// ============================================================
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const {
            id_titular, destino_final, fecha_viaje_salida, fecha_viaje_regreso,
            cotizacion_dolar, operador_mayorista, nro_expediente_operador,
            gastos_administrativos_usd, bonificacion_descuento_usd, total_venta_final_usd,
            costo_total_operador_usd, observaciones_internas, servicios, acompaniantes,
            fecha_limite_pago
        } = req.body;

        // --- SANITIZAR datos principales ---
        await client.query(
            `UPDATE reservas SET
                id_titular=$1, destino_final=$2, fecha_viaje_salida=$3, fecha_viaje_regreso=$4,
                cotizacion_dolar=$5, operador_mayorista=$6, nro_expediente_operador=$7,
                gastos_administrativos_usd=$8, bonificacion_descuento_usd=$9, total_venta_final_usd=$10,
                costo_total_operador_usd=$11, observaciones_internas=$12, fecha_limite_pago=$13
            WHERE id = $14`,
            [
                sanitizeInteger(id_titular),
                sanitizeString(destino_final),
                sanitizeDate(fecha_viaje_salida),
                sanitizeDate(fecha_viaje_regreso),
                sanitizeDecimal(cotizacion_dolar, null),
                sanitizeString(operador_mayorista),
                sanitizeString(nro_expediente_operador),
                sanitizeDecimal(gastos_administrativos_usd, 0),
                sanitizeDecimal(bonificacion_descuento_usd, 0),
                sanitizeDecimal(total_venta_final_usd, 0),
                sanitizeDecimal(costo_total_operador_usd, 0),
                sanitizeString(observaciones_internas),
                sanitizeDate(fecha_limite_pago),
                id
            ]
        );

        // --- Borrar y re-insertar pasajeros ---
        await client.query('DELETE FROM reserva_pasajeros WHERE id_reserva = $1', [id]);
        await client.query('DELETE FROM reserva_servicios_detallados WHERE id_reserva = $1', [id]);

        if (Array.isArray(acompaniantes) && acompaniantes.length > 0) {
            for (const a of acompaniantes) {
                const idCliente = sanitizeInteger(a.id_cliente);
                if (!idCliente) continue;
                await client.query(
                    'INSERT INTO reserva_pasajeros (id_reserva, id_cliente, tipo_pasajero) VALUES ($1,$2,$3)',
                    [id, idCliente, sanitizeString(a.tipo_pasajero) || 'ADULTO']
                );
            }
        }

        // --- Re-insertar servicios con TODAS las columnas ---
        if (Array.isArray(servicios) && servicios.length > 0) {
            for (const s of servicios) {
                const d = s.detalles || {};
                await client.query(
                    `INSERT INTO reserva_servicios_detallados (
                        id_reserva, tipo_item, costo_neto_operador, venta_bruta_cliente,
                        hotel_nombre, ciudad, check_in, check_out, regimen,
                        aerolinea, nro_vuelo, origen, destino, pnr,
                        plan_asistencia, nro_poliza, cobertura_detalles,
                        pais_destino, nro_tramite, fecha_vencimiento_visa,
                        crucero_nombre, crucero_cabina, crucero_itinerario,
                        nombre_item, servicio_descripcion, excursion_fecha
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
                    [
                        id,
                        sanitizeString(s.tipo_item),
                        sanitizeDecimal(s.costo_neto_operador, 0),
                        sanitizeDecimal(s.venta_bruta_cliente, 0),
                        sanitizeString(d.hotel_nombre),
                        sanitizeString(d.ciudad),
                        sanitizeDate(d.check_in),
                        sanitizeDate(d.check_out),
                        sanitizeString(d.regimen),
                        sanitizeString(d.aerolinea),
                        sanitizeString(d.nro_vuelo),
                        sanitizeString(d.origen),
                        sanitizeString(d.destino),
                        sanitizeString(d.pnr),
                        sanitizeString(d.plan),
                        sanitizeString(d.nro_poliza),
                        sanitizeString(d.cobertura),
                        sanitizeString(d.pais),
                        sanitizeString(d.nro_tramite),
                        sanitizeDate(d.fecha_vencimiento),
                        sanitizeString(d.crucero_nombre),
                        sanitizeString(d.crucero_cabina),
                        sanitizeString(d.crucero_itinerario),
                        sanitizeString(d.nombre_servicio),
                        sanitizeString(d.servicio_descripcion),
                        sanitizeDate(d.fecha)
                    ]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error("ERROR en PUT /reservas/:id:", e.message, e.detail || '');
        res.status(500).json({ error: "Error interno al actualizar" });
    } finally {
        client.release();
    }
});

// ============================================================
// ELIMINAR RESERVA
// ============================================================
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query('DELETE FROM reservas WHERE id = $1', [id]);
        if (result.rowCount === 0) return res.status(404).json({ error: "Reserva no encontrada" });
        res.json({ message: "Legajo y todos sus datos asociados eliminados correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error en el borrado automático" });
    }
});

// ============================================================
// LISTADO POR AGENCIA CON SALDO REAL
// ============================================================
router.get('/agencia/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const resultado = await pool.query(`
            SELECT r.*, c.nombre_completo as nombre_titular,
                (COALESCE(r.precio_vuelo_usd, 0) + COALESCE(r.precio_hotel_usd, 0) + COALESCE(r.precio_excursiones_usd, 0) + COALESCE(r.precio_otros_servicios_usd, 0) + COALESCE(r.gastos_administrativos_usd, 0) - COALESCE(r.bonificacion_descuento_usd, 0) - COALESCE((SELECT SUM(monto) FROM movimientos_caja WHERE id_reserva = r.id AND moneda = 'USD' AND tipo_movimiento = 'PAGO_CLIENTE'), 0) + COALESCE((SELECT SUM(monto) FROM movimientos_caja WHERE id_reserva = r.id AND moneda = 'USD' AND tipo_movimiento = 'PAGO_PROVEEDOR'), 0)
                ) as saldo_real
            FROM reservas r JOIN clientes c ON r.id_titular = c.id WHERE r.empresa_nombre = $1 ORDER BY r.id DESC`, [empresa]);
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener saldos" });
    }
});

// ============================================================
// OBTENER RESERVA POR ID
// ============================================================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const reserva = await pool.query(`SELECT r.*, c.nombre_completo as nombre_titular, c.dni_pasaporte as dni_titular, c.email as email_titular FROM reservas r JOIN clientes c ON r.id_titular = c.id WHERE r.id = $1`, [id]);
        if (reserva.rows.length === 0) return res.status(404).json({ error: "No existe el legajo" });

        const pasajeros = await pool.query(`SELECT rp.*, c.nombre_completo, c.dni_pasaporte FROM reserva_pasajeros rp JOIN clientes c ON rp.id_cliente = c.id WHERE rp.id_reserva = $1`, [id]);
        const servicios = await pool.query(`SELECT * FROM reserva_servicios_detallados WHERE id_reserva = $1`, [id]);

        const data = reserva.rows[0];
        data.pasajeros = pasajeros.rows;
        data.servicios_items = servicios.rows;

        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error al obtener legajo" });
    }
});

// ============================================================
// RESERVAS POR CLIENTE
// ============================================================
router.get('/cliente/:idCliente', async (req, res) => {
    try {
        const { idCliente } = req.params;
        const resultado = await pool.query(`
            SELECT r.*, c.nombre_completo as nombre_titular
            FROM reservas r JOIN clientes c ON r.id_titular = c.id
            WHERE r.id_titular = $1 ORDER BY r.id DESC`, [idCliente]);
        res.json(resultado.rows);
    } catch (err) {
        res.status(500).json({ error: "Error al buscar reservas del cliente" });
    }
});

// ============================================================
// RADAR DE VENCIMIENTOS (BLINDADO)
// ============================================================
router.get('/radar/vencimientos/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const query = `
            SELECT r.id, r.destino_final, r.fecha_viaje_salida, r.total_venta_final_usd,
                   COALESCE(r.fecha_limite_pago, r.fecha_viaje_salida - INTERVAL '30 days') as fecha_limite_pago,
                   c.nombre_completo as titular,
                   (COALESCE(r.total_venta_final_usd, 0) - 
                    COALESCE((SELECT SUM(monto) FROM movimientos_caja WHERE id_reserva = r.id AND tipo_movimiento = 'PAGO_CLIENTE'), 0)
                   ) as saldo_pendiente
            FROM reservas r
            JOIN clientes c ON r.id_titular = c.id
            WHERE r.empresa_nombre = $1 
            AND r.estado = 'ABIERTO'
            AND COALESCE(r.fecha_limite_pago, r.fecha_viaje_salida - INTERVAL '30 days') <= CURRENT_DATE
            AND (COALESCE(r.total_venta_final_usd, 0) - 
                 COALESCE((SELECT SUM(monto) FROM movimientos_caja WHERE id_reserva = r.id AND tipo_movimiento = 'PAGO_CLIENTE'), 0)
                ) > 0.01
            ORDER BY fecha_limite_pago ASC
        `;
        const result = await pool.query(query, [empresa]);
        res.json(result.rows);
    } catch (err) {
        console.error("ERROR RADAR:", err);
        res.status(500).json({ error: "Error en el radar" });
    }
});

module.exports = router;