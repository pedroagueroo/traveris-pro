import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';

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
    public auth: AuthService
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

  enviarFelicidades(persona: any) {
    if (!persona.email) {
      alert("Este cliente no tiene un correo electrónico registrado.");
      return;
    }

    this.api.enviarSaludoCumple({
      email: persona.email,
      nombre: persona.nombre_completo,
      empresa_nombre: this.auth.getNombreEmpresa()
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

  // ═══════════════════════════════════════════════════════════════════════════
  // COTIZACIÓN DEL DÓLAR — CORREGIDO
  // ═══════════════════════════════════════════════════════════════════════════
  // CAUSA RAÍZ: El frontend llamaba directamente a https://dolarapi.com
  // desde localhost:4200, lo cual es BLOQUEADO por CORS porque dolarapi.com
  // no permite requests desde origins arbitrarios.
  //
  // SOLUCIÓN: Usar el endpoint del BACKEND /api/caja-contable/cotizaciones-completas
  // que SÍ puede llamar a dolarapi.com (Node.js no tiene restricción CORS)
  // y actúa como proxy. El backend ya tiene este endpoint implementado.
  // ═══════════════════════════════════════════════════════════════════════════
  obtenerDolar() {
    this.api.getCotizacionesCompletas().subscribe({
      next: (data: any) => {
        // El backend devuelve { dolar: X, euro: Y, real: Z }
        // Lo mapeamos al formato que espera el template
        this.cotizacionBlue = {
          compra: data.dolar ? (data.dolar * 0.97).toFixed(0) : 0, // Estimación compra ~3% menos
          venta: data.dolar || 0
        };
      },
      error: () => {
        console.warn('No se pudo obtener cotización del dólar');
        this.cotizacionBlue = { compra: 0, venta: 0 };
      }
    });
  }
}