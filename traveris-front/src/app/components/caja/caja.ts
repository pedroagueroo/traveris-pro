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

  // Cierre mensual
  cierreMensual: any = null;
  mesSeleccionado: string = '';

  constructor(
    private api: ApiService,
    private auth: AuthService
  ) { }

  ngOnInit() {
    this.cargarCaja();
    this.obtenerCotizaciones();

    // Default: mes actual para cierre
    const hoy = new Date();
    this.mesSeleccionado = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
  }

  cargarCaja() {
    const miAgencia = this.auth.getNombreEmpresa();

    // Saldo Global
    this.api.getBalanceCaja(miAgencia).subscribe((data: any) => this.saldos = data);

    // Saldo por Billetera
    this.api.getBalanceBilleteras(miAgencia).subscribe((data: any[]) => {
      this.saldosDetallados = data;
    });

    // Reporte Diario
    this.api.getReporteDiario(miAgencia).subscribe((data: any[]) => this.movimientosHoy = data);
  }

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

  imprimirCierreCaja() {
    window.print();
  }

  // ============================================================
  // PAGO CON TARJETA (stub — se completará en la feature de tarjetas)
  // ============================================================

  pagarDeudaTarjeta(datos: any) {
    this.api.pagarDeudaTarjeta({
      ...datos,
      empresa_nombre: this.auth.getNombreEmpresa()
    }).subscribe({
      next: (res: any) => {
        alert("Pago con tarjeta registrado");
        this.cargarCaja();
      },
      error: (err: any) => alert("Error al registrar pago con tarjeta")
    });
  }

  // ============================================================
  // CIERRE MENSUAL (stub — se completará en la feature de cierre)
  // ============================================================

  getCierreMensual() {
    if (!this.mesSeleccionado) return alert("Seleccioná un mes");

    this.api.getCierreMensual(this.auth.getNombreEmpresa(), this.mesSeleccionado).subscribe({
      next: (data: any) => {
        this.cierreMensual = data;
      },
      error: (err: any) => {
        console.error("Error cierre mensual:", err);
        alert("Error al generar el cierre mensual");
      }
    });
  }
}