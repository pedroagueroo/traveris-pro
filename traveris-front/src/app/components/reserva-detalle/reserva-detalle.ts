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

