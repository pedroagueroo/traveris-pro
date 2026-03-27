const express = require('express');
const router = express.Router();
const pool = require('./db');
const multer = require('multer');
const XLSX = require('xlsx');

// Multer: almacenamiento en memoria (no guardamos el archivo en disco)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB máximo
    fileFilter: (req, file, cb) => {
        const allowedTypes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-excel'
        ];
        if (allowedTypes.includes(file.mimetype) ||
            file.originalname.endsWith('.xlsx') ||
            file.originalname.endsWith('.xls')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos Excel (.xlsx, .xls)'));
        }
    }
});

// =====================================================
// UTILIDADES DE PARSEO
// =====================================================

/**
 * Convierte un serial de fecha Excel a un objeto Date.
 * Excel cuenta los días desde el 1/1/1900 (con el bug del año bisiesto 1900).
 */
function excelSerialToDate(serial) {
    if (!serial || serial <= 1) return null;
    // Si es un número > 100, es un serial de Excel
    if (typeof serial === 'number' && serial > 100) {
        const utcDays = Math.floor(serial - 25569);
        const date = new Date(utcDays * 86400 * 1000);
        return date.toISOString().split('T')[0]; // YYYY-MM-DD
    }
    return null;
}

/**
 * Parsea fechas en formato DD/MM/YY o DD/MM/YYYY
 */
function parseDateDMY(str) {
    if (!str) return null;
    if (typeof str === 'number') return excelSerialToDate(str);

    const s = String(str).trim();
    if (!s) return null;

    // Formato DD/MM/YY o DD/MM/YYYY
    const match = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (match) {
        let [, day, month, year] = match;
        day = parseInt(day, 10);
        month = parseInt(month, 10);
        year = parseInt(year, 10);

        // Si el año es de 2 dígitos, asumimos 1900-2099
        if (year < 100) {
            year = year > 50 ? 1900 + year : 2000 + year;
        }

        // Validar rangos
        if (month < 1 || month > 12 || day < 1 || day > 31) return null;

        const pad = (n) => String(n).padStart(2, '0');
        return `${year}-${pad(month)}-${pad(day)}`;
    }

    return null;
}

/**
 * Limpia y normaliza un string
 */
function cleanStr(val) {
    if (val === null || val === undefined) return '';
    return String(val).trim();
}

/**
 * Limpia un número de teléfono
 */
function cleanPhone(val) {
    if (!val) return '';
    return String(val).replace(/[^\d+\-\s()]/g, '').trim();
}

/**
 * Mapea una fila del Excel a un objeto cliente de Traveris
 */
