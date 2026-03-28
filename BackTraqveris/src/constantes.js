// ============================================================================
// CONSTANTES CENTRALIZADAS — Tipos de Movimiento Contable
// ============================================================================
// Este archivo centraliza TODOS los tipos de movimiento para evitar
// inconsistencias entre queries de balance, reporte diario y balance general.
// Si se agrega un nuevo tipo, se agrega ACÁ y se propaga automáticamente.
// ============================================================================

const TIPOS_INGRESO = [
    'PAGO_CLIENTE',
    'INGRESO_GENERAL',
    'CONVERSION_ENTRADA',
    'CANCELACION_PASIVO_TARJETA' // Entrada contable al cancelar deuda de tarjeta
];

const TIPOS_EGRESO = [
    'PAGO_PROVEEDOR',
    'EGRESO_GENERAL',
    'CONVERSION_SALIDA',
    'EGRESO_PAGO_TARJETA' // Salida real de fondos al pagar tarjeta
];

// Genera la cláusula SQL CASE para calcular monto con signo
// Ingresos = +monto, Egresos = -monto, Desconocidos = 0 (NUNCA ELSE -monto)
function sqlCaseMonto(campoMonto = 'monto') {
    const ingresosList = TIPOS_INGRESO.map(t => `'${t}'`).join(', ');
    const egresosList = TIPOS_EGRESO.map(t => `'${t}'`).join(', ');
    return `
        CASE 
            WHEN tipo_movimiento IN (${ingresosList}) THEN ${campoMonto} 
            WHEN tipo_movimiento IN (${egresosList}) THEN -${campoMonto} 
            ELSE 0 
        END`;
}

// Genera cláusula para monto_real en reporte diario
function sqlCaseMontoReal() {
    return sqlCaseMonto('monto');
}

module.exports = {
    TIPOS_INGRESO,
    TIPOS_EGRESO,
    sqlCaseMonto,
    sqlCaseMontoReal
};