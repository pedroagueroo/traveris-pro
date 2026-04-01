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

  preciosAPI: any = { dolar: 0, euro: 0, real: 0 };
  montoEntrada: number = 0;
  monedaSeleccionada: string = 'USD';
  tipoCambioUsado: number = 0;
  modoPersonalizado: boolean = false;
  resultado: number = 0;
  saldos: any = { saldoARS: 0, saldoUSD: 0 };
  movimientosHoy: any[] = [];

  nuevoGasto: any = {
    monto: 0,
    moneda: 'ARS',
    tipo_movimiento: 'EGRESO_GENERAL',
    metodo_pago: 'EFECTIVO',
    observaciones: ''
  };

  saldosDetallados: any[] = [];
  direccionConversion: 'A_PESOS' | 'A_DIVISA' = 'A_PESOS';

  // --- Cierre mensual ---
  cierreMensual: any = null;
  mesSeleccionado: number = 0;
  anioSeleccionado: number = 0;
  cargandoCierre: boolean = false;
  mostrarCierre: boolean = false;

  // --- Modal Pago Tarjeta ---
  mostrarModalTarjeta: boolean = false;
  pagoTarjeta: any = {
    monto: 0,
    moneda: 'ARS',
    metodo_pago_real: 'EFECTIVO',
    observaciones: '',
    cuotas: 1,
    numero_tarjeta: ''
  };

  constructor(
    private api: ApiService,
    private auth: AuthService
  ) { }

  ngOnInit() {
    this.cargarCaja();
    this.obtenerCotizaciones();

    // Default: mes y año actual
    const hoy = new Date();
    this.mesSeleccionado = hoy.getMonth() + 1;
    this.anioSeleccionado = hoy.getFullYear();
  }

  // ============================================================
  // CARGA DE DATOS
  // ============================================================

  saldosMacro: any = { efectivoARS: 0, efectivoUSD: 0, efectivoEUR: 0, tarjetas: 0, transferencias: 0 };

  cargarCaja() {
    const miAgencia = this.auth.getNombreEmpresa();

    this.api.getBalanceCaja(miAgencia).subscribe((data: any) => this.saldos = data);

    this.api.getBalanceBilleteras(miAgencia).subscribe((data: any[]) => {
      this.saldosDetallados = data;
      
      this.saldosMacro = { efectivoARS: 0, efectivoUSD: 0, efectivoEUR: 0, tarjetas: 0, transferencias: 0 };
      
      data.forEach(item => {
         const metodo = (item.metodo_pago || '').toUpperCase();
         const isEfectivo = metodo === 'EFECTIVO';
         const isTransfer = metodo.includes('TRANSF') || metodo.includes('MERCADOPAGO') || metodo.includes('BBVA') || metodo.includes('GALICIA');
         const isTarjeta = metodo.includes('TARJETA');
         const val = parseFloat(item.saldo) || 0;
         
         if (isEfectivo) {
             if (item.moneda === 'ARS') this.saldosMacro.efectivoARS += val;
             if (item.moneda === 'USD') this.saldosMacro.efectivoUSD += val;
             if (item.moneda === 'EUR') this.saldosMacro.efectivoEUR += val;
         } else if (isTarjeta) {
             this.saldosMacro.tarjetas += val;
         } else if (isTransfer) {
             this.saldosMacro.transferencias += val;
         }
      });
    });

    this.api.getReporteDiario(miAgencia).subscribe((data: any[]) => this.movimientosHoy = data);
  }

  // ============================================================
  // REGISTRAR GASTO
  // ============================================================

  registrarGasto() {
    if (this.nuevoGasto.monto <= 0 || !this.nuevoGasto.observaciones) {
      alert("Por favor, completa el monto y el concepto del gasto.");
      return;
    }

    const payload: any = {
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
      error: (err: any) => alert("Error al registrar el gasto")
    });
  }

  // ============================================================
  // COTIZACIONES
  // ============================================================

  obtenerCotizaciones() {
    this.api.getCotizacionesCompletas().subscribe((data: any) => {
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
      this.resultado = this.montoEntrada * this.tipoCambioUsado;
    } else {
      this.resultado = this.montoEntrada / this.tipoCambioUsado;
    }
  }

  // ============================================================
  // ELIMINAR MOVIMIENTO
  // ============================================================

  eliminarMovimiento(id: number) {
    if (confirm("¿Estás seguro de eliminar este registro? Esto alterará los saldos.")) {
      this.api.eliminarMovimientoContable(id).subscribe({
        next: () => {
          alert("Movimiento eliminado");
          this.cargarCaja();
        },
        error: (err: any) => console.error("Error al borrar:", err)
      });
    }
  }

  // ============================================================
  // IMPRIMIR
  // ============================================================

  imprimirCierreCaja() {
    window.print();
  }

  imprimirCierreMensualPDF() {
    const titulo = document.title;
    document.title = `Cierre_${this.getNombreMes(this.mesSeleccionado)}_${this.anioSeleccionado}_${this.auth.getNombreEmpresa()}`;
    window.print();
    document.title = titulo;
  }

  // ============================================================
  // MODAL PAGO TARJETA (requerido por caja.html)
  // ============================================================

  abrirModalTarjeta() {
    this.pagoTarjeta = {
      monto: 0,
      moneda: 'ARS',
      metodo_pago_real: 'EFECTIVO',
      observaciones: ''
    };
    this.mostrarModalTarjeta = true;
  }

  cerrarModalTarjeta() {
    this.mostrarModalTarjeta = false;
  }

  confirmarPagoTarjeta() {
    if (!this.pagoTarjeta.monto || this.pagoTarjeta.monto <= 0) {
      return alert("El monto debe ser mayor a 0");
    }

    const cuotas = this.pagoTarjeta.cuotas || 1;

    if (cuotas > 1) {
      // Generar múltiples movimientos, uno por mes
      const montoPorCuota = Math.round((this.pagoTarjeta.monto / cuotas) * 100) / 100;
      const hoy = new Date();
      let registrados = 0;

      for (let i = 0; i < cuotas; i++) {
        const payload: any = {
          monto: montoPorCuota,
          moneda: this.pagoTarjeta.moneda,
          metodo_pago_real: this.pagoTarjeta.metodo_pago_real,
          observaciones: `Cuota ${i + 1}/${cuotas} - ${this.pagoTarjeta.observaciones || 'Pago tarjeta'}`,
          empresa_nombre: this.auth.getNombreEmpresa()
        };

        this.api.pagarDeudaTarjeta(payload).subscribe({
          next: () => {
            registrados++;
            if (registrados === cuotas) {
              alert(`${cuotas} cuotas de ${this.pagoTarjeta.moneda} ${montoPorCuota.toFixed(2)} registradas.`);
              this.cerrarModalTarjeta();
              this.cargarCaja();
            }
          },
          error: (err: any) => alert("Error en cuota " + (i + 1))
        });
      }
    } else {
      // Pago único (lógica original)
      this.api.pagarDeudaTarjeta({
        monto: this.pagoTarjeta.monto,
        moneda: this.pagoTarjeta.moneda,
        metodo_pago_real: this.pagoTarjeta.metodo_pago_real,
        observaciones: this.pagoTarjeta.observaciones,
        empresa_nombre: this.auth.getNombreEmpresa()
      }).subscribe({
        next: (res: any) => {
          alert("Pago de tarjeta registrado correctamente");
          this.cerrarModalTarjeta();
          this.cargarCaja();
        },
        error: (err: any) => alert("Error: " + (err.error?.error || "Error de servidor"))
      });
    }
  }


  // ============================================================
  // CIERRE MENSUAL (requerido por caja.html)
  // ============================================================

  generarCierreMensual() {
    if (!this.mesSeleccionado || !this.anioSeleccionado) {
      return alert("Seleccioná mes y año");
    }

    this.cargandoCierre = true;
    const empresa = this.auth.getNombreEmpresa();

    this.api.getCierreMensual(empresa, `?mes=${this.mesSeleccionado}&anio=${this.anioSeleccionado}`).subscribe({
      next: (data: any) => {
        this.cierreMensual = data;
        this.mostrarCierre = true;
        this.cargandoCierre = false;
      },
      error: (err: any) => {
        console.error("Error cierre mensual:", err);
        alert("Error al generar el cierre mensual");
        this.cargandoCierre = false;
      }
    });
  }

  getNombreMes(mes: number): string {
    const meses = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return meses[mes] || '';
  }
}