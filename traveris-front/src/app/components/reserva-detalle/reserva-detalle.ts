import { Component, NgModule, OnInit } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ApiService } from '../../services/api';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-reserva-detalle',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './reserva-detalle.html',
  styleUrls: ['./reserva-detalle.css']
})
export class ReservaDetalleComponent implements OnInit {

  mostrarPreview: boolean = false;
  tipoDoc: 'VOUCHER' | 'COTIZACION' = 'VOUCHER';
  today = new Date();

  reserva: any = null;
  idReserva: number = 0;
  movimientos: any[] = [];

  deudaCliente: number = 0;
  totalCobradoUSD: number = 0;
  porcentajeCobrado: number = 0;
  saldoARS: number = 0;

  deudaProveedor: number = 0;

  nuevoPago = {
    id_reserva: 0,
    monto: 0,
    moneda: 'USD',
    tipo_movimiento: 'PAGO_CLIENTE',
    metodo_pago: 'EFECTIVO',
    observaciones: '',
    cotizacion_manual: 0 // 👈 Agregamos esto para corregir el error
  };

  archivos: any[] = [];

  fechaLimiteEditable: string = '';



  constructor(private route: ActivatedRoute, private api: ApiService, public auth: AuthService) { }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.idReserva = parseInt(idParam, 10);
      this.cargarData();
    }
  }

  imprimirVoucher() {
    this.api.getReservaDetalleCompleto(this.reserva.id).subscribe({
      next: (data) => {
        const html = this.buildVoucherHTML(data);
        const w = window.open('', '_blank');
        w!.document.write(html);
        w!.document.close();
        w!.print();
      }
    });
  }

  private buildVoucherHTML(data: any): string {
    const iconos: any = { VUELO: '✈️', HOTEL: '🏨', ASISTENCIA: '🛡️', CRUCERO: '🛳️', VISA: '📋', SERVICIO: '⚙️' };

    const filasServicios = (data.servicios_items || []).map((s: any) => `
    <div style="border:1px solid #e0e0e0; border-radius:8px; padding:16px 20px; margin-bottom:12px; page-break-inside:avoid;">
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <span style="font-size:1.5rem;">${iconos[s.tipo_item] || '📌'}</span>
        <div>
          <span style="font-size:10px; text-transform:uppercase; font-weight:800; letter-spacing:1px; color:#888; background:#f4f4f4; padding:2px 8px; border-radius:20px;">${s.tipo_item}</span>
          <div style="font-size:1.1rem; font-weight:800; margin-top:4px;">${s.hotel_nombre || s.aerolinea || s.crucero_nombre || s.excursion_nombre || s.plan_asistencia || s.nombre_item || '-'}</div>
        </div>
        ${s.pnr ? `<div style="margin-left:auto; background:#1a1a2e; color:white; padding:4px 12px; border-radius:6px; font-weight:700; font-size:0.9rem; font-family:monospace;">${s.pnr}</div>` : ''}
      </div>
      <div style="background:#f8f8f8; border-radius:6px; padding:12px; font-size:0.85rem; font-family:monospace; white-space:pre-wrap; color:#333;">${s.servicio_descripcion || s.crucero_itinerario || (s.check_in ? `Check-in: ${new Date(s.check_in).toLocaleDateString('es-AR')}\nCheck-out: ${new Date(s.check_out).toLocaleDateString('es-AR')} — ${s.regimen || ''}` : '') || 'Detalles adjuntos.'}</div>
    </div>`).join('');

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <title>Voucher de Viaje — ${data.nombre_titular}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; color: #1a1a1a; }
    .page { max-width: 800px; margin: 0 auto; padding: 40px; }
    .header { display:flex; justify-content:space-between; align-items:flex-end; border-bottom:3px solid #1a1a2e; padding-bottom:16px; margin-bottom:24px; }
    @media print { body { padding: 0; } }
  </style></head><body>
  <div class="page">
    <div class="header">
      <div>
        <div style="font-size:11px; text-transform:uppercase; letter-spacing:2px; color:#888; margin-bottom:4px;">Voucher de Servicios</div>
        <div style="font-size:24px; font-weight:900;">${data.empresa_nombre || 'Traveris Turismo'}</div>
      </div>
      <div style="text-align:right; font-size:12px; color:#555;">
        <div style="font-weight:700; font-size:1.1rem;">OP-${String(data.id).padStart(6, '0')}</div>
        <div>Emisión: ${new Date().toLocaleDateString('es-AR')}</div>
      </div>
    </div>

    <div style="background:#f8f8f8; border-radius:8px; padding:20px; margin-bottom:24px; display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div><div style="font-size:10px; text-transform:uppercase; color:#888; font-weight:700; margin-bottom:3px;">Pasajero Principal</div>
        <div style="font-size:1.3rem; font-weight:800;">${data.nombre_titular}</div></div>
      <div><div style="font-size:10px; text-transform:uppercase; color:#888; font-weight:700; margin-bottom:3px;">Destino</div>
        <div style="font-size:1.3rem; font-weight:800;">${data.destino_final || 'A confirmar'}</div></div>
    </div>

    <div style="font-size:11px; text-transform:uppercase; letter-spacing:1.5px; color:#888; font-weight:800; border-bottom:1px solid #ddd; padding-bottom:8px; margin-bottom:16px;">
      Servicios Contratados
    </div>
    ${filasServicios}

    <div style="margin-top:32px; padding-top:16px; border-top:1px solid #eee; font-size:10px; color:#aaa; display:flex; justify-content:space-between;">
      <span>${data.empresa_nombre} — Voucher de Viaje Oficial</span>
      <span>OP-${String(data.id).padStart(6, '0')}</span>
    </div>
  </div></body></html>`;
  }

  imprimirCotizacion() {
    this.api.getCotizacionCliente(this.reserva.id).subscribe({
      next: (data) => {
        const html = this.buildCotizacionHTML(data);
        const w = window.open('', '_blank');
        w!.document.write(html);
        w!.document.close();
        w!.print();
      }
    });
  }

  private buildCotizacionHTML(data: any): string {
    const iconos: any = { VUELO: '✈️', HOTEL: '🏨', ASISTENCIA: '🛡️', CRUCERO: '🛳️', VISA: '📋', SERVICIO: '⚙️', EXCURSION: '🗺️' };

    const filasItems = data.items.map((item: any) => {
      const titulo = item.hotel_nombre || item.aerolinea || item.crucero_nombre || item.excursion_nombre || item.plan_asistencia || item.nombre_item || item.tipo_item;
      const detalle = item.check_in ? `Check-in: ${new Date(item.check_in).toLocaleDateString('es-AR')} | Check-out: ${new Date(item.check_out).toLocaleDateString('es-AR')} — ${item.regimen || ''}` :
        item.origen ? `${item.origen} → ${item.destino} | Vuelo: ${item.nro_vuelo || '-'}` :
          item.ciudad ? `Ciudad: ${item.ciudad}` : '';
      return `
      <tr>
        <td style="padding: 12px 16px;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="font-size:1.4rem;">${iconos[item.tipo_item] || '📌'}</span>
            <div>
              <div style="font-weight:700; font-size:0.95rem;">${titulo}</div>
              <div style="font-size:0.8rem; color:#666; margin-top:2px;">${detalle}</div>
            </div>
          </div>
        </td>
        <td style="text-align:right; padding:12px 16px; font-weight:700; font-size:0.95rem; white-space:nowrap;">
          USD ${parseFloat(item.venta_bruta_cliente).toLocaleString('es-AR', { minimumFractionDigits: 2 })}
        </td>
      </tr>`;
    }).join('');

    return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
  <title>Cotización #${data.reserva.id}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: Arial, sans-serif; color: #1a1a1a; background: #f0f2f5; }
    .page { max-width: 780px; margin: 0 auto; background: white; }
    .header-banda { background: #1a1a2e; color: white; padding: 32px 40px; }
    .header-banda h1 { font-size: 26px; font-weight: 900; letter-spacing: -0.5px; }
    .header-banda .sub { font-size: 12px; opacity: 0.7; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 6px; }
    .doc-meta { background: #16213e; color: #aaa; padding: 12px 40px; font-size: 11px; display:flex; justify-content:space-between; }
    .cliente-box { padding: 24px 40px; border-bottom: 1px solid #eee; }
    .cliente-box h2 { font-size: 11px; text-transform:uppercase; letter-spacing:1.5px; color:#888; margin-bottom:8px; }
    .cliente-box .nombre { font-size: 22px; font-weight: 800; }
    .cliente-box .destino { font-size: 15px; color: #444; margin-top: 4px; }
    .items-table { width: 100%; border-collapse: collapse; margin: 24px 0; }
    .items-table thead th { background: #f7f7f7; padding: 10px 16px; font-size: 10px; text-transform: uppercase; letter-spacing: 1px; font-weight: 800; text-align: left; border-bottom: 2px solid #1a1a2e; }
    .items-table tbody tr { border-bottom: 1px solid #f0f0f0; }
    .items-table tbody tr:hover { background: #fafafa; }
    .total-banda { background: #1a1a2e; color: white; padding: 20px 40px; display:flex; justify-content:space-between; align-items:center; }
    .total-banda .label { font-size: 12px; opacity:0.7; text-transform:uppercase; letter-spacing:1.5px; }
    .total-banda .monto { font-size: 28px; font-weight: 900; }
    .footer-doc { padding: 20px 40px; font-size: 10px; color: #999; border-top: 1px solid #eee; display:flex; justify-content:space-between; }
    .aviso { padding: 16px 40px; background: #fffbeb; border-left: 4px solid #f59e0b; font-size: 11px; color: #92400e; }
    @media print { body { background: white; } }
  </style></head><body>
  <div class="page">
    <div class="header-banda">
      <div class="sub">Propuesta de Viaje</div>
      <h1>${data.reserva.empresa_nombre || 'Traveris Turismo'}</h1>
    </div>
    <div class="doc-meta">
      <span>Cotización N° COT-${String(data.reserva.id).padStart(6, '0')}</span>
      <span>Emisión: ${new Date().toLocaleDateString('es-AR')}</span>
      <span>Vigencia: 48 hs.</span>
    </div>
    <div class="cliente-box">
      <h2>Destinatario</h2>
      <div class="nombre">${data.reserva.nombre_completo}</div>
      <div class="destino"><strong>Destino:</strong> ${data.reserva.destino_final || 'A definir'}</div>
    </div>
    <div style="padding: 0 24px;">
      <table class="items-table">
        <thead><tr><th>Servicio / Detalle</th><th style="text-align:right;">Precio</th></tr></thead>
        <tbody>${filasItems}</tbody>
      </table>
    </div>
    <div class="total-banda">
      <div><div class="label">Total del Paquete</div><div style="font-size:11px; opacity:0.6; margin-top:2px;">Impuestos incluidos</div></div>
      <div class="monto">USD ${data.total_cliente.toLocaleString('es-AR', { minimumFractionDigits: 2 })}</div>
    </div>
    <div class="aviso">⚠️ Esta cotización tiene vigencia de 48 horas. Los precios están sujetos a disponibilidad y variación de tarifas aéreas.</div>
    <div class="footer-doc">
      <span>${data.reserva.empresa_nombre} — Documento exclusivo para el cliente</span>
      <span>No incluye costos operativos ni márgenes internos</span>
    </div>
  </div></body></html>`;
  }

  enviarPorMail() {
    if (!this.reserva.email_titular) {
      alert("El cliente no tiene un email registrado.");
      return;
    }

    const datosMail = {
      destinatario: this.reserva.email_titular,
      nombreCliente: this.reserva.nombre_titular,
      tipoDoc: this.tipoDoc,
      destino: this.reserva.destino_final
    };

    this.api.enviarMail(this.idReserva, datosMail).subscribe({
      next: () => alert("¡Email enviado correctamente al cliente!"),
      error: () => alert("Hubo un error al conectar con el servidor de correo.")
    });
  }

  eliminarArchivo(id: number) {
    if (confirm("¿Estás seguro de eliminar este documento?")) {
      this.api.eliminarArchivoReserva(id).subscribe({
        next: () => {
          alert("Archivo eliminado");
          this.obtenerArchivos(); // Refresca la lista
        },
        error: (err) => alert("No se pudo eliminar el archivo")
      });
    }
  }

  // Cargar al iniciar
  obtenerArchivos() {
    this.api.getArchivosReserva(this.idReserva).subscribe(data => this.archivos = data);
  }

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      const formData = new FormData();
      formData.append('archivo', file);

      // Llamamos al API (necesitás crear esta función en el ApiService)
      this.api.subirArchivoReserva(this.idReserva, formData).subscribe(() => {
        alert("Archivo subido con éxito");
        this.obtenerArchivos(); // Recargamos la lista
      });
    }
  }

  previsualizar(tipo: 'VOUCHER' | 'COTIZACION') {
    this.tipoDoc = tipo;
    this.mostrarPreview = true;
  }

  imprimir() {
    // Le damos un pequeño delay para que el navegador procese el CSS de impresión
    setTimeout(() => {
      window.print();
    }, 200);
  }

  // En el cargarData(), seteamos la fecha en el input
  cargarData() {
    this.api.getReservaPorId(this.idReserva).subscribe({
      next: (data) => {
        this.reserva = data;

        // Si la reserva ya tiene fecha, la usamos. 
        // Si no, calculamos 30 días antes de la salida para mostrarla en el input como sugerencia.
        if (this.reserva.fecha_limite_pago) {
          this.fechaLimiteEditable = this.reserva.fecha_limite_pago.split('T')[0];
        } else if (this.reserva.fecha_viaje_salida) {
          const salida = new Date(this.reserva.fecha_viaje_salida);
          salida.setDate(salida.getDate() - 30);
          this.fechaLimiteEditable = salida.toISOString().split('T')[0];
        }

        this.obtenerMovimientos();
      }
    });
  }

  obtenerMovimientos() {
    this.api.getMovimientosPorReserva(this.idReserva).subscribe(movs => {
      this.movimientos = movs;
      this.procesarFinanzas();
    });
  }

  procesarFinanzas() {
    const totalVenta = parseFloat(this.reserva.total_venta_final_usd || 0);
    const costoTotal = parseFloat(this.reserva.costo_total_operador_usd || 0);

    this.totalCobradoUSD = 0;
    let totalPagadoOperadorUSD = 0; // Nueva variable local
    this.saldoARS = 0;

    this.movimientos.forEach(m => {
      const montoNum = Math.abs(parseFloat(m.monto));
      if (m.moneda === 'USD') {
        if (m.tipo_movimiento === 'PAGO_CLIENTE') {
          this.totalCobradoUSD += montoNum;
        }
        if (m.tipo_movimiento === 'PAGO_PROVEEDOR') {
          totalPagadoOperadorUSD += montoNum; // Sumamos lo pagado al operador
        }
      } else if (m.moneda === 'ARS') {
        if (m.tipo_movimiento === 'PAGO_CLIENTE') this.saldoARS += montoNum;
      }
    });

    // Calculamos las deudas finales
    this.deudaCliente = totalVenta - this.totalCobradoUSD;
    this.deudaProveedor = costoTotal - totalPagadoOperadorUSD; // 👈 Esto arregla el 0.00

    this.porcentajeCobrado = totalVenta > 0 ? (this.totalCobradoUSD / totalVenta) * 100 : 0;


    // Dentro de procesarFinanzas()
    this.movimientos.forEach(m => {
      const montoNum = Math.abs(parseFloat(m.monto));

      if (m.tipo_movimiento === 'PAGO_CLIENTE') {
        if (m.moneda === 'USD') {
          this.totalCobradoUSD += montoNum;
        } else {
          // Si pagó en ARS, usamos la cotización que guardamos en observaciones o una variable de la DB
          // Por ahora, asumimos que el usuario registró el equivalente en el momento
          // Tip: Podés guardar en el campo 'observaciones' la leyenda "Cobro ARS equivalent a USD XXX"
          this.totalCobradoUSD += (m.monto_en_usd_equivalente || 0);
        }
      }
    });

  }

  guardarPago() {
    this.nuevoPago.id_reserva = this.idReserva;

    // Agregamos la categoría automática por ser desde el detalle de reserva
    const pagoFinal = { ...this.nuevoPago, categoria: 'RESERVA' };

    this.api.crearMovimientoCaja(this.nuevoPago).subscribe(() => {
      alert("Movimiento Asentado");
      this.cargarData();
      this.nuevoPago.monto = 0;
    });
  }

  cambiarEstado() {
    this.api.actualizarEstadoReserva(this.idReserva, this.reserva.estado).subscribe();
  }

  imprimirVoucherTotal() { window.print(); }

  // ... dentro de la clase ReservaDetalleComponent

  actualizarFechaPago() {
    if (!this.fechaLimiteEditable || !this.reserva) return;

    // Mapeamos asegurando que si algún campo es null, se envíe como null y no rompa el itinerario
    const serviciosMapeados = this.reserva.servicios_items ? this.reserva.servicios_items.map((s: any) => ({
      tipo_item: s.tipo_item,
      costo_neto_operador: s.costo_neto_operador || 0,
      venta_bruta_cliente: s.venta_bruta_cliente || 0,
      detalles: {
        hotel_nombre: s.hotel_nombre || null, ciudad: s.ciudad || null, check_in: s.check_in || null, check_out: s.check_out || null,
        aerolinea: s.aerolinea || null, nro_vuelo: s.nro_vuelo || null, origen: s.origen || null, destino: s.destino || null, pnr: s.pnr || null,
        nombre_servicio: s.nombre_item || null, servicio_descripcion: s.servicio_descripcion || null,
        crucero_nombre: s.crucero_nombre || null, crucero_cabina: s.crucero_cabina || null, crucero_itinerario: s.crucero_itinerario || null,
        fecha: s.excursion_fecha || null
      }
    })) : [];

    const datosActualizar = {
      ...this.reserva,
      servicios: serviciosMapeados,
      acompaniantes: this.reserva.pasajeros || [],
      fecha_limite_pago: this.fechaLimiteEditable
    };

    this.api.actualizarReserva(this.idReserva, datosActualizar).subscribe({
      next: () => {
        alert("¡Fecha actualizada! Si el saldo es mayor a 0, aparecerá en el Radar.");
        this.cargarData();
      },
      error: (err) => alert("Error al guardar: " + (err.error?.error || "Desconocido"))
    });
  }
}

