import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';
import { Router, ActivatedRoute } from '@angular/router'; // <--- Añadido ActivatedRoute
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-reserva-nueva',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './reserva-nueva.html',
  styleUrls: ['./reserva-nueva.css']
})
export class ReservaNuevaComponent implements OnInit {
  clientes: any[] = [];
  pasoActivo: number = 1;

  // Variables para Edición
  esEdicion: boolean = false;
  reservaId: string | null = null;

  totalCostoNeto: number = 0;
  subtotalVentaBruta: number = 0;
  rentabilidadEstimada: number = 0;

  reserva: any = {
    id_titular: '',
    destino_final: '',
    fecha_viaje_salida: '',
    fecha_viaje_regreso: '',
    cotizacion_dolar: 0,
    operador_mayorista: '',
    nro_expediente_operador: '',
    gastos_administrativos_usd: 0,
    bonificacion_descuento_usd: 0,
    total_venta_final_usd: 0,
    costo_total_operador_usd: 0,
    observaciones_internas: ''
  };

  acompaniantes: any[] = [];
  vuelos: any[] = [];
  servicios: any[] = [];

  mostrarModalCliente: boolean = false;
  indexAcompanianteActual: number = -1;
  nuevoClienteRapido = { nombre_completo: '', dni_pasaporte: '', email: '', empresa_nombre: '' };

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute // <--- Inyectado
  ) { }

  ngOnInit(): void {
    // Carga de clientes
    this.api.getClientesPorAgencia(this.auth.getNombreEmpresa()).subscribe({
      next: (data) => this.clientes = data,
      error: (err) => console.error(err)
    });

    // LÓGICA DE DETECCIÓN DE EDICIÓN
    this.reservaId = this.route.snapshot.paramMap.get('id');
    if (this.reservaId) {
      this.esEdicion = true;
      this.cargarDatosParaEditar(this.reservaId);
    }
  }

  cargarDatosParaEditar(id: string) {
    this.api.getReservaDetalleCompleto(id).subscribe({
      next: (data: any) => {
        // 1. Cargamos los datos generales (Titular, Destino, Fechas, etc.)
        // Al asignar 'data.reserva' a 'this.reserva', Angular llena automáticamente los [(ngModel)]
        this.reserva = { ...data.reserva };

        // 2. Cargamos los arrays de las otras zonas
        this.acompaniantes = data.acompaniantes || [];
        this.vuelos = data.vuelos || [];
        this.servicios = data.servicios || [];

        // 3. FORMATEO CRÍTICO DE FECHAS
        // Sin este split('T'), los campos de fecha aparecerán vacíos aunque tengan datos
        if (this.reserva.fecha_viaje_salida) {
          this.reserva.fecha_viaje_salida = this.reserva.fecha_viaje_salida.split('T')[0];
        }
        if (this.reserva.fecha_viaje_regreso) {
          this.reserva.fecha_viaje_regreso = this.reserva.fecha_viaje_regreso.split('T')[0];
        }

        // También formateamos las fechas de los servicios si existen
        this.servicios.forEach(s => {
          if (s.detalles.check_in) s.detalles.check_in = s.detalles.check_in.split('T')[0];
          if (s.detalles.check_out) s.detalles.check_out = s.detalles.check_out.split('T')[0];
          if (s.detalles.fecha) s.detalles.fecha = s.detalles.fecha.split('T')[0];
        });

        // 4. Recalculamos para que los totales de la pestaña 4 se vean bien de entrada
        this.recalcularTodo();

        console.log("Formulario precargado con éxito para el legajo:", id);
      },
      error: (err: any) => {
        console.error("Error al cargar:", err);
        alert("No se pudo precargar la información de la reserva.");
      }
    });
  }

  irAlPaso(n: number) { this.pasoActivo = n; }

  agregarPasajero() { this.acompaniantes.push({ id_cliente: '', tipo_pasajero: 'ADULTO', nro_asistencia_viajero: '', tiene_visa_vencimiento: '', notas_medicas_alergias: '' }); }
  quitarPasajero(i: number) { this.acompaniantes.splice(i, 1); }

  agregarVuelo() { this.vuelos.push({ aerolinea: '', nro_vuelo: '', codigo_pnr: '', origen_iata: '', destino_iata: '', fecha_salida: '' }); }
  quitarVuelo(i: number) { this.vuelos.splice(i, 1); }

  agregarServicio(tipo: string) {
    const nuevoItem: any = {
      tipo_item: tipo,
      costo_neto_operador: 0,
      venta_bruta_cliente: 0,
      detalles: {}
    };

    if (tipo === 'HOTEL') {
      nuevoItem.detalles = { hotel_nombre: '', ciudad: '', check_in: '', check_out: '', regimen: 'DESAYUNO' };
    } else if (tipo === 'VUELO') {
      nuevoItem.detalles = { aerolinea: '', nro_vuelo: '', origen: '', destino: '', pnr: '', fecha: '' };
    } else if (tipo === 'ASISTENCIA') {
      nuevoItem.detalles = { plan: '', nro_poliza: '', cobertura: '' };
    } else if (tipo === 'VISA') {
      nuevoItem.detalles = { pais: '', nro_tramite: '', fecha_vencimiento: '' };
    } else if (tipo === 'CRUCERO') { // <--- NUEVO ITEM
      nuevoItem.detalles = { crucero_nombre: '', crucero_cabina: '', crucero_itinerario: '', check_in: '', check_out: '' };
    } else if (tipo === 'SERVICIO') { // <--- EXCURSIÓN AHORA ES SERVICIO
      nuevoItem.detalles = { nombre_servicio: '', servicio_descripcion: '', fecha: '' };
    }

    this.servicios.push(nuevoItem);
  }

  quitarServicio(i: number) {
    this.servicios.splice(i, 1);
    this.recalcularTodo();
  }

  recalcularTodo() {
    this.totalCostoNeto = this.servicios.reduce((acc, s) => acc + (Number(s.costo_neto_operador) || 0), 0);
    this.subtotalVentaBruta = this.servicios.reduce((acc, s) => acc + (Number(s.venta_bruta_cliente) || 0), 0);

    const gastos = Number(this.reserva.gastos_administrativos_usd) || 0;
    const desc = Number(this.reserva.bonificacion_descuento_usd) || 0;

    this.reserva.total_venta_final_usd = this.subtotalVentaBruta + gastos - desc;
    this.reserva.costo_total_operador_usd = this.totalCostoNeto;
    this.rentabilidadEstimada = this.reserva.total_venta_final_usd - this.totalCostoNeto;
  }

  guardarReserva() {
    if (!this.reserva.id_titular) return alert("Seleccioná un titular");
    this.recalcularTodo();

    const payload = {
      ...this.reserva,
      empresa_nombre: this.auth.getNombreEmpresa(),
      vuelos: [], // Enviamos vacío porque ahora los vuelos están dentro de 'servicios'
      acompaniantes: [...this.acompaniantes],
      servicios: [...this.servicios]
    };

    if (this.esEdicion) {
      this.api.actualizarReserva(this.reservaId!, payload).subscribe({
        next: () => {
          alert("¡Legajo Maestro Actualizado!");
          this.router.navigate(['/reservas']);
        },
        error: (err: any) => alert("Error al actualizar: " + (err.error?.error || "Falla de servidor"))
      });
    } else {
      // Tu lógica de crear original...
      this.api.crearReserva(payload).subscribe({
        next: () => {
          alert("¡Legajo Maestro Creado!");
          this.router.navigate(['/reservas']);
        }
      });
    }
  }

  abrirModalRapido(index: number) {
    this.indexAcompanianteActual = index;
    this.nuevoClienteRapido = {
      nombre_completo: '',
      dni_pasaporte: '',
      email: '',
      empresa_nombre: this.auth.getNombreEmpresa()
    };
    this.mostrarModalCliente = true;
  }

  guardarClienteRapido() {
    if (!this.nuevoClienteRapido.nombre_completo) return alert("El nombre es obligatorio");

    this.api.crearCliente(this.nuevoClienteRapido).subscribe({
      next: (clienteCreado: any) => {
        this.api.getClientesPorAgencia(this.auth.getNombreEmpresa()).subscribe(data => {
          this.clientes = data;
          if (this.indexAcompanianteActual === -1) {
            this.reserva.id_titular = clienteCreado.id;
          } else {
            this.acompaniantes[this.indexAcompanianteActual].id_cliente = clienteCreado.id;
          }
          this.mostrarModalCliente = false;
        });
      },
      error: (err) => alert("Error al registrar cliente: " + (err.error?.error || 'Falla de conexión'))
    });
  }

  volver() { this.router.navigate(['/reservas']); }
}