function mapRowToCliente(row, empresaNombre) {
    // Nombre completo: usar NOMBRE (ya viene concatenado) o concatenar NOMB1 + NOMB2
    let nombre = cleanStr(row['NOMBRE']);
    if (!nombre) {
        const nomb1 = cleanStr(row['NOMB1']);
        const nomb2 = cleanStr(row['NOMB2']);
        nombre = [nomb1, nomb2].filter(Boolean).join(' ');
    }

    // DNI: buscar en NUMERO cuando TIPO es DNI, o usar ID_CLI como fallback
    let dni = '';
    if (cleanStr(row['TIPO']).toUpperCase() === 'DNI' || cleanStr(row['TIPO']).toUpperCase() === 'D.N.I') {
        dni = cleanStr(row['NUMERO']);
    }
    if (!dni) {
        dni = cleanStr(row['DNI_CUI']) || cleanStr(row['NUMERO']) || '';
    }

    // Email: buscar en varias columnas posibles
    const email = cleanStr(row['EMAIL']) || cleanStr(row['EML_PAN']) || '';

    // Teléfono: priorizar CELULAR, luego TEL_PAR, luego TEL_COM
    const telefono = cleanPhone(row['CELULAR']) || cleanPhone(row['TEL_PAR']) || cleanPhone(row['TEL_COM']) || '';

    // Fecha de nacimiento
    const fechaNac = parseDateDMY(row['FEC_NAC']);

    // CUIT/CUIL
    const cuitCuil = cleanStr(row['NUM_IVA']) || cleanStr(row['ID_IVA']) || '';

    // Pasaporte: buscar en NUMERO1 cuando TIPO1 es PAS, o en NRO_PASAPORTE
    let pasaporteNro = '';
    if (cleanStr(row['TIPO1']).toUpperCase() === 'PAS') {
        pasaporteNro = cleanStr(row['NUMERO1']);
    }
    if (!pasaporteNro) {
        pasaporteNro = cleanStr(row['NRO_PASAPORTE']) || cleanStr(row['PASAPORTE']) || '';
    }

    // Fechas de pasaporte (pueden ser seriales de Excel)
    const pasaporteEmision = excelSerialToDate(row['EMI_PAS']) || parseDateDMY(row['FEC_EMI']) || null;
    const pasaporteVencimiento = excelSerialToDate(row['VEN_PAS']) || parseDateDMY(row['FEC_VTO']) || null;

    // Sexo
    let sexo = cleanStr(row['SEXO']).toUpperCase();
    if (sexo === 'MASCULINO' || sexo === 'MASC') sexo = 'M';
    else if (sexo === 'FEMENINO' || sexo === 'FEM') sexo = 'F';
    else if (sexo !== 'M' && sexo !== 'F' && sexo !== 'X') sexo = 'M'; // Default

    // Nacionalidad
    const nacionalidad = cleanStr(row['NACIONALIDAD']) || 'Argentina';

    return {
        nombre_completo: nombre.toUpperCase(),
        dni_pasaporte: dni,
        email: email.toLowerCase(),
        telefono,
        fecha_nacimiento: fechaNac,
        cuit_cuil: cuitCuil,
        pasaporte_nro: pasaporteNro,
        pasaporte_emision: pasaporteEmision,
        pasaporte_vencimiento: pasaporteVencimiento,
        sexo,
        nacionalidad,
        pref_asiento: 'INDIFERENTE',
        pref_comida: '',
        observaciones_salud: '',
        empresa_nombre: empresaNombre,
        dni_emision: null,
        dni_vencimiento: excelSerialToDate(row['VTO_DOC']) || null
    };
}

// =====================================================
// ENDPOINT DE IMPORTACIÓN
// =====================================================

