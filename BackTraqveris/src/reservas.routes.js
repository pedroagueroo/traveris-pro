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
// RUTA: Enviar Documentación por Mail (Voucher / Cotización + Archivos)
// ============================================================
router.post('/:id/enviar-documento', async (req, res) => {
    try {
        const { id } = req.params;
        const { destinatario, nombreCliente, tipoDoc, destino, adjuntarArchivos } = req.body;

        if (!destinatario) {
            return res.status(400).json({ error: "El destinatario es obligatorio" });
        }

        // 1. Obtener datos completos de la reserva
        const resReserva = await pool.query(
            `SELECT r.*, c.nombre_completo as nombre_titular, c.dni_pasaporte as dni_titular, c.email as email_titular
             FROM reservas r JOIN clientes c ON r.id_titular = c.id WHERE r.id = $1`, [id]
        );
        if (resReserva.rows.length === 0) {
            return res.status(404).json({ error: "Reserva no encontrada" });
        }
        const reserva = resReserva.rows[0];

        // 2. Obtener servicios detallados
        const resServicios = await pool.query(
            'SELECT * FROM reserva_servicios_detallados WHERE id_reserva = $1', [id]
        );
        const servicios = resServicios.rows;

        // 3. Obtener pasajeros
        const resPasajeros = await pool.query(
            `SELECT rp.*, c.nombre_completo, c.dni_pasaporte 
             FROM reserva_pasajeros rp JOIN clientes c ON rp.id_cliente = c.id 
             WHERE rp.id_reserva = $1`, [id]
        );
        const pasajeros = resPasajeros.rows;

        // 4. Generar HTML según tipo de documento
        let htmlContent = '';
        const empresaNombre = reserva.empresa_nombre || 'Agencia de Viajes';

        if (tipoDoc === 'VOUCHER') {
            htmlContent = generarHTMLVoucher(reserva, servicios, pasajeros, empresaNombre);
        } else {
            htmlContent = generarHTMLCotizacion(reserva, servicios, empresaNombre);
        }

        // 5. Preparar archivos adjuntos (si se solicitaron)
        let attachments = [];
        if (adjuntarArchivos) {
            const resArchivos = await pool.query(
                'SELECT * FROM reserva_archivos WHERE id_reserva = $1', [id]
            );
            for (const arch of resArchivos.rows) {
                const filePath = arch.ruta_archivo;
                if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
                    // Nodemailer soporta URLs de S3
                    attachments.push({
                        filename: arch.nombre_archivo || 'archivo',
                        path: filePath
                    });
                } else if (fs.existsSync(filePath)) {
                    attachments.push({
                        filename: arch.nombre_archivo,
                        path: filePath
                    });
                }
            }
        }

        // 6. Enviar el mail
        const mailOptions = {
            from: `"${empresaNombre}" <aguerop47@gmail.com>`,
            to: destinatario,
            subject: `${tipoDoc === 'VOUCHER' ? '🎫 Voucher' : '💰 Cotización'} de viaje a ${destino || reserva.destino_final} — ${empresaNombre}`,
            html: htmlContent,
            attachments: attachments
        };

        await transporter.sendMail(mailOptions);
        res.json({ success: true, message: "Email enviado con éxito", archivosAdjuntos: attachments.length });

    } catch (err) {
        console.error("Error al enviar mail:", err);
        res.status(500).json({ error: "Error al enviar el correo: " + err.message });
    }
});

// ============================================================
// CONFIGURACIÓN DE ARCHIVOS (MULTER CON S3)
// ============================================================
const { createS3Uploader } = require('./s3.config');
const upload = createS3Uploader('reservas');

router.post('/:id/subir-archivo', upload.single('archivo'), async (req, res) => {
    try {
        const { id } = req.params;
        const filename = req.file.key || req.file.filename || req.file.originalname;
        const filePath = req.file.location || req.file.path; // location para S3, path para local
        const query = `INSERT INTO reserva_archivos (id_reserva, nombre_archivo, ruta_archivo, tipo_archivo) VALUES ($1, $2, $3, $4) RETURNING *`;
        const result = await pool.query(query, [id, filename, filePath, req.file.mimetype]);
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
            if (p && !p.startsWith('http') && fs.existsSync(p)) fs.unlinkSync(p);
            // Si es S3 (p.startsWith('http')), solo borramos el registro de la DB por simplicidad,
            // ya que en S3 se puede configurar ciclo de vida u organizar borrado diferido.
        }
        await pool.query('DELETE FROM reserva_archivos WHERE id = $1', [id]);
        res.json({ mensaje: "Archivo eliminado" });
    } catch (err) {
        res.status(500).json({ error: "Error al eliminar archivo" });
    }
});

