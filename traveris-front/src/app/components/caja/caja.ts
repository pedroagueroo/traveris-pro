import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-caja',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './caja.html',
  styleUrl: './caja.css',
})
export class Caja implements OnInit {

  preciosAPI = { dolar: 0, euro: 0, real: 0 };
  montoEntrada: number = 0;
  monedaSeleccionada: string = 'USD';
  tipoCambioUsado: number = 0;
  modoPersonalizado: boolean = false;
  resultado: number = 0;
  saldos = { saldoARS: 0, saldoUSD: 0 };
  movimientosHoy: any[] = [];

  nuevoGasto = {
    monto: 0,
    moneda: 'ARS',
    tipo_movimiento: 'EGRESO_GENERAL',
    metodo_pago: 'EFECTIVO',
    observaciones: ''
  };

  saldosDetallados: any[] = [];

  direccionConversion: 'A_PESOS' | 'A_DIVISA' = 'A_PESOS';

  // Corregí el constructor agregando private http: HttpClient
  constructor(
    private api: ApiService,
    private auth: AuthService
  ) { }

  ngOnInit() {
    this.cargarCaja();
    this.obtenerCotizaciones();
  }

  cargarCaja() {
    const miAgencia = this.auth.getNombreEmpresa();

    // Saldo Global
    this.api.getBalanceCaja(miAgencia).subscribe(data => this.saldos = data);

    // NUEVO: Saldo por Billetera (Usando la función del servicio)
    this.api.getBalanceBilleteras(miAgencia).subscribe(data => {
      this.saldosDetallados = data;
    });

    // Reporte Diario
    this.api.getReporteDiario(miAgencia).subscribe(data => this.movimientosHoy = data);
  }

  registrarGasto() {
    if (this.nuevoGasto.monto <= 0 || !this.nuevoGasto.observaciones) {
      alert("Por favor, completa el monto y el concepto del gasto.");
      return;
    }

    const payload = {
      ...this.nuevoGasto,
      id_reserva: null,
      empresa_nombre: this.auth.getNombreEmpresa()
    };

    this.api.crearMovimientoCaja(payload).subscribe({
      next: () => {
        alert("Gasto registrado con éxito");
        this.nuevoGasto.monto = 0;
        this.nuevoGasto.observaciones = '';
        this.cargarCaja(); // Recarga saldos y tabla automáticamente
      },
      error: (err) => alert("Error al registrar el gasto")
    });
  }

  obtenerCotizaciones() {
    this.api.getCotizacionesCompletas().subscribe(data => {
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
      // Ejemplo: 100 USD * 1000 = 100.000 ARS
      this.resultado = this.montoEntrada * this.tipoCambioUsado;
    } else {
      // Ejemplo: 100.000 ARS / 1000 = 100 USD
      this.resultado = this.montoEntrada / this.tipoCambioUsado;
    }
  }

  eliminarMovimiento(id: number) {
    if (confirm("¿Estás seguro de eliminar este registro? Esto alterará los saldos.")) {
      this.api.eliminarMovimientoContable(id).subscribe({
        next: () => {
          alert("Movimiento eliminado");
          this.cargarCaja(); // 👈 ESTO dispara getBalanceCaja y getReporteDiario de nuevo
        },
        error: (err) => console.error("Error al borrar:", err)
      });
    }
  }

  imprimirCierreCaja() {
    window.print(); // Usaremos CSS para ocultar los formularios y mostrar solo la tabla y totales
  }
}