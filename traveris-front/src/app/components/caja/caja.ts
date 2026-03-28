import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-caja',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './caja.html',
  styleUrl: './caja.css',
})
export class Caja implements OnInit {

  preciosAPI = { dolar: 0, euro: 0, real: 0 };
  montoEntrada: number = 0;
  monedaSeleccionada: string = 'USD';
  tipoCambioUsado: number = 0;
  modoPersonalizado: boolean = false;
  resultado: number = 0;
  saldos = { saldoARS: 0, saldoUSD: 0 };
  movimientosHoy: any[] = [];

  nuevoGasto = {
    monto: 0,
    moneda: 'ARS',
    tipo_movimiento: 'EGRESO_GENERAL',
    metodo_pago: 'EFECTIVO',
    observaciones: ''
  };

  saldosDetallados: any[] = [];
  direccionConversion: 'A_PESOS' | 'A_DIVISA' = 'A_PESOS';

  // ── NUEVO: Modal pago de tarjeta ──
  mostrarModalTarjeta: boolean = false;
  pagoTarjeta = {
    monto: 0,
    moneda: 'ARS',
    metodo_pago_real: 'EFECTIVO',
    observaciones: ''
  };

  // ── NUEVO: Cierre mensual ──
  mostrarCierre: boolean = false;
  cierreMensual: any = null;
  mesSeleccionado: number = new Date().getMonth() + 1;
  anioSeleccionado: number = new Date().getFullYear();
  cargandoCierre: boolean = false;

  constructor(
    private api: ApiService,
    private auth: AuthService
  ) { }

  ngOnInit() {
    this.cargarCaja();
    this.obtenerCotizaciones();
  }

  cargarCaja() {
    const miAgencia = this.auth.getNombreEmpresa();
    this.api.getBalanceCaja(miAgencia).subscribe(data => this.saldos = data);
    this.api.getBalanceBilleteras(miAgencia).subscribe(data => this.saldosDetallados = data);
    this.api.getReporteDiario(miAgencia).subscribe(data => this.movimientosHoy = data);
  }

  registrarGasto() {
    if (this.nuevoGasto.monto <= 0 || !this.nuevoGasto.observaciones) {
      alert("Por favor, completa el monto y el concepto del gasto.");
      return;
    }

    const payload = {
      ...this.nuevoGasto,
      id_reserva: null,
      empresa_nombre: this.auth.getNombreEmpresa()
    };

    this.api.crearMovimientoCaja(payload).subscribe({
      next: () => {
        alert("Gasto registrado con éxito");
        this.nuevoGasto.monto = 0;
        this.nuevoGasto.observaciones = '';
        this.cargarCaja();
      },
      error: (err) => alert("Error al registrar el gasto: " + (err.error?.error || 'Error de conexión'))
    });
  }

  // ── NUEVO: Pago de deuda de tarjeta ──────────────────────────────────────
  abrirModalTarjeta() {
    this.pagoTarjeta = { monto: 0, moneda: 'ARS', metodo_pago_real: 'EFECTIVO', observaciones: '' };
    this.mostrarModalTarjeta = true;
  }

  cerrarModalTarjeta() {
    this.mostrarModalTarjeta = false;
  }

  confirmarPagoTarjeta() {
    if (this.pagoTarjeta.monto <= 0) {
      alert("El monto debe ser mayor a 0");
      return;
    }

    const payload = {
      ...this.pagoTarjeta,
      empresa_nombre: this.auth.getNombreEmpresa()
    };

    this.api.pagarDeudaTarjeta(payload).subscribe({
      next: (res) => {
        alert(res.mensaje || "Deuda de tarjeta cancelada correctamente");
        this.mostrarModalTarjeta = false;
        this.cargarCaja();
      },
      error: (err) => alert("Error: " + (err.error?.error || 'Error al procesar pago'))
    });
  }

  // ── NUEVO: Cierre mensual real ───────────────────────────────────────────
  generarCierreMensual() {
    this.cargandoCierre = true;
    this.mostrarCierre = true;
    
    this.api.getCierreMensual(
      this.auth.getNombreEmpresa(), 
      this.mesSeleccionado, 
      this.anioSeleccionado
    ).subscribe({
      next: (data) => {
        this.cierreMensual = data;
        this.cargandoCierre = false;
      },
      error: (err) => {
        alert("Error al generar cierre: " + (err.error?.error || 'Error de conexión'));
        this.cargandoCierre = false;
      }
    });
  }

  imprimirCierreCaja() {
    if (!this.cierreMensual) {
      this.generarCierreMensual();
      // Esperar un momento para que cargue
      setTimeout(() => {
        if (this.cierreMensual) {
          this.imprimirReporte();
        }
      }, 2000);
    } else {
      this.imprimirReporte();
    }
  }

