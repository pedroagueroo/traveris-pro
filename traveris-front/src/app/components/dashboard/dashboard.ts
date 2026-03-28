import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';
import { HttpClient } from '@angular/common/http';

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

  cargarRadar() {
    const empresa = this.auth.getNombreEmpresa();
    
    this.api.getRadarVencimientos(empresa).subscribe({
      next: (vencimientos) => {
        const v = vencimientos.map((i: any) => ({ ...i, tipoAlerta: 'PAGO' }));
        
        this.api.getRadarCumpleanios(empresa).subscribe({
          next: (cumples) => {
            const c = cumples.map((i: any) => ({ ...i, tipoAlerta: 'CUMPLE' }));
            this.alertasRadar = [...v, ...c];
            this.mostrarAlertas = this.alertasRadar.length > 0;
          },
          error: () => {
            this.alertasRadar = [...v];
            this.mostrarAlertas = v.length > 0;
          }
        });
      },
      error: (err: any) => console.error('Error en radar:', err)
    });
  }

  // Punto 1: Email con nombre real de agencia
  enviarFelicidades(persona: any) {
    if (!persona.email) {
      alert("Este cliente no tiene un correo electrónico registrado.");
      return;
    }

    this.api.enviarSaludoCumple({
      email: persona.email,
      nombre: persona.nombre_completo,
      empresa_nombre: this.auth.getNombreEmpresa() // Envía nombre real de agencia
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

  cargarDashboard() {
    const miAgencia = this.auth.getNombreEmpresa();
    this.nombreEmpresa = miAgencia;

    this.api.getDashboardStats(miAgencia).subscribe({
      next: (data: any) => {
        this.stats = data;
      },
      error: (err: any) => console.error('Error al cargar estadísticas:', err)
    });

    this.api.getUltimosMovimientos(miAgencia).subscribe({
      next: (data: any) => this.movimientos = data,
      error: (err: any) => console.error('Error en movimientos:', err)
    });
  }

  // CORREGIDO: eliminarMovimiento → eliminarMovimientoContable
  eliminarMovimiento(id: number) {
    if (confirm('¿Deseas anular este movimiento de caja?')) {
      this.api.eliminarMovimientoContable(id).subscribe({
        next: () => {
          alert('Movimiento anulado correctamente');
          this.cargarDashboard();
        },
        error: (err: any) => {
          console.error('Detalle del error:', err);
          alert('Error al eliminar el movimiento');
        }
      });
    }
  }

  // Punto 5: Cotización del dólar con fallback
  obtenerDolar() {
    this.http.get('https://dolarapi.com/v1/dolares/oficial').subscribe({
      next: (data: any) => {
        this.cotizacionBlue = data;
      },
      error: () => {
        // Fallback: intentar con otra API
        this.http.get('https://dolarapi.com/v1/dolares/blue').subscribe({
          next: (data: any) => {
            this.cotizacionBlue = data;
          },
          error: () => {
            // Si ambas fallan, usar valores por defecto
            this.cotizacionBlue = { compra: 0, venta: 0 };
            console.warn('No se pudo obtener cotización del dólar');
          }
        });
      }
    });
  }
}