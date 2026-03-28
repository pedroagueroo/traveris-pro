import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';
import { Router, ActivatedRoute } from '@angular/router';
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
  reservaId: number | null = null;

  totalCostoNeto: number = 0;
  subtotalVentaBruta: number = 0;
  rentabilidadEstimada: number = 0;

  // Punto 3: Búsqueda de clientes
  busquedaCliente: string = '';

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

  // Punto 2: Modal alta rápida
  mostrarModalCliente: boolean = false;
  indexAcompanianteActual: number = -1;
  nuevoClienteRapido = { nombre_completo: '', dni_pasaporte: '', email: '', empresa_nombre: '' };

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    this.api.getClientesPorAgencia(this.auth.getNombreEmpresa()).subscribe({
      next: (data: any) => this.clientes = data,
      error: (err: any) => console.error(err)
    });

    this.reservaId = this.route.snapshot.paramMap.get('id');
    if (this.reservaId) {
      this.esEdicion = true;
      this.cargarDatosParaEditar(this.reservaId);
    }
  }

  // Punto 3: Filtrado dinámico de clientes
  get clientesFiltrados(): any[] {
    if (!this.busquedaCliente || this.busquedaCliente.length < 2) {
      return this.clientes;
    }
    const termino = this.busquedaCliente.toLowerCase();
    return this.clientes.filter((c: any) =>
      c.nombre_completo.toLowerCase().includes(termino) ||
      c.dni_pasaporte.toString().includes(termino)
    );
  }

  // CORREGIDO: getReservaDetalleCompleto → getReservaCompleta
  cargarDatosParaEditar(id: string) {
    this.api.getReservaCompleta((id)).subscribe({
      next: (data: any) => {
        this.reserva = { ...data.reserva };
        this.acompaniantes = data.acompaniantes || [];
        this.vuelos = data.vuelos || [];
        this.servicios = data.servicios || [];

        // Formateo de fechas
        if (this.reserva.fecha_viaje_salida) {
          this.reserva.fecha_viaje_salida = this.reserva.fecha_viaje_salida.split('T')[0];
        }
        if (this.reserva.fecha_viaje_regreso) {
          this.reserva.fecha_viaje_regreso = this.reserva.fecha_viaje_regreso.split('T')[0];
        }

        this.servicios.forEach((s: any) => {
          if (s.detalles.check_in) s.detalles.check_in = s.detalles.check_in.split('T')[0];
          if (s.detalles.check_out) s.detalles.check_out = s.detalles.check_out.split('T')[0];
          if (s.detalles.fecha) s.detalles.fecha = s.detalles.fecha.split('T')[0];
        });

        this.recalcularTodo();
      },
      error: (err: any) => {
        console.error("Error al cargar:", err);
        alert("No se pudo precargar la información de la reserva.");
      }
    });
  }

  irAlPaso(n: number) { this.pasoActivo = n; }

  agregarPasajero() {
    this.acompaniantes.push({
      id_cliente: '', tipo_pasajero: 'ADULTO',
      nro_asistencia_viajero: '', tiene_visa_vencimiento: '', notas_medicas_alergias: ''
    });
  }
  quitarPasajero(i: number) { this.acompaniantes.splice(i, 1); }

  agregarVuelo() {
    this.vuelos.push({ aerolinea: '', nro_vuelo: '', codigo_pnr: '', origen_iata: '', destino_iata: '', fecha_salida: '' });
  }
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
    } else if (tipo === 'CRUCERO') {
      nuevoItem.detalles = { crucero_nombre: '', crucero_cabina: '', crucero_itinerario: '', check_in: '', check_out: '' };
    } else if (tipo === 'SERVICIO') {
      nuevoItem.detalles = { nombre_servicio: '', servicio_descripcion: '', fecha: '' };
    }

    this.servicios.push(nuevoItem);
  }

  quitarServicio(i: number) {
    this.servicios.splice(i, 1);
    this.recalcularTodo();
  }

  recalcularTodo() {
    this.totalCostoNeto = this.servicios.reduce((acc: number, s: any) => acc + (Number(s.costo_neto_operador) || 0), 0);
    this.subtotalVentaBruta = this.servicios.reduce((acc: number, s: any) => acc + (Number(s.venta_bruta_cliente) || 0), 0);

    const gastos = Number(this.reserva.gastos_administrativos_usd) || 0;
    const desc = Number(this.reserva.bonificacion_descuento_usd) || 0;

    this.reserva.total_venta_final_usd = this.subtotalVentaBruta + gastos - desc;
    this.reserva.costo_total_operador_usd = this.totalCostoNeto;
    this.rentabilidadEstimada = this.reserva.total_venta_final_usd - this.totalCostoNeto;
  }

  // Punto 4: Emitir legajo funcional
  guardarReserva() {
    if (!this.reserva.id_titular) return alert("Seleccioná un titular");
    this.recalcularTodo();

    // Sanitizar servicios: convertir strings vacíos a null en detalles
    const serviciosSanitizados = this.servicios.map((s: any) => {
      const detalles: any = {};
      if (s.detalles) {
        for (const key of Object.keys(s.detalles)) {
          const val = s.detalles[key];
          detalles[key] = (val === '' || val === undefined) ? null : val;
        }
      }
      return {
        tipo_item: s.tipo_item || null,
        costo_neto_operador: this.sanitizeNumber(s.costo_neto_operador) ?? 0,
        venta_bruta_cliente: this.sanitizeNumber(s.venta_bruta_cliente) ?? 0,
        detalles
      };
    });

    // Sanitizar acompañantes: filtrar los que no tienen cliente
    const acompaniantesSanitizados = this.acompaniantes
      .filter((a: any) => a.id_cliente && a.id_cliente !== '')
      .map((a: any) => ({
        id_cliente: Number(a.id_cliente),
        tipo_pasajero: a.tipo_pasajero || 'ADULTO'
      }));

    const payload = {
      id_titular: Number(this.reserva.id_titular),
      destino_final: this.reserva.destino_final || null,
      fecha_viaje_salida: this.sanitizeDate(this.reserva.fecha_viaje_salida),
      fecha_viaje_regreso: this.sanitizeDate(this.reserva.fecha_viaje_regreso),
      cotizacion_dolar: this.sanitizeNumber(this.reserva.cotizacion_dolar),
      operador_mayorista: this.reserva.operador_mayorista || null,
      nro_expediente_operador: this.reserva.nro_expediente_operador || null,
      empresa_nombre: this.auth.getNombreEmpresa(),
      gastos_administrativos_usd: this.sanitizeNumber(this.reserva.gastos_administrativos_usd) ?? 0,
      bonificacion_descuento_usd: this.sanitizeNumber(this.reserva.bonificacion_descuento_usd) ?? 0,
      total_venta_final_usd: this.sanitizeNumber(this.reserva.total_venta_final_usd) ?? 0,
      costo_total_operador_usd: this.sanitizeNumber(this.reserva.costo_total_operador_usd) ?? 0,
      observaciones_internas: this.reserva.observaciones_internas || null,
      fecha_limite_pago: this.sanitizeDate(this.reserva.fecha_limite_pago),
      vuelos: [],  // Los vuelos están dentro de servicios
      acompaniantes: acompaniantesSanitizados,
      servicios: serviciosSanitizados
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
      this.api.crearReserva(payload).subscribe({
        next: () => {
          alert("¡Legajo Maestro Creado!");
          this.router.navigate(['/reservas']);
        },
        error: (err: any) => alert("Error al crear: " + (err.error?.error || "Falla de servidor"))
      });
    }
  }

  // --- FUNCIONES DE SANITIZACIÓN (agregar como métodos privados de la clase) ---

  private sanitizePayload(obj: any): any {
    const clean: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val === '' || val === undefined) {
        clean[key] = null;
      } else if (Array.isArray(val)) {
        clean[key] = val; // los arrays se manejan aparte
      } else {
        clean[key] = val;
      }
    }
    return clean;
  }

  private sanitizeNumber(val: any): number | null {
    if (val === '' || val === null || val === undefined) return null;
    const n = Number(val);
    return isNaN(n) ? null : n;
  }

  private sanitizeDate(val: any): string | null {
    if (!val || val === '' || val === 'Invalid Date') return null;
    if (typeof val === 'string' && val.includes('T')) {
      return val.split('T')[0];
    }
    return val;
  }

  // Punto 2: Alta rápida de cliente
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
    if (!this.nuevoClienteRapido.dni_pasaporte) return alert("El DNI/Pasaporte es obligatorio");

    this.api.crearCliente(this.nuevoClienteRapido).subscribe({
      next: (clienteCreado: any) => {
        // Recargar lista de clientes y pre-seleccionar el recién creado
        this.api.getClientesPorAgencia(this.auth.getNombreEmpresa()).subscribe((data: any) => {
          this.clientes = data;
          // Convertir a string para que Angular ngModel/select lo empareje correctamente
          const newId = clienteCreado.id.toString();
          if (this.indexAcompanianteActual === -1) {
            this.reserva.id_titular = newId;
          } else {
            this.acompaniantes[this.indexAcompanianteActual].id_cliente = newId;
          }
          this.mostrarModalCliente = false;
          this.busquedaCliente = ''; // Limpiar búsqueda
        });
      },
      error: (err: any) => alert("Error al registrar cliente: " + (err.error?.error || 'Falla de conexión'))
    });
  }

  volver() { this.router.navigate(['/reservas']); }
}