  private imprimirReporte() {
    // Generar HTML del reporte de cierre
    const html = this.buildCierreHTML();
    const ventana = window.open('', '_blank', 'width=800,height=600');
    if (ventana) {
      ventana.document.write(html);
      ventana.document.close();
      ventana.onload = () => {
        ventana.print();
      };
    }
  }

  private buildCierreHTML(): string {
    const c = this.cierreMensual;
    if (!c) return '<h1>Sin datos</h1>';

    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const mesNombre = meses[(c.periodo.mes - 1)] || '';

    let detalleRows = '';
    if (c.detalle && c.detalle.length > 0) {
      c.detalle.forEach((m: any) => {
        const fecha = new Date(m.fecha_pago).toLocaleDateString('es-AR');
        const signo = parseFloat(m.monto_real) >= 0 ? '+' : '';
        detalleRows += `
          <tr>
            <td>${fecha}</td>
            <td>${m.tipo_movimiento}</td>
            <td>${m.metodo_pago || '-'}</td>
            <td>${m.moneda}</td>
            <td style="text-align:right; color: ${parseFloat(m.monto_real) >= 0 ? '#198754' : '#dc3545'}; font-weight:bold;">
              ${signo}${parseFloat(m.monto_real).toFixed(2)}
            </td>
            <td>${m.nombre_titular || m.observaciones || '-'}</td>
          </tr>`;
      });
    }

    let resumenTiposRows = '';
    if (c.resumenTipos && c.resumenTipos.length > 0) {
      c.resumenTipos.forEach((t: any) => {
        resumenTiposRows += `
          <tr>
            <td>${t.tipo_movimiento}</td>
            <td>${t.moneda}</td>
            <td style="text-align:center">${t.cantidad}</td>
            <td style="text-align:right; font-weight:bold;">${parseFloat(t.monto_neto).toFixed(2)}</td>
          </tr>`;
      });
    }

    let resumenMetodosRows = '';
    if (c.resumenMetodos && c.resumenMetodos.length > 0) {
      c.resumenMetodos.forEach((m: any) => {
        resumenMetodosRows += `
          <tr>
            <td>${m.metodo_pago}</td>
            <td>${m.moneda}</td>
            <td style="text-align:right; font-weight:bold; color: ${parseFloat(m.saldo) >= 0 ? '#198754' : '#dc3545'}">
              ${parseFloat(m.saldo).toFixed(2)}
            </td>
          </tr>`;
      });
    }

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Cierre Mensual — ${mesNombre} ${c.periodo.anio}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; padding: 30px; font-size: 12px; }
    h1 { font-size: 20px; margin-bottom: 5px; }
    h2 { font-size: 14px; margin: 20px 0 10px; padding-bottom: 5px; border-bottom: 2px solid #1a1a2e; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 3px solid #1a1a2e; }
    .header-right { text-align: right; }
    .totals-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 15px 0; }
    .total-box { border: 1px solid #dee2e6; border-radius: 8px; padding: 12px; text-align: center; }
    .total-box .label { font-size: 10px; text-transform: uppercase; color: #6c757d; font-weight: bold; }
    .total-box .value { font-size: 18px; font-weight: bold; margin-top: 4px; }
    .positive { color: #198754; }
    .negative { color: #dc3545; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 11px; }
    th { background: #1a1a2e; color: white; padding: 8px 6px; text-align: left; font-size: 10px; text-transform: uppercase; }
    td { padding: 6px; border-bottom: 1px solid #e9ecef; }
    tr:nth-child(even) { background: #f8f9fa; }
    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #dee2e6; text-align: center; font-size: 10px; color: #6c757d; }
    @media print { body { padding: 15px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>${c.empresa}</h1>
      <p style="color:#6c757d;">Empresa de Viajes y Turismo | Ley 18.829</p>
    </div>
    <div class="header-right">
      <div style="font-size:16px; font-weight:bold;">CIERRE DE CAJA</div>
      <div style="font-size:14px; color:#4361ee;">${mesNombre} ${c.periodo.anio}</div>
      <div style="font-size:10px; color:#6c757d;">Generado: ${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR')}</div>
    </div>
  </div>

  <div class="totals-grid">
    <div class="total-box">
      <div class="label">Saldo ARS</div>
      <div class="value ${parseFloat(c.totales.totalARS) >= 0 ? 'positive' : 'negative'}">$ ${parseFloat(c.totales.totalARS).toFixed(2)}</div>
    </div>
    <div class="total-box">
      <div class="label">Saldo USD</div>
      <div class="value ${parseFloat(c.totales.totalUSD) >= 0 ? 'positive' : 'negative'}">US$ ${parseFloat(c.totales.totalUSD).toFixed(2)}</div>
    </div>
    <div class="total-box">
      <div class="label">Movimientos</div>
      <div class="value">${c.totales.cantidadMovimientos}</div>
    </div>
    <div class="total-box">
      <div class="label">Utilidad Bruta</div>
      <div class="value positive">US$ ${parseFloat(c.rentabilidad.utilidadBruta).toFixed(2)}</div>
    </div>
  </div>

  <h2>Resumen por Tipo de Movimiento</h2>
  <table>
    <thead><tr><th>Tipo</th><th>Moneda</th><th style="text-align:center">Cantidad</th><th style="text-align:right">Monto Neto</th></tr></thead>
    <tbody>${resumenTiposRows || '<tr><td colspan="4" style="text-align:center">Sin movimientos en el período</td></tr>'}</tbody>
  </table>

  <h2>Saldo por Método de Pago</h2>
  <table>
    <thead><tr><th>Método</th><th>Moneda</th><th style="text-align:right">Saldo</th></tr></thead>
    <tbody>${resumenMetodosRows || '<tr><td colspan="3" style="text-align:center">Sin datos</td></tr>'}</tbody>
  </table>

  <h2>Rentabilidad del Período</h2>
  <table>
    <thead><tr><th>Concepto</th><th style="text-align:right">USD</th></tr></thead>
    <tbody>
      <tr><td>Ventas totales</td><td style="text-align:right; font-weight:bold;">US$ ${parseFloat(c.rentabilidad.ventasTotales).toFixed(2)}</td></tr>
      <tr><td>Costos operador</td><td style="text-align:right; color:#dc3545; font-weight:bold;">US$ ${parseFloat(c.rentabilidad.costosTotales).toFixed(2)}</td></tr>
      <tr style="background:#e8f5e9;"><td style="font-weight:bold;">Utilidad bruta</td><td style="text-align:right; font-weight:bold; color:#198754;">US$ ${parseFloat(c.rentabilidad.utilidadBruta).toFixed(2)}</td></tr>
      <tr><td>Reservas del período</td><td style="text-align:right;">${c.rentabilidad.reservasDelMes}</td></tr>
    </tbody>
  </table>

  <h2>Detalle de Movimientos</h2>
  <table>
    <thead><tr><th>Fecha</th><th>Tipo</th><th>Método</th><th>Moneda</th><th style="text-align:right">Monto</th><th>Referencia</th></tr></thead>
    <tbody>${detalleRows || '<tr><td colspan="6" style="text-align:center">Sin movimientos</td></tr>'}</tbody>
  </table>

  <div class="footer">
    <p><strong>${c.empresa}</strong> — Reporte generado automáticamente por Traveris Pro</p>
    <p>Este documento tiene carácter informativo. Consulte con su contador para validación oficial.</p>
  </div>
</body>
</html>`;
  }

  obtenerCotizaciones() {
    this.api.getCotizacionesCompletas().subscribe({
      next: (data) => {
        this.preciosAPI = data;
        this.actualizarPrecioManual();
      },
      error: () => {
        // Si falla la API de cotizaciones, no bloquear la caja
        console.warn("No se pudieron obtener cotizaciones actuales");
      }
    });
  }

  actualizarPrecioManual() {
    if (!this.modoPersonalizado) {
      if (this.monedaSeleccionada === 'USD') this.tipoCambioUsado = this.preciosAPI.dolar;
      if (this.monedaSeleccionada === 'EUR') this.tipoCambioUsado = this.preciosAPI.euro;
      if (this.monedaSeleccionada === 'BRL') this.tipoCambioUsado = this.preciosAPI.real;
    }
    this.calcular();
  }

  calcular() {
    if (!this.tipoCambioUsado || this.tipoCambioUsado === 0) return;
    if (this.direccionConversion === 'A_PESOS') {
      this.resultado = this.montoEntrada * this.tipoCambioUsado;
    } else {
      this.resultado = this.montoEntrada / this.tipoCambioUsado;
    }
  }

  eliminarMovimiento(id: number) {
    if (confirm("¿Estás seguro de anular este movimiento? Se generará un contramovimiento de reversión.")) {
      this.api.eliminarMovimientoContable(id).subscribe({
        next: () => {
          alert("Movimiento anulado correctamente");
          this.cargarCaja();
        },
        error: (err) => alert("Error: " + (err.error?.error || "Error al anular"))
      });
    }
  }

  // Helper para nombres de meses
  getNombreMes(mes: number): string {
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                   'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[mes - 1] || '';
  }
}