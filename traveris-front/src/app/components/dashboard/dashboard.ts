import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/env';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  stats: any = { totalLegajos: 0, legajosActivos: 0, saldoPendienteGlobal: 0, deudaProveedoresGlobal: 0 };
  movimientos: any[] = [];
  nombreEmpresa: string = 'Cargando...';
  cotizacionBlue: any = { compra: 0, venta: 0 };

  alertasRadar: any[] = [];
  mostrarAlertas: boolean = false;
  radarError: string = '';

  constructor(
    private api: ApiService,
    public auth: AuthService,
    private http: HttpClient
  ) { }

  ngOnInit() {
    this.cargarDashboard();
    this.obtenerDolar();
    this.cargarRadar();
  }

  cargarDashboard() {
    const empresa = this.auth.getNombreEmpresa();
    this.nombreEmpresa = empresa;

    this.api.getDashboardStats(empresa).subscribe({
      next: (data: any) => this.stats = data,
      error: (err: any) => console.error("Error stats:", err)
    });

    this.api.getUltimosMovimientos(empresa).subscribe({
      next: (data: any[]) => this.movimientos = data,
      error: (err: any) => console.error("Error movs:", err)
    });
  }

  obtenerDolar() {
    // Usa el backend como proxy para evitar CORS
    this.http.get(`${environment.apiUrl}/caja-contable/dolar-blue`).subscribe({
      next: (data: any) => this.cotizacionBlue = data,
      error: () => this.cotizacionBlue = { compra: 0, venta: 0 }
    });
  }

  cargarRadar() {
    const empresa = this.auth.getNombreEmpresa();
    this.radarError = '';

    this.api.getRadarVencimientos(empresa).subscribe({
      next: (vencimientos: any[]) => {
        const v = vencimientos.map((i: any) => ({ ...i, tipoAlerta: 'PAGO' }));

        this.api.getRadarCumpleanios(empresa).subscribe({
          next: (cumples: any[]) => {
            const c = cumples.map((i: any) => ({ ...i, tipoAlerta: 'CUMPLE' }));
            this.alertasRadar = [...v, ...c];
            this.mostrarAlertas = this.alertasRadar.length > 0;
          },
          error: (err: any) => {
            this.radarError = 'Error al cargar cumpleaños';
            console.error(err);
          }
        });
      },
      error: (err: any) => {
        this.radarError = 'Error al cargar alertas de vencimiento';
        console.error(err);
      }
    });
  }

  enviarFelicidades(persona: any) {
    if (!persona.email) {
      alert("Este cliente no tiene un correo electrónico registrado.");
      return;
    }

    this.api.enviarSaludoCumple({
      email: persona.email,
      nombre: persona.nombre_completo
    }).subscribe({
      next: () => {
        alert("¡Email de felicitación enviado con éxito a " + persona.nombre_completo + "!");
      },
      error: (err: any) => {
        console.error(err);
        alert("Error al enviar el correo. Revisá la configuración del servidor.");
      }
    });
  }

  eliminarMovimiento(id: number) {
    if (confirm("¿Eliminar este movimiento? Se alterarán los saldos.")) {
      this.api.eliminarMovimientoContable(id).subscribe({
        next: () => {
          alert("Movimiento eliminado");
          this.cargarDashboard();
        },
        error: (err: any) => console.error("Error:", err)
      });
    }
  }
}