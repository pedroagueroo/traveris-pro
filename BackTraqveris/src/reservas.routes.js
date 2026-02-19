const express = require('express');
const router = express.Router();
const pool = require('./db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const transporter = require('./mailer');

// --- RUTA: Enviar Documentación por Mail ---
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
        res.status(500).json({ error: "Error al enviar el correo" });
    }
});

// --- CONFIGURACIÓN DE ARCHIVOS (MULTER) ---
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
            const path = fileData.rows[0].ruta_archivo;
            if (fs.existsSync(path)) fs.unlinkSync(path);
        }
        await pool.query('DELETE FROM reserva_archivos WHERE id = $1', [id]);
        res.json({ mensaje: "Archivo eliminado" });
    } catch (err) {
        res.status(500).json({ error: "Error al eliminar archivo" });
    }
});

// --- ELIMINAR RESERVA ---
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



// --- RADAR DE VENCIMIENTOS (BLINDADO: Solo vencidos hoy o antes) ---
router.get('/radar/vencimientos/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const query = `
            SELECT r.id, r.destino_final, r.fecha_viaje_salida, r.total_venta_final_usd,
                   -- Lógica de Fecha: Manual o 30 días antes de la salida
                   COALESCE(r.fecha_limite_pago, r.fecha_viaje_salida - INTERVAL '30 days') as fecha_limite_pago,
                   c.nombre_completo as titular,
                   -- Saldo Pendiente: (Total Venta) - (Pagos del Cliente)
                   (COALESCE(r.total_venta_final_usd, 0) - 
                    COALESCE((SELECT SUM(monto) FROM movimientos_caja WHERE id_reserva = r.id AND tipo_movimiento = 'PAGO_CLIENTE'), 0)
                   ) as saldo_pendiente
            FROM reservas r
            JOIN clientes c ON r.id_titular = c.id
            WHERE r.empresa_nombre = $1 
            AND r.estado = 'ABIERTO'
            -- REGLA DE ORO 1: Solo si la fecha límite YA PASÓ o es HOY (Estricto)
            AND COALESCE(r.fecha_limite_pago, r.fecha_viaje_salida - INTERVAL '30 days') <= CURRENT_DATE
            -- REGLA DE ORO 2: Solo si el saldo pendiente es mayor a 0 (Debe dinero)
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

// ... (Resto de tus rutas POST, PUT, GET se mantienen idénticas)

// --- LISTADO POR AGENCIA CON SALDO REAL ---
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

// --- OBTENER RESERVA POR ID ---
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const reserva = await pool.query(`SELECT r.*, c.nombre_completo as nombre_titular, c.dni_pasaporte as dni_titular FROM reservas r JOIN clientes c ON r.id_titular = c.id WHERE r.id = $1`, [id]);
        if (reserva.rows.length === 0) return res.status(404).json({ error: "No existe el legajo" });
        const pasajeros = await pool.query(`SELECT rp.*, c.nombre_completo, c.dni_pasaporte FROM reserva_pasajeros rp JOIN clientes c ON rp.id_cliente = c.id WHERE rp.id_reserva = $1`, [id]);
        const vuelos = await pool.query(`SELECT * FROM reserva_vuelos WHERE id_reserva = $1 ORDER BY fecha_salida`, [id]);
        const servicios = await pool.query(`SELECT * FROM reserva_servicios_detallados WHERE id_reserva = $1`, [id]);
        res.json({ ...reserva.rows[0], pasajeros: pasajeros.rows, vuelos: vuelos.rows, servicios_items: servicios.rows });
    } catch (err) {
        res.status(500).json({ error: "Error al obtener el detalle" });
    }
});

// --- HISTORIAL POR CLIENTE ---
router.get('/cliente/:idCliente', async (req, res) => {
    try {
        const { idCliente } = req.params;
        const query = `SELECT DISTINCT r.*, c_tit.nombre_completo as nombre_titular FROM reservas r JOIN clientes c_tit ON r.id_titular = c_tit.id LEFT JOIN reserva_pasajeros rp ON r.id = rp.id_reserva WHERE r.id_titular = $1 OR rp.id_cliente = $1 ORDER BY r.fecha_viaje_salida DESC`;
        const reservas = await pool.query(query, [idCliente]);
        res.json(reservas.rows);
    } catch (err) {
        res.status(500).json({ error: "Error al obtener historial" });
    }
});