router.post('/upload', upload.single('archivo'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No se recibió ningún archivo' });
    }

    const empresaNombre = req.body.empresa_nombre;
    if (!empresaNombre) {
        return res.status(400).json({ error: 'empresa_nombre es obligatorio' });
    }

    try {
        // 1. Leer el Excel desde el buffer en memoria
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet);

        if (!rows || rows.length === 0) {
            return res.status(400).json({ error: 'El archivo Excel está vacío' });
        }

        console.log(`📊 Procesando ${rows.length} filas del Excel para "${empresaNombre}"...`);

        // 2. Mapear y validar cada fila
        const resultados = {
            total: rows.length,
            insertados: 0,
            actualizados: 0,
            errores: 0,
            detalles_errores: []
        };

        // 3. Procesar en batches usando transacciones
        const BATCH_SIZE = 50;
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            for (let i = 0; i < rows.length; i++) {
                try {
                    const cliente = mapRowToCliente(rows[i], empresaNombre);

                    // Validación: nombre obligatorio
                    if (!cliente.nombre_completo) {
                        resultados.errores++;
                        resultados.detalles_errores.push({
                            fila: i + 2, // +2 porque fila 1 es header y arrays empiezan en 0
                            motivo: 'Nombre vacío',
                            datos: rows[i]['NOMBRE'] || '(vacío)'
                        });
                        continue;
                    }

                    // UPSERT: Si existe por DNI+empresa → actualizar. Si no → insertar.
                    if (cliente.dni_pasaporte) {
                        // Buscar duplicado por DNI + empresa
                        const existente = await client.query(
                            'SELECT id FROM clientes WHERE dni_pasaporte = $1 AND empresa_nombre = $2',
                            [cliente.dni_pasaporte, empresaNombre]
                        );

                        if (existente.rows.length > 0) {
                            // ACTUALIZAR el registro existente
                            await client.query(`
                                UPDATE clientes SET
                                    nombre_completo = $1,
                                    email = CASE WHEN $2 = '' THEN email ELSE $2 END,
                                    telefono = CASE WHEN $3 = '' THEN telefono ELSE $3 END,
                                    fecha_nacimiento = COALESCE($4::date, fecha_nacimiento),
                                    cuit_cuil = CASE WHEN $5 = '' THEN cuit_cuil ELSE $5 END,
                                    nacionalidad = $6,
                                    pasaporte_nro = CASE WHEN $7 = '' THEN pasaporte_nro ELSE $7 END,
                                    pasaporte_emision = COALESCE($8::date, pasaporte_emision),
                                    pasaporte_vencimiento = COALESCE($9::date, pasaporte_vencimiento),
                                    sexo = $10,
                                    dni_vencimiento = COALESCE($11::date, dni_vencimiento)
                                WHERE id = $12
                            `, [
                                cliente.nombre_completo,
                                cliente.email,
                                cliente.telefono,
                                cliente.fecha_nacimiento,
                                cliente.cuit_cuil,
                                cliente.nacionalidad,
                                cliente.pasaporte_nro,
                                cliente.pasaporte_emision,
                                cliente.pasaporte_vencimiento,
                                cliente.sexo,
                                cliente.dni_vencimiento,
                                existente.rows[0].id
                            ]);
                            resultados.actualizados++;
                            continue;
                        }
                    }

                    // INSERTAR nuevo cliente
                    await client.query(`
                        INSERT INTO clientes (
                            nombre_completo, dni_pasaporte, email, telefono, fecha_nacimiento,
                            cuit_cuil, nacionalidad, pasaporte_nro, pasaporte_emision, pasaporte_vencimiento,
                            sexo, pref_asiento, pref_comida, observaciones_salud, empresa_nombre,
                            dni_emision, dni_vencimiento
                        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
                    `, [
                        cliente.nombre_completo,
                        cliente.dni_pasaporte,
                        cliente.email,
                        cliente.telefono,
                        cliente.fecha_nacimiento,
                        cliente.cuit_cuil,
                        cliente.nacionalidad,
                        cliente.pasaporte_nro,
                        cliente.pasaporte_emision,
                        cliente.pasaporte_vencimiento,
                        cliente.sexo,
                        cliente.pref_asiento,
                        cliente.pref_comida,
                        cliente.observaciones_salud,
                        cliente.empresa_nombre,
                        cliente.dni_emision,
                        cliente.dni_vencimiento
                    ]);
                    resultados.insertados++;

                } catch (rowErr) {
                    resultados.errores++;
                    resultados.detalles_errores.push({
                        fila: i + 2,
                        motivo: rowErr.message,
                        datos: cleanStr(rows[i]['NOMBRE'])
                    });
                }

                // Commit parcial cada BATCH_SIZE para no acumular demasiado
                if ((i + 1) % BATCH_SIZE === 0) {
                    await client.query('COMMIT');
                    await client.query('BEGIN');
                    console.log(`   ✅ Procesadas ${i + 1}/${rows.length} filas...`);
                }
            }

            await client.query('COMMIT');
        } catch (txErr) {
            await client.query('ROLLBACK');
            throw txErr;
        } finally {
            client.release();
        }

        console.log(`✅ Importación finalizada: ${resultados.insertados} nuevos, ${resultados.actualizados} actualizados, ${resultados.errores} errores`);

        res.json({
            success: true,
            mensaje: `Importación completada exitosamente`,
            resultados
        });

    } catch (err) {
        console.error('🔥 Error en importación de Excel:', err);
        res.status(500).json({
            error: 'Error al procesar el archivo Excel',
            detalle: err.message
        });
    }
});

module.exports = router;
