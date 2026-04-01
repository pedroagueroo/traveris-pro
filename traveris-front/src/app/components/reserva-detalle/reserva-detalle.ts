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

  mostrarPreview: boolean = false;
  tipoDoc: 'VOUCHER' | 'COTIZACION' = 'VOUCHER';
  today = new Date();

  reserva: any = null;
  idReserva: number = 0;
  movimientos: any[] = [];

  deudaCliente: number = 0;
  porcentajeCobrado: number = 0;
  saldoARS: number = 0;
  
  deudaProveedor: number = 0;
  mostrarDesgloseServicio: boolean = false;

  // MULTIMONEDA 9 DECK
  totalesVenta = { ARS: 0, USD: 0, EUR: 0 };
  totalesCosto = { ARS: 0, USD: 0, EUR: 0 };
  saldosCobrar = { ARS: 0, USD: 0, EUR: 0 };
  saldosPagar = { ARS: 0, USD: 0, EUR: 0 };
  estaSaldada: boolean = false;

  nuevoPago: any = {
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

  // --- RECIBOS ---
  recibos: any[] = [];
  reciboPreview: any = null;
  mostrarRecibo: boolean = false;
  datosCotizacion: any = null;

  // --- TARJETA + CUOTAS ---
  datosTarjeta: any = {
    numero: '',
    vencimiento: '',
    cvv: '',
    cuotas: 1,
    interes: 0
  };
  bancoDetectado: string = '';

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    public auth: AuthService
  ) { }

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      this.idReserva = parseInt(idParam, 10);
      this.cargarData();
    }
  }

  // ============================================================
  // CARGAR DATOS PRINCIPALES
  // ============================================================

  cargarData() {
    this.api.getReservaPorId(this.idReserva).subscribe({
      next: (data: any) => {
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
      }
    });
  }

  // ============================================================
  // MOVIMIENTOS Y FINANZAS
  // ============================================================

  obtenerMovimientos() {
    this.api.getMovimientosPorReserva(this.idReserva).subscribe((movs: any[]) => {
      this.movimientos = movs;
      this.procesarFinanzas();
    });
  }

  procesarFinanzas() {
    this.totalesVenta = { ARS: 0, USD: 0, EUR: 0 };
    this.totalesCosto = { ARS: 0, USD: 0, EUR: 0 };
    
    if (this.reserva.servicios_items) {
      this.reserva.servicios_items.forEach((s: any) => {
        const monVta = s.moneda_venta || 'USD';
        const monCst = s.moneda_costo || 'USD';
        (this.totalesVenta as any)[monVta] += parseFloat(s.venta_bruta_cliente) || 0;
        (this.totalesCosto as any)[monCst] += parseFloat(s.costo_neto_operador) || 0;
      });
    }

    const gastos = parseFloat(this.reserva.gastos_administrativos_usd) || 0;
    const desc = parseFloat(this.reserva.bonificacion_descuento_usd) || 0;
    this.totalesVenta.USD += (gastos - desc);
    
    this.saldosCobrar.ARS = parseFloat(this.reserva.saldo_cobrar_ars) || 0;
    this.saldosCobrar.USD = parseFloat(this.reserva.saldo_cobrar_usd) || 0;
    this.saldosCobrar.EUR = parseFloat(this.reserva.saldo_cobrar_eur) || 0;
    
    this.saldosPagar.ARS = parseFloat(this.reserva.saldo_pagar_ars) || 0;
    this.saldosPagar.USD = parseFloat(this.reserva.saldo_pagar_usd) || 0;
    this.saldosPagar.EUR = parseFloat(this.reserva.saldo_pagar_eur) || 0;

    this.estaSaldada = 
        Math.abs(this.saldosCobrar.ARS) <= 0.01 && Math.abs(this.saldosCobrar.USD) <= 0.01 && Math.abs(this.saldosCobrar.EUR) <= 0.01 &&
        Math.abs(this.saldosPagar.ARS) <= 0.01 && Math.abs(this.saldosPagar.USD) <= 0.01 && Math.abs(this.saldosPagar.EUR) <= 0.01;

    // Legacy checks (to keep old stuff running temporarily without breaking)
    this.deudaCliente = this.saldosCobrar.USD;
    this.deudaProveedor = this.saldosPagar.USD;
    this.porcentajeCobrado = this.totalesVenta.USD > 0 ? ((this.totalesVenta.USD - this.saldosCobrar.USD) / this.totalesVenta.USD) * 100 : 0;
  }

  // ============================================================
  // DETECCIÓN DE BANCO POR BIN (primeros dígitos)
  // ============================================================

  detectarBanco() {
    const num = (this.datosTarjeta.numero || '').replace(/\s/g, '');
    if (num.length < 4) { this.bancoDetectado = ''; return; }

    const prefix = num.substring(0, 6);

    if (num.startsWith('4')) {
      if (prefix.startsWith('451761') || prefix.startsWith('450799')) { this.bancoDetectado = 'Banco Nación (Visa)'; return; }
      if (prefix.startsWith('450601') || prefix.startsWith('455002')) { this.bancoDetectado = 'Banco Provincia (Visa)'; return; }
      if (prefix.startsWith('427562') || prefix.startsWith('450903')) { this.bancoDetectado = 'Banco Galicia (Visa)'; return; }
      if (prefix.startsWith('472825') || prefix.startsWith('476507')) { this.bancoDetectado = 'BBVA (Visa)'; return; }
      if (prefix.startsWith('426211') || prefix.startsWith('403478')) { this.bancoDetectado = 'Santander (Visa)'; return; }
      if (prefix.startsWith('458767') || prefix.startsWith('415829')) { this.bancoDetectado = 'Banco Macro (Visa)'; return; }
      this.bancoDetectado = 'Visa'; return;
    }
    if (num.startsWith('5') || (parseInt(prefix) >= 222100 && parseInt(prefix) <= 272099)) {
      if (prefix.startsWith('515073') || prefix.startsWith('525547')) { this.bancoDetectado = 'Banco Nación (MC)'; return; }
      if (prefix.startsWith('517562') || prefix.startsWith('528956')) { this.bancoDetectado = 'Banco Galicia (MC)'; return; }
      if (prefix.startsWith('546553') || prefix.startsWith('525499')) { this.bancoDetectado = 'BBVA (MC)'; return; }
      if (prefix.startsWith('544407') || prefix.startsWith('548510')) { this.bancoDetectado = 'Santander (MC)'; return; }
      this.bancoDetectado = 'Mastercard'; return;
    }
    if (num.startsWith('34') || num.startsWith('37')) { this.bancoDetectado = 'American Express'; return; }
    if (prefix.startsWith('604244') || prefix.startsWith('589657')) { this.bancoDetectado = 'Cabal'; return; }
    if (prefix.startsWith('589562')) { this.bancoDetectado = 'Tarjeta Naranja'; return; }

    this.bancoDetectado = 'Otro';
  }

  // Calcula monto por cuota con interés
  get montoPorCuota(): number {
    if (!this.nuevoPago.monto || this.datosTarjeta.cuotas < 1) return 0;
    const montoConInteres = this.nuevoPago.monto * (1 + (this.datosTarjeta.interes / 100));
    return montoConInteres / this.datosTarjeta.cuotas;
  }

  get montoTotalConInteres(): number {
    if (!this.nuevoPago.monto) return 0;
    return this.nuevoPago.monto * (1 + (this.datosTarjeta.interes / 100));
  }

  // ============================================================
  // GUARDAR PAGO + GENERAR RECIBO AUTOMÁTICO + CUOTAS
  // ============================================================

  guardarPago() {
    if (!this.nuevoPago.monto) {
      return alert("El monto es obligatorio");
    }

    // Validaciones extra si es tarjeta
    if (this.nuevoPago.metodo_pago === 'TARJETA') {
      const num = (this.datosTarjeta.numero || '').replace(/\s/g, '');
      if (num.length < 13) return alert("Ingresá un número de tarjeta válido");
      if (!this.datosTarjeta.vencimiento) return alert("Ingresá la fecha de vencimiento de la tarjeta");
      if (!this.datosTarjeta.cvv || this.datosTarjeta.cvv.length < 3) return alert("Ingresá el CVV");
    }

    this.nuevoPago.id_reserva = this.idReserva;

    const esTarjeta = this.nuevoPago.metodo_pago === 'TARJETA';
    const cuotas = esTarjeta ? (this.datosTarjeta.cuotas || 1) : 1;
    const montoTotalReal = esTarjeta ? this.montoTotalConInteres : this.nuevoPago.monto;

    // Si hay cuotas > 1, generar un movimiento por cada cuota con fecha primer día de cada mes
    if (esTarjeta && cuotas > 1) {
      this.registrarPagoEnCuotas(montoTotalReal, cuotas);
    } else {
      this.registrarPagoUnico(montoTotalReal);
    }
  }

  private registrarPagoUnico(monto: number) {
    const esTarjeta = this.nuevoPago.metodo_pago === 'TARJETA';
    const payloadCaja: any = {
      ...this.nuevoPago,
      monto: monto,
      metodo_pago: this.nuevoPago.metodo_pago,
      empresa_nombre: this.auth.getNombreEmpresa(),
      categoria: 'RESERVA',
      tarjeta_banco: esTarjeta ? this.bancoDetectado : null,
      tarjeta_cuotas: esTarjeta ? this.datosTarjeta.cuotas : null,
      tarjeta_interes: esTarjeta ? this.datosTarjeta.interes : null,
      tarjeta_monto_total: esTarjeta ? this.montoTotalConInteres : null
    };

    this.api.crearMovimientoCaja(payloadCaja).subscribe({
      next: (movimientoCreado: any) => {
        this.generarReciboAutomatico(movimientoCreado.id, monto);
      },
      error: (err: any) => {
        alert("Error al registrar el pago: " + (err.error?.error || "Error de servidor"));
      }
    });
  }

  private registrarPagoEnCuotas(montoTotal: number, cuotas: number) {
    const montoPorCuota = Math.round((montoTotal / cuotas) * 100) / 100;
    const hoy = new Date();
    let cuotasRegistradas = 0;
    let errores = 0;

    for (let i = 0; i < cuotas; i++) {
      // Fecha: primer día de cada mes siguiente
      const fechaCuota = new Date(hoy.getFullYear(), hoy.getMonth() + i, 1);

      const payloadCuota: any = {
        id_reserva: this.idReserva,
        monto: montoPorCuota,
        moneda: this.nuevoPago.moneda,
        tipo_movimiento: this.nuevoPago.tipo_movimiento,
        metodo_pago: 'TARJETA',
        observaciones: `Cuota ${i + 1}/${cuotas} - ${this.bancoDetectado || 'Tarjeta'} - Legajo #${this.idReserva}`,
        empresa_nombre: this.auth.getNombreEmpresa(),
        categoria: 'RESERVA'
      };

      this.api.crearMovimientoCaja(payloadCuota).subscribe({
        next: (mov: any) => {
          cuotasRegistradas++;
          // Solo generar recibo en la primera cuota
          if (cuotasRegistradas === 1) {
            this.generarReciboAutomatico(mov.id, montoTotal);
          }
          if (cuotasRegistradas + errores === cuotas) {
            alert(`${cuotasRegistradas} cuota(s) de ${this.nuevoPago.moneda} ${montoPorCuota.toFixed(2)} registradas correctamente.`);
            this.cargarData();
            this.resetFormularioPago();
          }
        },
        error: () => {
          errores++;
          if (cuotasRegistradas + errores === cuotas) {
            alert(`Se registraron ${cuotasRegistradas} cuotas. ${errores} fallaron.`);
            this.cargarData();
          }
        }
      });
    }
  }

  private generarReciboAutomatico(idMovimiento: number, monto: number) {
    const esTarjeta = this.nuevoPago.metodo_pago === 'TARJETA';

    const payloadRecibo: any = {
      id_reserva: this.idReserva,
      id_movimiento: idMovimiento,
      id_cliente: this.reserva.id_titular,
      empresa_nombre: this.auth.getNombreEmpresa(),
      empresa_cuit: null,
      empresa_domicilio: null,
      empresa_titular: null,
      monto: monto,
      moneda: this.nuevoPago.moneda,
      metodo_pago: this.nuevoPago.metodo_pago || 'EFECTIVO',
      cliente_nombre: this.reserva.nombre_titular,
      cliente_dni: this.reserva.dni_titular,
      observaciones: this.nuevoPago.observaciones,
      concepto: `Pago legajo #${this.idReserva} - ${this.reserva.destino_final || ''}`,
      tipo_recibo: 'RECIBO_X',
      // Datos de tarjeta (solo si aplica)
      tarjeta_numero: esTarjeta ? this.datosTarjeta.numero : null,
      tarjeta_vencimiento: esTarjeta ? this.datosTarjeta.vencimiento : null,
      tarjeta_cuotas: esTarjeta ? this.datosTarjeta.cuotas : 1,
      tarjeta_interes: esTarjeta ? this.datosTarjeta.interes : 0
    };

    this.api.generarRecibo(payloadRecibo).subscribe({
      next: (reciboRes: any) => {
        const cuotasMsg = esTarjeta && this.datosTarjeta.cuotas > 1
          ? ` en ${this.datosTarjeta.cuotas} cuotas`
          : '';
        alert(`Recibo X N° ${reciboRes.recibo.nro_recibo} generado${cuotasMsg}.`);
        this.cargarData();
        this.resetFormularioPago();
      },
      error: () => {
        alert("Pago registrado, pero no se pudo generar el recibo automático.");
        this.cargarData();
        this.resetFormularioPago();
      }
    });
  }

  private resetFormularioPago() {
    this.nuevoPago.monto = 0;
    this.nuevoPago.observaciones = '';
    this.datosTarjeta = { numero: '', vencimiento: '', cvv: '', cuotas: 1, interes: 0 };
    this.bancoDetectado = '';
  }

  // ============================================================
  // RECIBOS
  // ============================================================

  cargarRecibos() {
    this.api.getRecibosPorReserva(this.idReserva).subscribe({
      next: (data: any[]) => this.recibos = data,
      error: () => this.recibos = []
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

  // ============================================================
  // ESTADO
  // ============================================================

  cambiarEstado() {
    this.api.actualizarEstadoReserva(this.idReserva, this.reserva.estado).subscribe();
  }

  // ============================================================
  // DOCUMENTOS Y ARCHIVOS
  // ============================================================

  descargarArchivo(ruta: string) {
    const url = this.api.getUrlDescarga(ruta);
    window.open(url, '_blank');
  }

  previsualizar(tipo: 'VOUCHER' | 'COTIZACION') {
    this.tipoDoc = tipo;
    this.mostrarPreview = true;
  }

  imprimir() {
    setTimeout(() => window.print(), 200);
  }

  enviarDocumento(tipo: string, conArchivos: boolean) {
    if (!this.reserva.email_titular) {
      alert("El cliente no tiene un email registrado.");
      return;
    }

    if (!confirm(`¿Enviar ${tipo} ${conArchivos ? 'con archivos adjuntos ' : ''}a ${this.reserva.email_titular}?`)) {
      return;
    }

    const datosMail: any = {
      destinatario: this.reserva.email_titular,
      nombreCliente: this.reserva.nombre_titular,
      tipoDoc: tipo,
      destino: this.reserva.destino_final,
      adjuntarArchivos: conArchivos
    };

    this.api.enviarDocumentoReserva(this.idReserva, datosMail).subscribe({
      next: (res: any) => {
        const archMsg = res.archivosAdjuntos > 0 ? ` (${res.archivosAdjuntos} archivo(s) adjunto(s))` : '';
        alert(`¡${tipo} enviado correctamente a ${this.reserva.email_titular}!${archMsg}`);
      },
      error: (err: any) => alert("Error al enviar: " + (err.error?.error || "Falla de conexión con el servidor de correo"))
    });
  }

  obtenerArchivos() {
    this.api.getArchivosReserva(this.idReserva).subscribe((data: any[]) => this.archivos = data);
  }

  onFileSelected(event: any) {
    const file: File = event.target.files[0];
    if (file) {
      const formData = new FormData();
      formData.append('archivo', file);
      this.api.subirArchivoReserva(this.idReserva, formData).subscribe(() => {
        alert("Archivo subido con éxito");
        this.obtenerArchivos();
      });
    }
  }

  eliminarArchivo(id: number) {
    if (confirm("¿Estás seguro de eliminar este documento?")) {
      this.api.eliminarArchivoReserva(id).subscribe({
        next: () => {
          alert("Archivo eliminado");
          this.obtenerArchivos();
        },
        error: () => alert("No se pudo eliminar el archivo")
      });
    }
  }

  // ============================================================
  // DEADLINE DE PAGO
  // ============================================================

  actualizarFechaPago() {
    if (!this.fechaLimiteEditable || !this.reserva) return;

    const serviciosMapeados = this.reserva.servicios_items ? this.reserva.servicios_items.map((s: any) => ({
      tipo_item: s.tipo_item,
      costo_neto_operador: s.costo_neto_operador || 0,
      venta_bruta_cliente: s.venta_bruta_cliente || 0,
      detalles: {
        hotel_nombre: s.hotel_nombre || null, ciudad: s.ciudad || null,
        check_in: s.check_in || null, check_out: s.check_out || null,
        aerolinea: s.aerolinea || null, nro_vuelo: s.nro_vuelo || null,
        origen: s.origen || null, destino: s.destino || null, pnr: s.pnr || null,
        nombre_servicio: s.nombre_item || null, servicio_descripcion: s.servicio_descripcion || null,
        crucero_nombre: s.crucero_nombre || null, crucero_cabina: s.crucero_cabina || null,
        crucero_itinerario: s.crucero_itinerario || null,
        fecha: s.excursion_fecha || null,
        hora_salida: s.hora_salida || null, hora_llegada: s.hora_llegada || null,
        regimen: s.regimen || null,
        plan: s.plan_asistencia || null, nro_poliza: s.nro_poliza || null, cobertura: s.cobertura_detalles || null,
        pais: s.pais_destino || null, nro_tramite: s.nro_tramite || null, fecha_vencimiento: s.fecha_vencimiento_visa || null
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
      error: (err: any) => alert("Error al guardar: " + (err.error?.error || "Desconocido"))
    });
  }

  imprimirVoucherTotal() { window.print(); }
}
