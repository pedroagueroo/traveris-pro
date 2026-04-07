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
  proveedores: any[] = [];
  tarjetasGuardadas: any[] = [];
  transferenciasGuardadas: any[] = [];
  pasoActivo: number = 1;

  // Variables para Edición — FIX: reservaId es string | null (viene de paramMap)
  esEdicion: boolean = false;
  reservaId: string | null = null;

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
    total_venta_final_usd: 0,
    costo_total_operador_usd: 0,
    moneda_pago: 'USD',
    observaciones_internas: ''
  };

  acompaniantes: any[] = [];
  vuelos: any[] = [];
  servicios: any[] = [];

  mostrarModalCliente: boolean = false;
  indexAcompanianteActual: number = -1;
  nuevoClienteRapido: any = {
    nombre_completo: '', dni_pasaporte: '', email: ''
  };

  // Multimoneda Variables
  totalesCosto = { ARS: 0, USD: 0, EUR: 0 };
  totalesVenta = { ARS: 0, USD: 0, EUR: 0 };
  rentabilidades = { ARS: 0, USD: 0, EUR: 0 };

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) { }

  ngOnInit(): void {
    // Carga de clientes y configuraciones financieras
    const empresa = this.auth.getNombreEmpresa();
    
    this.api.getClientesPorAgencia(empresa).subscribe({
      next: (data: any[]) => this.clientes = data,
      error: (err: any) => console.error('Error clientes:', err)
    });

    this.api.getProveedores(empresa).subscribe({
      next: (data: any[]) => this.proveedores = data,
      error: (err: any) => console.error('Error proveedores:', err)
    });

    this.api.getTarjetasGuardadas(empresa).subscribe({
      next: (data: any[]) => this.tarjetasGuardadas = data,
      error: (err: any) => console.error('Error tarjetas:', err)
    });

    this.api.getTransferenciasGuardadas(empresa).subscribe({
      next: (data: any[]) => this.transferenciasGuardadas = data,
      error: (err: any) => console.error('Error transferencias:', err)
    });

    // LÓGICA DE DETECCIÓN DE EDICIÓN
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

  // FIX: id es string (viene de paramMap), api.getReservaDetalleCompleto acepta any
  cargarDatosParaEditar(id: string) {
    this.api.getReservaDetalleCompleto(id).subscribe({
      next: (data: any) => {
        this.reserva = { ...data.reserva };
        this.acompaniantes = data.acompaniantes || [];
        this.vuelos = data.vuelos || [];
        this.servicios = data.servicios || [];

        // FORMATEO CRÍTICO DE FECHAS
        if (this.reserva.fecha_viaje_salida) {
          this.reserva.fecha_viaje_salida = this.reserva.fecha_viaje_salida.split('T')[0];
        }
        if (this.reserva.fecha_viaje_regreso) {
          this.reserva.fecha_viaje_regreso = this.reserva.fecha_viaje_regreso.split('T')[0];
        }

        // Formatear fechas de vuelos
        this.vuelos.forEach((v: any) => {
          if (v.fecha_salida) v.fecha_salida = v.fecha_salida.split('T')[0];
          if (v.fecha_llegada) v.fecha_llegada = v.fecha_llegada.split('T')[0];
        });

        // Formatear fechas de servicios
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
      nro_asistencia_viajero: '', tiene_visa_vencimiento: '',
      notas_medicas_alergias: ''
    });
  }
  quitarPasajero(i: number) { this.acompaniantes.splice(i, 1); }

  agregarVuelo() {
    this.vuelos.push({
      aerolinea: '', nro_vuelo: '', codigo_pnr: '',
      origen_iata: '', destino_iata: '', fecha_salida: '',
      fecha_llegada: '', hora_salida: '', hora_llegada: ''
    });
  }
  quitarVuelo(i: number) { this.vuelos.splice(i, 1); }

  agregarServicio(tipo: string) {
    const baseOperativo = { operador_mayorista: '', nro_expediente: '', observaciones: '' };
    const nuevoItem: any = {
      tipo_item: tipo,
      moneda_venta: 'USD',
      moneda_costo: 'USD',
      metodo_pago: 'EFECTIVO',
      id_proveedor: null,
      costo_neto_operador: 0,
      venta_bruta_cliente: 0,
      detalles: { ...baseOperativo }
    };

    if (tipo === 'HOTEL') {
      nuevoItem.detalles = { ...baseOperativo, hotel_nombre: '', ciudad: '', check_in: '', check_out: '', regimen: 'DESAYUNO' };
    } else if (tipo === 'VUELO') {
      nuevoItem.detalles = { ...baseOperativo, aerolinea: '', nro_vuelo: '', origen: '', destino: '', pnr: '', fecha: '', hora_salida: '', hora_llegada: '' };
    } else if (tipo === 'ASISTENCIA') {
      nuevoItem.detalles = { ...baseOperativo, plan: '', nro_poliza: '', cobertura: '' };
    } else if (tipo === 'VISA') {
      nuevoItem.detalles = { ...baseOperativo, pais: '', nro_tramite: '', fecha_vencimiento: '' };
    } else if (tipo === 'CRUCERO') {
      nuevoItem.detalles = { ...baseOperativo, crucero_nombre: '', crucero_cabina: '', crucero_itinerario: '', check_in: '', check_out: '' };
    } else if (tipo === 'SERVICIO') {
      nuevoItem.detalles = { ...baseOperativo, nombre_servicio: '', servicio_descripcion: '', fecha: '' };
    }

    this.servicios.push(nuevoItem);
  }

  quitarServicio(i: number) {
    this.servicios.splice(i, 1);
    this.recalcularTodo();
  }

  recalcularTodo() {
    this.totalesCosto = { ARS: 0, USD: 0, EUR: 0 };
    this.totalesVenta = { ARS: 0, USD: 0, EUR: 0 };

    this.servicios.forEach((s: any) => {
      const costo = Number(s.costo_neto_operador) || 0;
      const venta = Number(s.venta_bruta_cliente) || 0;

      const monCost = s.moneda_costo || 'USD';
      if ((this.totalesCosto as any)[monCost] !== undefined) {
         (this.totalesCosto as any)[monCost] += costo;
      }

      const monVent = s.moneda_venta || 'USD';
      if ((this.totalesVenta as any)[monVent] !== undefined) {
         (this.totalesVenta as any)[monVent] += venta;
      }
    });

    this.reserva.total_venta_final_usd = this.totalesVenta.USD;
    this.reserva.costo_total_operador_usd = this.totalesCosto.USD;
    
    this.rentabilidades.ARS = this.totalesVenta.ARS - this.totalesCosto.ARS;
    this.rentabilidades.USD = this.totalesVenta.USD - this.totalesCosto.USD;
    this.rentabilidades.EUR = this.totalesVenta.EUR - this.totalesCosto.EUR;

    this.totalCostoNeto = this.totalesCosto.USD;
    this.subtotalVentaBruta = this.totalesVenta.USD;
    this.rentabilidadEstimada = this.rentabilidades.USD;
  }

  // --- Funciones de sanitización ---
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

  guardarReserva() {
    if (!this.reserva.id_titular) return alert("Seleccioná un titular");
    this.recalcularTodo();

    // Sanitizar servicios
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
        moneda_venta: s.moneda_venta || 'USD',
        moneda_costo: s.moneda_costo || 'USD',
        metodo_pago: s.metodo_pago || 'EFECTIVO',
        id_proveedor: this.sanitizeNumber(s.id_proveedor),
        costo_neto_operador: this.sanitizeNumber(s.costo_neto_operador) ?? 0,
        venta_bruta_cliente: this.sanitizeNumber(s.venta_bruta_cliente) ?? 0,
        detalles
      };
    });

    // Sanitizar acompañantes
    const acompaniantesSanitizados = this.acompaniantes
      .filter((a: any) => a.id_cliente && a.id_cliente !== '')
      .map((a: any) => ({
        id_cliente: Number(a.id_cliente),
        tipo_pasajero: a.tipo_pasajero || 'ADULTO'
      }));

    const payload: any = {
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
      moneda_pago: this.reserva.moneda_pago || 'USD',
      observaciones_internas: this.reserva.observaciones_internas || null,
      fecha_limite_pago: this.sanitizeDate(this.reserva.fecha_limite_pago),
      vuelos: [],
      acompaniantes: acompaniantesSanitizados,
      servicios: serviciosSanitizados
    };

    if (this.esEdicion) {
      this.api.actualizarReserva(this.reservaId, payload).subscribe({
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
        this.api.getClientesPorAgencia(this.auth.getNombreEmpresa()).subscribe((data: any[]) => {
          this.clientes = data;
          if (this.indexAcompanianteActual === -1) {
            this.reserva.id_titular = clienteCreado.id;
          } else {
            this.acompaniantes[this.indexAcompanianteActual].id_cliente = clienteCreado.id;
          }
          this.mostrarModalCliente = false;
        });
      },
      error: (err: any) => alert("Error al registrar cliente: " + (err.error?.error || 'Falla de conexión'))
    });
  }

  // Lógica Dinámica de Dropdowns de Pagos
  onMetodoPagoChange(s: any) {
      if (s.metodo_pago === 'ADD_TARJETA') {
          const bank = prompt("Banco o Tarjeta:");
          const nro = prompt("Últimos 4 números:");
          if (bank && nro) {
              const payload = {
                  empresa_nombre: this.auth.getNombreEmpresa(),
                  nombre_banco: bank,
                  franquicia: 'VISA',
                  nro_tarjeta_completo: nro,
                  vencimiento: '12/99'
              };
              this.api.crearTarjetaGuardada(payload).subscribe({
                  next: (res) => {
                      this.tarjetasGuardadas.push(res);
                      s.metodo_pago = 'TARJETA';
                      if (!s.detalles) s.detalles = {};
                      s.detalles.observaciones = (s.detalles.observaciones || '') + ` [Pago con ${res.nombre_banco} - ${res.nro_tarjeta_completo}]`;
                  },
                  error: () => { alert("Error al agregar tarjeta"); s.metodo_pago = 'EFECTIVO'; }
              });
          } else {
              s.metodo_pago = 'EFECTIVO';
          }
      } else if (s.metodo_pago === 'ADD_TRANSFERENCIA') {
          const alias = prompt("Banco o Alias de Transferencia:");
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
                      s.metodo_pago = 'TRANSFERENCIA';
                      if (!s.detalles) s.detalles = {};
                      s.detalles.observaciones = (s.detalles.observaciones || '') + ` [Transf a ${res.banco_alias}]`;
                  },
                  error: () => { alert("Error al agregar medio de transferencia"); s.metodo_pago = 'EFECTIVO'; }
              });
          } else {
              s.metodo_pago = 'EFECTIVO';
          }
      }
  }

  onProveedorChange(s: any) {
      if (s.id_proveedor === 'ADD_PROVEEDOR') {
          const nombre = prompt("Nombre comercial del Proveedor:");
          if (nombre) {
              const payload = {
                  empresa_nombre: this.auth.getNombreEmpresa(),
                  nombre_comercial: nombre
              };
              this.api.agregarProveedor(payload).subscribe({
                  next: (res) => {
                      this.proveedores.push(res);
                      s.id_proveedor = res.id;
                  },
                  error: () => { alert("Error al agregar proveedor"); s.id_proveedor = null; }
              });
          } else {
              s.id_proveedor = null;
          }
      }
  }

  volver() { this.router.navigate(['/reservas']); }
}