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
  stats: any = { totalLegajos: 0, legajosActivos: 0, saldoPendienteGlobal: 0 };
  movimientos: any[] = [];
  nombreEmpresa: string = 'Cargando...';
  cotizacionBlue: any = { compra: 0, venta: 0 };

  alertasRadar: any[] = [];
  mostrarAlertas: boolean = false; // 👈 Agregá esta línea

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
  
  this.api.getRadarVencimientos(empresa).subscribe(vencimientos => {
    // Si la lista de deudas está vacía, ocultamos la notificación
    const v = vencimientos.map(i => ({ ...i, tipoAlerta: 'PAGO' }));
    
    // Filtramos cumpleaños para unificar la lista
    this.api.getRadarCumpleanios(empresa).subscribe(cumples => {
      const c = cumples.map(i => ({ ...i, tipoAlerta: 'CUMPLE' }));
      
      this.alertasRadar = [...v, ...c];
      
      // La campana solo se prende si hay deudas VENCIDAS o CUMPLES
      this.mostrarAlertas = this.alertasRadar.length > 0;
    });
  });
}

  enviarFelicidades(persona: any) {

    // Verificamos si tiene email antes de intentar enviar
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
      error: (err) => {
        console.error(err);
        alert("Error al enviar el correo. Revisá la configuración del servidor.");
      }
    });
  }

  cargarDashboard() {
    const miAgencia = this.auth.getNombreEmpresa();
    this.nombreEmpresa = miAgencia;

    // Llamamos al nuevo endpoint enviando la agencia como parámetro
    this.api.getDashboardStats(miAgencia).subscribe({
      next: (data) => {
        // data ya trae: totalLegajos, legajosActivos, saldoPendienteGlobal
        this.stats = data;
        console.log("Estadísticas actualizadas:", this.stats);
        console.log("TOTAL VENTAS - PAGOS = ", data.saldoPendienteGlobal);
      },
      error: (err) => console.error('Error al cargar estadísticas:', err)
    });

    // También cargamos los movimientos para la tabla de abajo
    this.api.getUltimosMovimientos(miAgencia).subscribe({
      next: (data) => this.movimientos = data,
      error: (err) => console.error('Error en movimientos:', err)
    });
  }

  eliminarMovimiento(id: number) {
    if (confirm('¿Deseas anular este movimiento de caja?')) {
      this.api.eliminarMovimiento(id).subscribe({
        next: () => {
          alert('Movimiento anulado correctamente');
          // Recargamos el dashboard para que stats.saldoPendienteGlobal se actualice
          this.cargarDashboard();
        },
        error: (err) => {
          console.error('Detalle del error:', err);
          alert('Error al eliminar el movimiento');
        }
      });
    }
  }

  obtenerDolar() {
    // Cambiamos 'blue' por 'oficial' en la URL
    this.http.get('https://dolarapi.com/v1/dolares/oficial').subscribe({
      next: (data: any) => this.cotizacionBlue = data, // Podes mantener el nombre de la variable o cambiarlo a cotizacionOficial
      error: (err) => console.error('Error al obtener cotización:', err)
    });
  }
}