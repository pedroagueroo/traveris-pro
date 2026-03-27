import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { HttpClient } from '@angular/common/http';

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

  pagTarjeta = { monto: 0, nombre_tarjeta: 'NARANJA X', observaciones: '' };


  direccionConversion: 'A_PESOS' | 'A_DIVISA' = 'A_PESOS';

  // Corregí el constructor agregando private http: HttpClient
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

    // Saldo Global
    this.api.getBalanceCaja(miAgencia).subscribe(data => this.saldos = data);

    // NUEVO: Saldo por Billetera (Usando la función del servicio)
    this.api.getBalanceBilleteras(miAgencia).subscribe(data => {
      this.saldosDetallados = data;
    });

    // Reporte Diario
    this.api.getReporteDiario(miAgencia).subscribe(data => this.movimientosHoy = data);
  }

  confirmarPagoTarjeta() {
    if (!this.pagTarjeta.monto || this.pagTarjeta.monto <= 0) {
      alert('Ingresá un monto válido');
      return;
    }
    const payload = {
      ...this.pagTarjeta,
      empresa_nombre: this.auth.getNombreEmpresa()
    };
    this.api.pagarDeudaTarjeta(payload).subscribe({
      next: (res) => {
        alert(res.mensaje);
        // Cerrar modal manualmente
        const modal = document.getElementById('modalPagarTarjeta');
        (window as any).bootstrap.Modal.getInstance(modal)?.hide();
        this.pagTarjeta = { monto: 0, nombre_tarjeta: 'NARANJA X', observaciones: '' };
        this.cargarCaja();
      },
      error: (err) => alert('Error: ' + err.error?.error)
    });
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
        this.cargarCaja(); // Recarga saldos y tabla automáticamente
      },
      error: (err) => alert("Error al registrar el gasto")
    });
  }

  obtenerCotizaciones() {
    this.api.getCotizacionesCompletas().subscribe(data => {
      this.preciosAPI = data;
      this.actualizarPrecioManual();
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
      // Ejemplo: 100 USD * 1000 = 100.000 ARS
      this.resultado = this.montoEntrada * this.tipoCambioUsado;
    } else {
      // Ejemplo: 100.000 ARS / 1000 = 100 USD
      this.resultado = this.montoEntrada / this.tipoCambioUsado;
    }
  }

  eliminarMovimiento(id: number) {
    if (confirm("¿Estás seguro de eliminar este registro? Esto alterará los saldos.")) {
      this.api.eliminarMovimientoContable(id).subscribe({
        next: () => {
          alert("Movimiento eliminado");
          this.cargarCaja(); // 👈 ESTO dispara getBalanceCaja y getReporteDiario de nuevo
        },
        error: (err) => console.error("Error al borrar:", err)
      });
    }
  }

  imprimirCierreCaja() {
    window.print(); // Usaremos CSS para ocultar los formularios y mostrar solo la tabla y totales
  }

  generarCierreMensual() {
  const hoy = new Date();
  const mes = hoy.getMonth() + 1;
  const anio = hoy.getFullYear();
  const empresa = this.auth.getNombreEmpresa();

  this.api.getCierreMensual(empresa, mes, anio).subscribe({
    next: (data) => {
      const html = this.buildCierreHTML(data);
      const ventana = window.open('', '_blank');
      ventana!.document.write(html);
      ventana!.document.close();
      ventana!.print();
    },
    error: () => alert('Error al generar el cierre')
  });
}

private buildCierreHTML(data: any): string {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const nomMes = meses[data.periodo.mes - 1];

  const filasMov = data.movimientos.map((m: any) => {
    const esIngreso = ['PAGO_CLIENTE','INGRESO_GENERAL','CONVERSION_ENTRADA'].includes(m.tipo_movimiento);
    return `
      <tr>
        <td>${new Date(m.fecha_pago).toLocaleDateString('es-AR')}</td>
        <td>${m.nro_legajo ? '#' + m.nro_legajo : '-'}</td>
        <td style="font-size:0.8rem;">${m.tipo_movimiento}</td>
        <td>${m.metodo_pago || '-'}</td>
        <td>${m.moneda}</td>
        <td style="text-align:right; color: ${esIngreso ? '#166534' : '#991b1b'}; font-weight:600;">
          ${esIngreso ? '+' : '-'} ${parseFloat(m.monto).toLocaleString('es-AR', {minimumFractionDigits:2})}
        </td>
        <td style="font-size:0.75rem; color:#666;">${m.observaciones || ''}</td>
      </tr>`;
  }).join('');

  const filasSaldos = data.saldos_por_cuenta.map((s: any) => `
    <tr>
      <td>${s.metodo_pago}</td>
      <td>${s.moneda}</td>
      <td style="text-align:right; font-weight:700; color: ${parseFloat(s.saldo_al_cierre) >= 0 ? '#166534' : '#991b1b'};">
        ${parseFloat(s.saldo_al_cierre).toLocaleString('es-AR', {minimumFractionDigits:2})}
      </td>
    </tr>`).join('');

  const filasTotales = data.totales_periodo.map((t: any) => `
    <tr>
      <td style="font-weight:700">${t.moneda}</td>
      <td style="text-align:right; color:#166534; font-weight:700;">
        + ${parseFloat(t.total_ingresos).toLocaleString('es-AR', {minimumFractionDigits:2})}
      </td>
      <td style="text-align:right; color:#991b1b; font-weight:700;">
        - ${parseFloat(t.total_egresos).toLocaleString('es-AR', {minimumFractionDigits:2})}
      </td>
      <td style="text-align:right; font-weight:900; font-size:1.1rem;">
        ${(parseFloat(t.total_ingresos) - parseFloat(t.total_egresos)).toLocaleString('es-AR', {minimumFractionDigits:2})}
      </td>
    </tr>`).join('');

  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <title>Cierre ${nomMes} ${data.periodo.anio} - ${data.empresa}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Arial', sans-serif; color: #1a1a1a; padding: 32px; font-size: 13px; }
    .header { border-bottom: 3px solid #1a1a1a; padding-bottom: 16px; margin-bottom: 24px; display:flex; justify-content:space-between; align-items:flex-end; }
    .header h1 { font-size: 22px; font-weight: 900; letter-spacing: -0.5px; }
    .header .meta { text-align: right; font-size: 11px; color: #555; }
    .seccion { margin-bottom: 28px; }
    .seccion h2 { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: #555; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-bottom: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f4f4f4; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.8px; padding: 7px 10px; text-align: left; border: 1px solid #e0e0e0; }
    td { padding: 7px 10px; border: 1px solid #e8e8e8; vertical-align: top; }
    tr:nth-child(even) td { background: #fafafa; }
    .footer { margin-top: 40px; border-top: 1px solid #ccc; padding-top: 16px; font-size: 10px; color: #888; display: flex; justify-content:space-between; }
    @media print { body { padding: 0; } }
  </style></head><body>
  <div class="header">
    <div>
      <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:2px; color:#888; margin-bottom:4px;">Resumen de Movimientos</div>
      <h1>${data.empresa}</h1>
      <div style="font-size:12px; color:#444; margin-top:4px;">Cierre Contable — ${nomMes} ${data.periodo.anio}</div>
    </div>
    <div class="meta">
      <div>Período: ${data.periodo.desde} al ${data.periodo.hasta}</div>
      <div>Emisión: ${new Date().toLocaleDateString('es-AR')} ${new Date().toLocaleTimeString('es-AR', {hour:'2-digit', minute:'2-digit'})}</div>
      <div>Hoja 1</div>
    </div>
  </div>

  <div class="seccion">
    <h2>Resumen del Período</h2>
    <table>
      <thead><tr><th>Moneda</th><th>Ingresos</th><th>Egresos</th><th>Resultado Neto</th></tr></thead>
      <tbody>${filasTotales}</tbody>
    </table>
  </div>

  <div class="seccion">
    <h2>Saldos de Cuentas al Cierre</h2>
    <table>
      <thead><tr><th>Cuenta / Billetera</th><th>Moneda</th><th>Saldo</th></tr></thead>
      <tbody>${filasSaldos}</tbody>
    </table>
  </div>

  <div class="seccion">
    <h2>Detalle de Movimientos</h2>
    <table>
      <thead><tr><th>Fecha</th><th>Legajo</th><th>Tipo</th><th>Método</th><th>Mon.</th><th>Importe</th><th>Observaciones</th></tr></thead>
      <tbody>${filasMov}</tbody>
    </table>
  </div>

  <div class="footer">
    <div>${data.empresa} — Documento generado automáticamente por Traveris Pro</div>
    <div>Período: ${data.periodo.desde} / ${data.periodo.hasta}</div>
  </div>
  </body></html>`;
}
}