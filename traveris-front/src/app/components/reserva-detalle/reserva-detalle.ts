import { Component, OnInit } from '@angular/core';
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

  // --- NUEVAS PROPIEDADES (agregar junto a las existentes) ---

  recibos: any[] = [];
  reciboPreview: any = null;
  mostrarRecibo: boolean = false;

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
    cotizacion_manual: 0
  };

  archivos: any[] = [];
  fechaLimiteEditable: string = '';

  // NUEVO: Datos de cotización seguros (sin costos internos)
  datosCotizacion: any = null;

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    public auth: AuthService
  ) { }

  // Datos de configuración de empresa (pueden venir de AuthService o hardcodeados)
  empresaConfig = {
    nombre: '',       // Se llena en ngOnInit
    cuit: '',
    domicilio: '',
    titular: ''
  };


  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.idReserva = parseInt(idParam, 10);
      this.cargarData();
      this.empresaConfig.nombre = this.auth.getNombreEmpresa();
      // Nota: CUIT, domicilio y titular se pueden configurar en un futuro settings.
      // Por ahora se envían vacíos y se llenan manualmente si se desea.
    }
  }

  // --- NUEVOS MÉTODOS (agregar a la clase) ---

  cargarRecibos() {
    this.api.getRecibosPorReserva(this.idReserva).subscribe({
      next: (data) => this.recibos = data,
      error: (err) => console.error("Error al cargar recibos:", err)
    });
  }

  verRecibo(recibo: any) {
    this.reciboPreview = recibo;
    this.mostrarRecibo = true;
  }

  imprimirRecibo() {
    setTimeout(() => window.print(), 200);
  }

  anularRecibo(id: number) {
    if (confirm("¿Estás seguro de anular este recibo? La operación no se puede deshacer.")) {
      this.api.anularRecibo(id).subscribe({
        next: () => {
          alert("Recibo anulado correctamente");
          this.cargarRecibos();
        },
        error: () => alert("Error al anular el recibo")
      });
    }
  }

  // ── ENVIAR POR MAIL (mejorado: incluye empresa_nombre y tipo explícito) ──
  enviarPorMail() {
    if (!this.reserva?.email_titular) {
      alert("El cliente no tiene un email registrado. Agregá el email desde la ficha del pasajero.");
      return;
    }

    // Pedir confirmación con el tipo de documento
    const tipoLabel = this.tipoDoc === 'VOUCHER' ? 'Voucher de Servicios' : 'Cotización de Viaje';
    if (!confirm(`¿Enviar ${tipoLabel} al email ${this.reserva.email_titular}?`)) {
      return;
    }

    const datosMail = {
      destinatario: this.reserva.email_titular,
      nombreCliente: this.reserva.nombre_titular,
      tipoDoc: this.tipoDoc,
      destino: this.reserva.destino_final,
      empresa_nombre: this.auth.getNombreEmpresa()
    };

    this.api.enviarMail(this.idReserva, datosMail).subscribe({
      next: () => alert(`¡${tipoLabel} enviado correctamente a ${this.reserva.email_titular}!`),
      error: (err) => alert("Error al enviar: " + (err.error?.error || "Error de conexión con el servidor de correo"))
    });
  }

  eliminarArchivo(id: number) {
    if (confirm("¿Estás seguro de eliminar este documento?")) {
      this.api.eliminarArchivoReserva(id).subscribe({
        next: () => {
          alert("Archivo eliminado");
          this.obtenerArchivos();
        },
        error: (err) => alert("No se pudo eliminar el archivo: " + (err.error?.error || 'Error'))
      });
    }
  }

  obtenerArchivos() {
    this.api.getArchivosReserva(this.idReserva).subscribe(data => this.archivos = data);
  }

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;

    // Validación de tamaño en frontend (10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert("El archivo excede el límite de 10MB.");
      return;
    }

    // Validación de tipo en frontend
    const tiposPermitidos = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain'];

    if (!tiposPermitidos.includes(file.type)) {
      alert("Tipo de archivo no permitido. Solo se aceptan: PDF, imágenes, documentos Office y texto.");
      return;
    }

    const formData = new FormData();
    formData.append('archivo', file);

    this.api.subirArchivoReserva(this.idReserva, formData).subscribe({
      next: () => {
        alert("Archivo subido con éxito");
        this.obtenerArchivos();
      },
      error: (err) => alert("Error al subir: " + (err.error?.error || 'Error de conexión'))
    });
  }

  previsualizar(tipo: 'VOUCHER' | 'COTIZACION') {
    this.tipoDoc = tipo;

    // Si es cotización, cargar datos seguros del endpoint dedicado
    if (tipo === 'COTIZACION') {
      this.api.getCotizacionReserva(this.idReserva).subscribe({
        next: (data) => {
          this.datosCotizacion = data;
          this.mostrarPreview = true;
        },
        error: () => {
          // Fallback: usar datos de la reserva pero sin mostrar costos
          this.datosCotizacion = null;
          this.mostrarPreview = true;
        }
      });
    } else {
      // Verificar que tenga servicios cargados antes de mostrar voucher
      if (!this.reserva?.servicios_items || this.reserva.servicios_items.length === 0) {
        alert("Esta reserva no tiene servicios cargados. Agregá servicios antes de generar el voucher.");
        return;
      }
      this.mostrarPreview = true;
    }
  }

  imprimir() {
    setTimeout(() => {
      window.print();
    }, 200);
  }

  cargarData() {
    this.api.getReservaPorId(this.idReserva).subscribe({
      next: (data) => {
        this.reserva = data;

        if (this.reserva.fecha_limite_pago) {
          this.fechaLimiteEditable = this.reserva.fecha_limite_pago.split('T')[0];
        } else if (this.reserva.fecha_viaje_salida) {
          const salida = new Date(this.reserva.fecha_viaje_salida);
          salida.setDate(salida.getDate() - 30);
          this.fechaLimiteEditable = salida.toISOString().split('T')[0];
        }

        this.obtenerMovimientos();
        this.obtenerArchivos();
        this.cargarRecibos();
      },
      error: (err) => {
        alert("Error al cargar la reserva: " + (err.error?.error || 'No encontrada'));
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
    let totalPagadoOperadorUSD = 0;
    this.saldoARS = 0;

    this.movimientos.forEach(m => {
      const montoNum = Math.abs(parseFloat(m.monto));
      if (m.moneda === 'USD') {
        if (m.tipo_movimiento === 'PAGO_CLIENTE') {
          this.totalCobradoUSD += montoNum;
        }
        if (m.tipo_movimiento === 'PAGO_PROVEEDOR') {
          totalPagadoOperadorUSD += montoNum;
        }
      } else if (m.moneda === 'ARS') {
        if (m.tipo_movimiento === 'PAGO_CLIENTE') this.saldoARS += montoNum;
      }
    });

    this.deudaCliente = totalVenta - this.totalCobradoUSD;
    this.deudaProveedor = costoTotal - totalPagadoOperadorUSD;
    this.porcentajeCobrado = totalVenta > 0 ? (this.totalCobradoUSD / totalVenta) * 100 : 0;
  }

  // --- REEMPLAZAR guardarPago() CON ESTE ---

  guardarPago() {
    if (!this.nuevoPago.monto || this.nuevoPago.monto <= 0) {
      return alert("El monto debe ser mayor a 0");
    }

    this.nuevoPago.id_reserva = this.idReserva;

    // Preparar datos para caja contable
    const payloadCaja: any = {
      ...this.nuevoPago,
      empresa_nombre: this.auth.getNombreEmpresa(),
      categoria: 'RESERVA'
    };

    // 1. Registrar el movimiento en caja
    this.api.crearMovimientoCaja(payloadCaja).subscribe({
      next: (movimientoCreado: any) => {

        // 2. Generar recibo automático
        const payloadRecibo: any = {
          id_reserva: this.idReserva,
          id_movimiento: movimientoCreado.id,
          id_cliente: this.reserva.id_titular,
          empresa_nombre: this.auth.getNombreEmpresa(),
          empresa_cuit: this.empresaConfig.cuit || null,
          empresa_domicilio: this.empresaConfig.domicilio || null,
          empresa_titular: this.empresaConfig.titular || null,
          monto: this.nuevoPago.monto,
          moneda: this.nuevoPago.moneda,
          metodo_pago: this.nuevoPago.metodo_pago || 'EFECTIVO',
          cliente_nombre: this.reserva.nombre_titular,
          cliente_dni: this.reserva.dni_titular,
          observaciones: this.nuevoPago.observaciones,
          concepto: `Pago legajo #${this.idReserva} - ${this.reserva.destino_final || ''}`,
          tipo_recibo: 'RECIBO_X'
        };

        this.api.generarRecibo(payloadRecibo).subscribe({
          next: (reciboRes: any) => {
            alert(`Movimiento asentado. Recibo X N° ${reciboRes.recibo.nro_recibo} generado.`);
            this.cargarData();
            this.cargarRecibos();
            this.nuevoPago.monto = 0;
            this.nuevoPago.observaciones = '';
          },
          error: (err: any) => {
            // El pago se registró pero el recibo falló — no es crítico
            console.error("Error al generar recibo:", err);
            alert("Pago registrado, pero no se pudo generar el recibo automático.");
            this.cargarData();
            this.nuevoPago.monto = 0;
          }
        });
      },
      error: (err: any) => {
        alert("Error al registrar el pago: " + (err.error?.error || "Error de servidor"));
      }
    });
  }

  cambiarEstado() {
    this.api.actualizarEstadoReserva(this.idReserva, this.reserva.estado).subscribe({
      next: () => { },
      error: (err) => alert("Error al cambiar estado: " + (err.error?.error || 'Error'))
    });
  }

  imprimirVoucherTotal() { window.print(); }

  actualizarFechaPago() {
    if (!this.fechaLimiteEditable || !this.reserva) return;

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