// ============================================================
// DASHBOARD STATS (corregido: devuelve los campos que usa el HTML)
// ============================================================
router.get('/dashboard/stats/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;

        const query = `
            SELECT 
                COALESCE(SUM(total_venta_final_usd) - 
                    COALESCE((SELECT SUM(monto) FROM movimientos_caja mc 
                        WHERE mc.tipo_movimiento = 'PAGO_CLIENTE' 
                        AND mc.id_reserva IN (SELECT id FROM reservas WHERE empresa_nombre = $1)
                    ), 0)
                , 0) as "saldoPendienteGlobal",
                
                COALESCE(SUM(costo_total_operador_usd) - 
                    COALESCE((SELECT SUM(monto) FROM movimientos_caja mc 
                        WHERE mc.tipo_movimiento = 'PAGO_PROVEEDOR' 
                        AND mc.id_reserva IN (SELECT id FROM reservas WHERE empresa_nombre = $1)
                    ), 0)
                , 0) as "deudaProveedoresGlobal",
                
                COUNT(*) FILTER (WHERE estado = 'ABIERTO') as "legajosActivos",
                COUNT(*) as "totalLegajos"
            FROM reservas 
            WHERE empresa_nombre = $1
        `;

        const result = await pool.query(query, [empresa]);
        res.json(result.rows[0]);
    } catch (err) {
        console.error("Error en dashboard stats:", err);
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
            id_titular: sanitizeInteger(id_titular),
            destino_final: sanitizeString(destino_final),
            fecha_viaje_salida: sanitizeDate(fecha_viaje_salida),
            fecha_viaje_regreso: sanitizeDate(fecha_viaje_regreso),
            cotizacion_dolar: sanitizeDecimal(cotizacion_dolar, null),
            operador_mayorista: sanitizeString(operador_mayorista),
            nro_expediente_operador: sanitizeString(nro_expediente_operador),
            empresa_nombre: sanitizeString(empresa_nombre),
            gastos_administrativos_usd: sanitizeDecimal(gastos_administrativos_usd, 0),
            bonificacion_descuento_usd: sanitizeDecimal(bonificacion_descuento_usd, 0),
            total_venta_final_usd: sanitizeDecimal(total_venta_final_usd, 0),
            costo_total_operador_usd: sanitizeDecimal(costo_total_operador_usd, 0),
            observaciones_internas: sanitizeString(observaciones_internas),
            fecha_limite_pago: sanitizeDate(fecha_limite_pago)
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
                        nombre_item, servicio_descripcion, excursion_fecha,
                        hora_salida, hora_llegada
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
                    [
                        idReserva_o_id,                    // $1  - id de reserva
                        sanitizeString(s.tipo_item),       // $2
                        sanitizeDecimal(s.costo_neto_operador, 0), // $3
                        sanitizeDecimal(s.venta_bruta_cliente, 0),  // $4
                        sanitizeString(d.hotel_nombre),    // $5
                        sanitizeString(d.ciudad),          // $6
                        sanitizeDate(d.check_in),          // $7
                        sanitizeDate(d.check_out),         // $8
                        sanitizeString(d.regimen),         // $9
                        sanitizeString(d.aerolinea),       // $10
                        sanitizeString(d.nro_vuelo),       // $11
                        sanitizeString(d.origen),          // $12
                        sanitizeString(d.destino),         // $13
                        sanitizeString(d.pnr),             // $14
                        sanitizeString(d.plan),            // $15
                        sanitizeString(d.nro_poliza),      // $16
                        sanitizeString(d.cobertura),       // $17
                        sanitizeString(d.pais),            // $18
                        sanitizeString(d.nro_tramite),     // $19
                        sanitizeDate(d.fecha_vencimiento), // $20
                        sanitizeString(d.crucero_nombre),  // $21
                        sanitizeString(d.crucero_cabina),  // $22
                        sanitizeString(d.crucero_itinerario), // $23
                        sanitizeString(d.nombre_servicio), // $24
                        sanitizeString(d.servicio_descripcion), // $25
                        sanitizeDate(d.fecha),             // $26
                        sanitizeString(d.hora_salida),     // $27 ← NUEVO
                        sanitizeString(d.hora_llegada)     // $28 ← NUEVO
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
                nombre_servicio: s.nombre_item, servicio_descripcion: s.servicio_descripcion, hora_salida: s.hora_salida,
                hora_llegada: s.hora_llegada
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
                        nombre_item, servicio_descripcion, excursion_fecha,
                        hora_salida, hora_llegada
                    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
                    [
                        idReserva_o_id,                    // $1  - id de reserva
                        sanitizeString(s.tipo_item),       // $2
                        sanitizeDecimal(s.costo_neto_operador, 0), // $3
                        sanitizeDecimal(s.venta_bruta_cliente, 0),  // $4
                        sanitizeString(d.hotel_nombre),    // $5
                        sanitizeString(d.ciudad),          // $6
                        sanitizeDate(d.check_in),          // $7
                        sanitizeDate(d.check_out),         // $8
                        sanitizeString(d.regimen),         // $9
                        sanitizeString(d.aerolinea),       // $10
                        sanitizeString(d.nro_vuelo),       // $11
                        sanitizeString(d.origen),          // $12
                        sanitizeString(d.destino),         // $13
                        sanitizeString(d.pnr),             // $14
                        sanitizeString(d.plan),            // $15
                        sanitizeString(d.nro_poliza),      // $16
                        sanitizeString(d.cobertura),       // $17
                        sanitizeString(d.pais),            // $18
                        sanitizeString(d.nro_tramite),     // $19
                        sanitizeDate(d.fecha_vencimiento), // $20
                        sanitizeString(d.crucero_nombre),  // $21
                        sanitizeString(d.crucero_cabina),  // $22
                        sanitizeString(d.crucero_itinerario), // $23
                        sanitizeString(d.nombre_servicio), // $24
                        sanitizeString(d.servicio_descripcion), // $25
                        sanitizeDate(d.fecha),             // $26
                        sanitizeString(d.hora_salida),     // $27 ← NUEVO
                        sanitizeString(d.hora_llegada)     // $28 ← NUEVO
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

function generarHTMLVoucher(reserva, servicios, pasajeros, empresaNombre) {
    const fechaSalida = reserva.fecha_viaje_salida ? new Date(reserva.fecha_viaje_salida).toLocaleDateString('es-AR') : 'A confirmar';
    const fechaRegreso = reserva.fecha_viaje_regreso ? new Date(reserva.fecha_viaje_regreso).toLocaleDateString('es-AR') : 'A confirmar';

    let serviciosHTML = '';
    for (const s of servicios) {
        const nombre = s.hotel_nombre || s.aerolinea || s.crucero_nombre || s.nombre_item || 'Servicio';
        const detalles = [];
        if (s.ciudad) detalles.push(`Ciudad: ${s.ciudad}`);
        if (s.check_in) detalles.push(`Check-in: ${new Date(s.check_in).toLocaleDateString('es-AR')}`);
        if (s.check_out) detalles.push(`Check-out: ${new Date(s.check_out).toLocaleDateString('es-AR')}`);
        if (s.origen && s.destino) detalles.push(`Ruta: ${s.origen} → ${s.destino}`);
        if (s.nro_vuelo) detalles.push(`Vuelo: ${s.nro_vuelo}`);
        if (s.pnr) detalles.push(`PNR: ${s.pnr}`);
        if (s.regimen) detalles.push(`Régimen: ${s.regimen}`);
        if (s.plan_asistencia) detalles.push(`Plan: ${s.plan_asistencia}`);
        if (s.nro_poliza) detalles.push(`Póliza: ${s.nro_poliza}`);
        if (s.servicio_descripcion) detalles.push(s.servicio_descripcion);

        serviciosHTML += `
            <tr>
                <td style="padding: 12px; border-bottom: 1px solid #eee;">
                    <strong style="color: #2563eb;">${s.tipo_item}</strong>
                </td>
                <td style="padding: 12px; border-bottom: 1px solid #eee;">
                    <strong>${nombre}</strong><br>
                    <span style="color: #666; font-size: 13px;">${detalles.join(' · ')}</span>
                </td>
            </tr>`;
    }

    let pasajerosHTML = '';
    if (pasajeros.length > 0) {
        pasajerosHTML = `
            <h3 style="color: #1e293b; margin-top: 30px;">Manifiesto de Pasajeros</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                <tr style="background: #f1f5f9;">
                    <th style="padding: 10px; text-align: left; font-size: 12px; text-transform: uppercase;">Nombre</th>
                    <th style="padding: 10px; text-align: left; font-size: 12px; text-transform: uppercase;">DNI/Pasaporte</th>
                    <th style="padding: 10px; text-align: left; font-size: 12px; text-transform: uppercase;">Tipo</th>
                </tr>
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${reserva.nombre_titular}</strong></td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${reserva.dni_titular || '-'}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">TITULAR</td>
                </tr>
                ${pasajeros.map(p => `
                <tr>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${p.nombre_completo}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${p.dni_pasaporte || '-'}</td>
                    <td style="padding: 8px; border-bottom: 1px solid #eee;">${p.tipo_pasajero || 'ADULTO'}</td>
                </tr>`).join('')}
            </table>`;
    }

    return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #fff;">
        <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${empresaNombre}</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0; font-size: 14px;">Voucher de Servicios Confirmados</p>
        </div>
        <div style="padding: 30px;">
            <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 25px; border: 1px solid #e2e8f0;">
                <table style="width: 100%;">
                    <tr>
                        <td><strong>Pasajero:</strong> ${reserva.nombre_titular}</td>
                        <td style="text-align: right;"><strong>Legajo:</strong> #${reserva.id}</td>
                    </tr>
                    <tr>
                        <td><strong>Destino:</strong> ${reserva.destino_final || '-'}</td>
                        <td style="text-align: right;"><strong>Operador:</strong> ${reserva.operador_mayorista || '-'}</td>
                    </tr>
                    <tr>
                        <td colspan="2"><strong>Fechas:</strong> ${fechaSalida} al ${fechaRegreso}</td>
                    </tr>
                </table>
            </div>
            <h3 style="color: #1e293b; border-bottom: 2px solid #2563eb; padding-bottom: 8px;">Servicios Contratados</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                ${serviciosHTML || '<tr><td style="padding: 15px; text-align: center; color: #999;">Sin servicios cargados</td></tr>'}
            </table>
            ${pasajerosHTML}
            <div style="margin-top: 30px; padding: 15px; background: #f0fdf4; border-radius: 8px; border: 1px solid #bbf7d0; text-align: center;">
                <p style="margin: 0; font-size: 13px; color: #166534;"><strong>Este voucher confirma los servicios listados.</strong><br>Presentar junto con documentación de viaje oficial.</p>
            </div>
        </div>
        <div style="background: #f1f5f9; padding: 15px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; font-size: 12px; color: #64748b;">${empresaNombre} — Agencia de Viajes y Turismo</p>
        </div>
    </div>`;
}

function generarHTMLCotizacion(reserva, servicios, empresaNombre) {
    const fechaSalida = reserva.fecha_viaje_salida ? new Date(reserva.fecha_viaje_salida).toLocaleDateString('es-AR') : 'A confirmar';
    const fechaRegreso = reserva.fecha_viaje_regreso ? new Date(reserva.fecha_viaje_regreso).toLocaleDateString('es-AR') : 'A confirmar';

    let serviciosHTML = '';
    for (const s of servicios) {
        const nombre = s.hotel_nombre || s.aerolinea || s.crucero_nombre || s.nombre_item || 'Servicio';
        const precio = parseFloat(s.venta_bruta_cliente || 0).toFixed(2);

        serviciosHTML += `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">
                    <span style="background: #f1f5f9; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${s.tipo_item}</span>
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">${nombre}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">US$ ${precio}</td>
            </tr>`;
    }

    const gastos = parseFloat(reserva.gastos_administrativos_usd || 0);
    const descuento = parseFloat(reserva.bonificacion_descuento_usd || 0);
    const totalFinal = parseFloat(reserva.total_venta_final_usd || 0);
    const cotizacion = parseFloat(reserva.cotizacion_dolar || 0);

    if (gastos > 0) {
        serviciosHTML += `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee;"><span style="background: #f1f5f9; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">ADMIN</span></td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">Gastos administrativos</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">US$ ${gastos.toFixed(2)}</td>
            </tr>`;
    }
    if (descuento > 0) {
        serviciosHTML += `
            <tr style="color: #16a34a;">
                <td style="padding: 10px; border-bottom: 1px solid #eee;"><span style="background: #f0fdf4; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">DESC</span></td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">Bonificación / Descuento</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right; font-weight: bold;">- US$ ${descuento.toFixed(2)}</td>
            </tr>`;
    }

    let equivalenteARS = '';
    if (cotizacion > 0) {
        equivalenteARS = `
            <div style="background: #f8fafc; border-radius: 8px; padding: 15px; margin-top: 15px; border: 1px solid #e2e8f0;">
                <p style="margin: 0; font-size: 13px; color: #475569;">
                    <strong>Cotización de referencia:</strong> 1 USD = $ ${cotizacion.toFixed(2)} ARS<br>
                    <strong>Equivalente en pesos:</strong> <span style="color: #2563eb; font-weight: bold;">$ ${(totalFinal * cotizacion).toFixed(2)} ARS</span>
                </p>
            </div>`;
    }

    return `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; background: #fff;">
        <div style="background: linear-gradient(135deg, #059669 0%, #10b981 100%); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">${empresaNombre}</h1>
            <p style="color: rgba(255,255,255,0.8); margin: 5px 0 0; font-size: 14px;">Cotización de Viaje</p>
        </div>
        <div style="padding: 30px;">
            <div style="background: #f8fafc; border-radius: 8px; padding: 20px; margin-bottom: 25px; border: 1px solid #e2e8f0;">
                <table style="width: 100%;">
                    <tr>
                        <td><strong>Pasajero:</strong> ${reserva.nombre_titular}</td>
                        <td style="text-align: right;"><strong>Legajo:</strong> #${reserva.id}</td>
                    </tr>
                    <tr>
                        <td><strong>DNI:</strong> ${reserva.dni_titular || '-'}</td>
                        <td style="text-align: right;"><strong>Destino:</strong> ${reserva.destino_final || '-'}</td>
                    </tr>
                    <tr>
                        <td colspan="2"><strong>Fechas:</strong> ${fechaSalida} al ${fechaRegreso}</td>
                    </tr>
                </table>
            </div>
            <h3 style="color: #1e293b; border-bottom: 2px solid #059669; padding-bottom: 8px;">Desglose de Inversión</h3>
            <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                <tr style="background: #f1f5f9;">
                    <th style="padding: 10px; text-align: left; font-size: 12px;">CONCEPTO</th>
                    <th style="padding: 10px; text-align: left; font-size: 12px;">DETALLE</th>
                    <th style="padding: 10px; text-align: right; font-size: 12px;">VALOR (USD)</th>
                </tr>
                ${serviciosHTML}
                <tr style="border-top: 3px solid #1e293b;">
                    <td colspan="2" style="padding: 15px; font-size: 18px; font-weight: bold;">INVERSIÓN TOTAL</td>
                    <td style="padding: 15px; text-align: right; font-size: 18px; font-weight: bold; color: #2563eb;">US$ ${totalFinal.toFixed(2)}</td>
                </tr>
            </table>
            ${equivalenteARS}
            <div style="margin-top: 25px; padding: 15px; background: #fffbeb; border-radius: 8px; border: 1px solid #fde68a; text-align: center;">
                <p style="margin: 0; font-size: 13px; color: #92400e;"><strong>Cotización sujeta a disponibilidad y tipo de cambio vigente.</strong><br>Validez: 5 días hábiles desde la fecha de emisión.</p>
            </div>
        </div>
        <div style="background: #f1f5f9; padding: 15px; text-align: center; border-top: 1px solid #e2e8f0;">
            <p style="margin: 0; font-size: 12px; color: #64748b;">${empresaNombre} — Agencia de Viajes y Turismo</p>
        </div>
    </div>`;
}

module.exports = router;