import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ApiService } from '../../services/api';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { InputMaskDirective } from '../../directives/input-mask.directive';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

@Component({
  selector: 'app-reserva-detalle',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, InputMaskDirective],
  templateUrl: './reserva-detalle.html',
  styleUrls: ['./reserva-detalle.css']
})
export class ReservaDetalleComponent implements OnInit {

  mostrarPreview: boolean = false;
  imprimiendoVoucher: boolean = false;
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

  // --- UI TOGGLES ---
  mostrarItinerario: boolean = false;
  mostrarRecibos: boolean = false;
  paginaRecibos: number = 0;
  mostrarDesgloseContable: boolean = false;

  get recibosPaginados(): any[] {
    const start = this.paginaRecibos * 3;
    return this.recibos.slice(start, start + 3);
  }
  get totalPaginasRecibos(): number {
    return Math.ceil(this.recibos.length / 3);
  }

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

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      this.idReserva = Number(params.get('id'));
      if (this.idReserva) {
        this.cargarData();
        this.cargarMetodosFinancieros();
      }
    });
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
  // FINANZAS: Tarjetas y Transferencias (Importadas de API)
  // ============================================================
  tarjetasGuardadas: any[] = [];
  transferenciasGuardadas: any[] = [];

  cargarMetodosFinancieros() {
      const empresa = this.auth.getNombreEmpresa();
      this.api.getTarjetasGuardadas(empresa).subscribe((res: any[]) => this.tarjetasGuardadas = res);
      this.api.getTransferenciasGuardadas(empresa).subscribe((res: any[]) => this.transferenciasGuardadas = res);
  }

  // Modal Tarjeta
  mostrarModalNuevaTarjeta: boolean = false;
  nuevaTarjeta: any = { nombre_banco: '', franquicia: 'VISA', nro_tarjeta_completo: '', vencimiento: '', cuotas: 1 };

  detectarBancoFrontend(nro: string) {
    const num = (nro || '').replace(/\s/g, '');
    if (num.length < 6) { this.bancoDetectado = ''; return; }
    const p = num.substring(0, 6);
    if (num.startsWith('4')) {
      if (p.startsWith('451761') || p.startsWith('450799')) this.bancoDetectado = 'Banco Nación (Visa)';
      else if (p.startsWith('450601') || p.startsWith('455002')) this.bancoDetectado = 'Banco Provincia (Visa)';
      else if (p.startsWith('427562') || p.startsWith('450903')) this.bancoDetectado = 'Banco Galicia (Visa)';
      else if (p.startsWith('472825') || p.startsWith('476507')) this.bancoDetectado = 'BBVA (Visa)';
      else if (p.startsWith('426211') || p.startsWith('403478')) this.bancoDetectado = 'Santander (Visa)';
      else this.bancoDetectado = 'Visa';
    } else if (num.startsWith('5')) {
      if (p.startsWith('515070') || p.startsWith('520063')) this.bancoDetectado = 'Banco Nación (MC)';
      else if (p.startsWith('531463')) this.bancoDetectado = 'Banco Galicia (MC)';
      else this.bancoDetectado = 'Mastercard';
    } else if (num.startsWith('3')) {
      this.bancoDetectado = 'American Express';
    } else {
      this.bancoDetectado = '';
    }
    if (this.bancoDetectado) this.nuevaTarjeta.nombre_banco = this.bancoDetectado;
  }

  onMetodoPagoChange() {
      if (this.nuevoPago.metodo_pago === 'ADD_TARJETA') {
          this.nuevaTarjeta = { nombre_banco: '', franquicia: 'VISA', nro_tarjeta_completo: '', vencimiento: '', cuotas: 1 };
          this.bancoDetectado = '';
          this.mostrarModalNuevaTarjeta = true;
          this.nuevoPago.metodo_pago = 'EFECTIVO'; // reset while modal is open
      } else if (this.nuevoPago.metodo_pago === 'ADD_TRANSFERENCIA') {
          const alias = prompt("Banco o Alias destino de la Transferencia:");
          if (alias) {
              const payload = {
                  empresa_nombre: this.auth.getNombreEmpresa(),
                  banco_alias: alias,
                  cbu_cvu: '',
                  titular: ''
              };
              this.api.agregarTransferencia(payload).subscribe({
                  next: (res) => {
                      this.transferenciasGuardadas.push(res);
                      this.nuevoPago.metodo_pago = 'TRANSFERENCIA_' + res.id;
                      this.nuevoPago.observaciones = (this.nuevoPago.observaciones || '') + ` [Transferencia a ${res.banco_alias}]`;
                  },
                  error: () => { alert("Error al agregar medio de transferencia"); this.nuevoPago.metodo_pago = 'EFECTIVO'; }
              });
          } else {
              this.nuevoPago.metodo_pago = 'EFECTIVO';
          }
      }
  }

  // ============================================================
  // GUARDAR PAGO + GENERAR RECIBO AUTOMÁTICO
  // ============================================================

  guardarPago() {
    if (!this.nuevoPago.monto) {
      return alert("El monto es obligatorio");
    }

    this.nuevoPago.id_reserva = this.idReserva;

    const payloadCaja: any = {
      ...this.nuevoPago,
      empresa_nombre: this.auth.getNombreEmpresa(),
      categoria: 'RESERVA',
      tarjeta_banco: null,
      tarjeta_cuotas: null,
      tarjeta_interes: null,
      tarjeta_monto_total: null,
      banco: null
    };

    if (payloadCaja.metodo_pago.startsWith('TARJETA_')) {
      const id = parseInt(payloadCaja.metodo_pago.split('_')[1]);
      const tarjeta = this.tarjetasGuardadas.find(t => t.id === id);
      payloadCaja.metodo_pago = 'TARJETA';
      payloadCaja.banco = tarjeta ? `${tarjeta.nombre_banco} (${tarjeta.nro_tarjeta_completo})` : 'Tarjeta';
    } else if (payloadCaja.metodo_pago.startsWith('TRANSFERENCIA_')) {
      const id = parseInt(payloadCaja.metodo_pago.split('_')[1]);
      const transf = this.transferenciasGuardadas.find(t => t.id === id);
      payloadCaja.metodo_pago = 'TRANSFERENCIA';
      payloadCaja.banco = transf ? transf.banco_alias : 'Transferencia';
    } else if (payloadCaja.metodo_pago === 'TRANSFERENCIA') {
       // Si es ADD_TRANSFERENCIA, el método se establece dinámicamente a 'TRANSFERENCIA' 
       // pero asumo que 'banco' ya debería estar en this.nuevoPago si modifiqué onMetodoPagoChange
       // Wait, onMetodoPagoChange adds it to observaciones, but we want it in banco too! Let's do that!
    }

    this.api.crearMovimientoCaja(payloadCaja).subscribe({
      next: (movimientoCreado: any) => {
        this.generarReciboAutomatico(movimientoCreado.id, this.nuevoPago.monto);
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

  enviarDocumento(tipo: 'VOUCHER' | 'COTIZACION', conArchivos: boolean) {
    if (!this.reserva.email_titular) {
      alert("El cliente no tiene un email registrado.");
      return;
    }

    if (!confirm(`¿Generar documento y enviarlo ${conArchivos ? 'con archivos adjuntos ' : ''}por correo a ${this.reserva.email_titular}?`)) {
      return;
    }

    // Forza renderizado en DOM para capturar
    this.tipoDoc = tipo;
    this.mostrarPreview = true;

    // Pequeño timeout para que Angular dibuje el `#documento-imprimible`
    setTimeout(async () => {
      const element = document.getElementById('documento-imprimible');
      if (!element) {
        this.mostrarPreview = false;
        return alert("Error al visualizar el documento para generación.");
      }

      try {
        const canvas = await html2canvas(element, { scale: 2, useCORS: true });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        
        // A4 dimension: 210 x 297 mm
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
        
        pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
        const pdfBase64 = pdf.output('datauristring'); // string base64 completo
        
        this.mostrarPreview = false;

        const datosMail: any = {
          destinatario: this.reserva.email_titular,
          nombreCliente: this.reserva.nombre_titular,
          tipoDoc: tipo,
          destino: this.reserva.destino_final,
          adjuntarArchivos: conArchivos,
          pdfBase64: pdfBase64
        };

        this.api.enviarDocumentoReserva(this.idReserva, datosMail).subscribe({
          next: (res: any) => {
            const archMsg = res.archivosAdjuntos > 0 ? ` (${res.archivosAdjuntos} archivo(s) adjunto(s))` : '';
            alert(`¡${tipo} enviado correctamente a ${this.reserva.email_titular}!${archMsg}`);
          },
          error: (err: any) => alert("Error al enviar: " + (err.error?.error || "Falla de conexión con el servidor de correo SMTP"))
        });

      } catch (err) {
        console.error(err);
        this.mostrarPreview = false;
        alert("Error procesando imagen para PDF.");
      }
    }, 600); // 600ms de ventana para renderizado completo
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

  // Function removed as per user request

  descargarReciboPDF(id: number) {
    const url = this.api.getReciboPDFUrl(id);
    window.open(url, '_blank');
  }

  confirmarNuevaTarjeta() {
    const nro = this.nuevaTarjeta.nro_tarjeta_completo.replace(/\s/g, '');
    if (nro.length < 16) return alert("Ingresá los 16 dígitos de la tarjeta");
    if (!this.nuevaTarjeta.vencimiento || this.nuevaTarjeta.vencimiento.length < 5) return alert("Ingresá el vencimiento MM/YY");

    const payload = {
      empresa_nombre: this.auth.getNombreEmpresa(),
      nombre_banco: this.nuevaTarjeta.nombre_banco || this.bancoDetectado || 'Desconocido',
      franquicia: this.nuevaTarjeta.franquicia,
      nro_tarjeta_completo: this.nuevaTarjeta.nro_tarjeta_completo,
      vencimiento: this.nuevaTarjeta.vencimiento
    };

    this.api.crearTarjetaGuardada(payload).subscribe({
      next: (res: any) => {
        this.tarjetasGuardadas.push(res);
        this.nuevoPago.metodo_pago = 'TARJETA_' + res.id;
        this.nuevoPago.observaciones = (this.nuevoPago.observaciones || '') +
          ` [Pagado con ${res.nombre_banco} - *${nro.slice(-4)}]`;
        this.mostrarModalNuevaTarjeta = false;
      },
      error: () => { alert("Error al agregar tarjeta"); }
    });
  }
}