// --- DASHBOARD STATS ---
router.get('/dashboard/stats/:empresa', async (req, res) => {
    try {
        const { empresa } = req.params;
        const query = `
            SELECT 
                COALESCE(SUM(total_venta_final_usd) - (SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja mc WHERE mc.tipo_movimiento = 'PAGO_CLIENTE' AND mc.id_reserva IN (SELECT id FROM reservas WHERE empresa_nombre = $1)), 0) as "saldoPendienteGlobal",
                COALESCE(SUM(costo_total_operador_usd) - (SELECT COALESCE(SUM(monto), 0) FROM movimientos_caja mc WHERE mc.tipo_movimiento = 'PAGO_PROVEEDOR' AND mc.id_reserva IN (SELECT id FROM reservas WHERE empresa_nombre = $1)), 0) as "deudaProveedoresGlobal",
                COUNT(*) FILTER (WHERE estado = 'ABIERTO') as "legajosActivos",
                COUNT(*) as "totalLegajos"
            FROM reservas WHERE empresa_nombre = $1`;
        const result = await pool.query(query, [empresa]);
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: "Error al calcular stats" });
    }
});

// --- ACTUALIZAR ESTADO ---
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

// --- CREAR RESERVA (POST Acoplado) ---
router.post('/', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id_titular, destino_final, fecha_viaje_salida, fecha_viaje_regreso, cotizacion_dolar, operador_mayorista, nro_expediente_operador, empresa_nombre, gastos_administrativos_usd, bonificacion_descuento_usd, total_venta_final_usd, costo_total_operador_usd, observaciones_internas, servicios, acompaniantes, vuelos, fecha_limite_pago } = req.body;

        const resReserva = await client.query(
            `INSERT INTO reservas (id_titular, destino_final, fecha_viaje_salida, fecha_viaje_regreso, cotizacion_dolar, operador_mayorista, nro_expediente_operador, empresa_nombre, gastos_administrativos_usd, bonificacion_descuento_usd, total_venta_final_usd, costo_total_operador_usd, observaciones_internas, estado, fecha_limite_pago) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ABIERTO', $14) RETURNING id`,
            [id_titular, destino_final, fecha_viaje_salida, fecha_viaje_regreso, cotizacion_dolar, operador_mayorista, nro_expediente_operador, empresa_nombre, gastos_administrativos_usd, bonificacion_descuento_usd, total_venta_final_usd, costo_total_operador_usd, observaciones_internas, fecha_limite_pago || null]
        );
        const idReserva = resReserva.rows[0].id;

        if (servicios) {
            for (let s of servicios) {
                const d = s.detalles;
                await client.query(`INSERT INTO reserva_servicios_detallados (id_reserva, tipo_item, costo_neto_operador, venta_bruta_cliente, hotel_nombre, ciudad, check_in, check_out, aerolinea, nro_vuelo, origen, destino, pnr, crucero_nombre, crucero_cabina, crucero_itinerario, nombre_item, servicio_descripcion, excursion_fecha) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
                    [idReserva, s.tipo_item, s.costo_neto_operador || 0, s.venta_bruta_cliente || 0, d.hotel_nombre || null, d.ciudad || null, d.check_in || null, d.check_out || null, d.aerolinea || null, d.nro_vuelo || null, d.origen || null, d.destino || null, d.pnr || null, d.crucero_nombre || null, d.crucero_cabina || null, d.crucero_itinerario || null, d.nombre_servicio || null, d.servicio_descripcion || null, d.fecha || null]);
            }
        }
        if (acompaniantes) {
            for (let a of acompaniantes) {
                await client.query(`INSERT INTO reserva_pasajeros (id_reserva, id_cliente, tipo_pasajero, es_titular) VALUES ($1, $2, $3, FALSE)`, [idReserva, a.id_cliente, a.tipo_pasajero]);
            }
        }
        if (vuelos) {
            for (let v of vuelos) {
                await client.query(`INSERT INTO reserva_vuelos (id_reserva, aerolinea, nro_vuelo, codigo_pnr, origen_iata, destino_iata, fecha_salida) VALUES ($1, $2, $3, $4, $5, $6, $7)`, [idReserva, v.aerolinea, v.nro_vuelo, v.codigo_pnr, v.origen_iata, v.destino_iata, v.fecha_salida]);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true, id: idReserva });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).json({ error: "Error al crear legajo" });
    } finally {
        client.release();
    }
});

// --- OBTENER RESERVA COMPLETA PARA EDICIÓN ---
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
        res.status(500).json({ error: "Error al traer legajo completo" });
    }
});

// --- ACTUALIZAR RESERVA (PUT Acoplado) ---
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id_titular, destino_final, fecha_viaje_salida, fecha_viaje_regreso, cotizacion_dolar, operador_mayorista, nro_expediente_operador, gastos_administrativos_usd, bonificacion_descuento_usd, total_venta_final_usd, costo_total_operador_usd, observaciones_internas, servicios, acompaniantes, fecha_limite_pago } = req.body;

        await client.query(
            `UPDATE reservas SET id_titular=$1, destino_final=$2, fecha_viaje_salida=$3, fecha_viaje_regreso=$4, cotizacion_dolar=$5, operador_mayorista=$6, nro_expediente_operador=$7, gastos_administrativos_usd=$8, bonificacion_descuento_usd=$9, total_venta_final_usd=$10, costo_total_operador_usd=$11, observaciones_internas=$12, fecha_limite_pago=$13 WHERE id = $14`,
            [id_titular, destino_final, fecha_viaje_salida, fecha_viaje_regreso, cotizacion_dolar, operador_mayorista, nro_expediente_operador, gastos_administrativos_usd, bonificacion_descuento_usd, total_venta_final_usd, costo_total_operador_usd, observaciones_internas, fecha_limite_pago || null, id]
        );

        await client.query('DELETE FROM reserva_pasajeros WHERE id_reserva = $1', [id]);
        await client.query('DELETE FROM reserva_servicios_detallados WHERE id_reserva = $1', [id]);

        if (acompaniantes) {
            for (let a of acompaniantes) {
                await client.query('INSERT INTO reserva_pasajeros (id_reserva, id_cliente, tipo_pasajero) VALUES ($1,$2,$3)', [id, a.id_cliente, a.tipo_pasajero]);
            }
        }
        if (servicios) {
            for (let s of servicios) {
                const d = s.detalles || {};
                await client.query(`INSERT INTO reserva_servicios_detallados (id_reserva, tipo_item, costo_neto_operador, venta_bruta_cliente, hotel_nombre, ciudad, check_in, check_out, regimen, aerolinea, nro_vuelo, origen, destino, pnr, plan_asistencia, nro_poliza, cobertura_detalles, pais_destino, nro_tramite, fecha_vencimiento_visa, crucero_nombre, crucero_cabina, crucero_itinerario, nombre_item, servicio_descripcion, excursion_fecha) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
                    [id, s.tipo_item, s.costo_neto_operador || 0, s.venta_bruta_cliente || 0, d.hotel_nombre || null, d.ciudad || null, d.check_in || null, d.check_out || null, d.regimen || null, d.aerolinea || null, d.nro_vuelo || null, d.origen || null, d.destino || null, d.pnr || null, d.plan || null, d.nro_poliza || null, d.cobertura || null, d.pais || null, d.nro_tramite || null, d.fecha_vencimiento || null, d.crucero_nombre || null, d.crucero_cabina || null, d.crucero_itinerario || null, d.nombre_servicio || null, d.servicio_descripcion || null, d.fecha || null]);
            }
        }
        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        console.error(e);
        res.status(500).json({ error: "Error interno al actualizar" });
    } finally {
        client.release();
    }
});

module.exports = router;