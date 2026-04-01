import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-estadisticas',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './estadisticas.html',
  styleUrls: ['./estadisticas.css']
})
export class EstadisticasComponent implements OnInit {
  reservas: any[] = [];
  empresa: string = '';

  // Métricas calculadas
  totalReservas: number = 0;
  totalFacturado: number = 0;
  totalCosto: number = 0;
  rentabilidadTotal: number = 0;
  ticketPromedio: number = 0;
  margenPromedio: number = 0;

  // Destinos más vendidos
  topDestinos: { destino: string; cantidad: number; facturado: number }[] = [];

  // Reservas por mes (últimos 12 meses)
  reservasPorMes: { mes: string; cantidad: number; facturado: number }[] = [];

  // Por estado
  porEstado: { estado: string; cantidad: number }[] = [];

  constructor(
    private api: ApiService,
    private auth: AuthService
  ) {}

  ngOnInit() {
    this.empresa = this.auth.getNombreEmpresa();
    this.cargarEstadisticas();
  }

  cargarEstadisticas() {
    this.api.getReservasPorAgencia(this.empresa).subscribe({
      next: (data: any[]) => {
        this.reservas = data;
        this.calcularMetricas();
        this.calcularTopDestinos();
        this.calcularPorMes();
        this.calcularPorEstado();
      },
      error: (err: any) => console.error('Error estadísticas:', err)
    });
  }

  private calcularMetricas() {
    this.totalReservas = this.reservas.length;
    this.totalFacturado = this.reservas.reduce((sum, r) => sum + (parseFloat(r.total_venta_final_usd) || 0), 0);
    this.totalCosto = this.reservas.reduce((sum, r) => sum + (parseFloat(r.costo_total_operador_usd) || 0), 0);
    this.rentabilidadTotal = this.totalFacturado - this.totalCosto;
    this.ticketPromedio = this.totalReservas > 0 ? this.totalFacturado / this.totalReservas : 0;
    this.margenPromedio = this.totalFacturado > 0 ? (this.rentabilidadTotal / this.totalFacturado) * 100 : 0;
  }

  private calcularTopDestinos() {
    const mapa = new Map<string, { cantidad: number; facturado: number }>();
    this.reservas.forEach(r => {
      const dest = (r.destino_final || 'Sin destino').trim();
      const entry = mapa.get(dest) || { cantidad: 0, facturado: 0 };
      entry.cantidad++;
      entry.facturado += parseFloat(r.total_venta_final_usd) || 0;
      mapa.set(dest, entry);
    });
    this.topDestinos = Array.from(mapa.entries())
      .map(([destino, data]) => ({ destino, ...data }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10);
  }

  private calcularPorMes() {
    const mapa = new Map<string, { cantidad: number; facturado: number }>();
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

    this.reservas.forEach(r => {
      if (!r.fecha_viaje_salida) return;
      const fecha = new Date(r.fecha_viaje_salida);
      const key = `${meses[fecha.getMonth()]} ${fecha.getFullYear()}`;
      const entry = mapa.get(key) || { cantidad: 0, facturado: 0 };
      entry.cantidad++;
      entry.facturado += parseFloat(r.total_venta_final_usd) || 0;
      mapa.set(key, entry);
    });

    this.reservasPorMes = Array.from(mapa.entries())
      .map(([mes, data]) => ({ mes, ...data }))
      .sort((a, b) => {
        // Sort by date
        const parseDate = (s: string) => {
          const parts = s.split(' ');
          const mesIdx = meses.indexOf(parts[0]);
          return parseInt(parts[1]) * 12 + mesIdx;
        };
        return parseDate(a.mes) - parseDate(b.mes);
      })
      .slice(-12);
  }

  private calcularPorEstado() {
    const mapa = new Map<string, number>();
    this.reservas.forEach(r => {
      const estado = r.estado || 'DESCONOCIDO';
      mapa.set(estado, (mapa.get(estado) || 0) + 1);
    });
    this.porEstado = Array.from(mapa.entries())
      .map(([estado, cantidad]) => ({ estado, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad);
  }

  getBarWidth(value: number, max: number): string {
    return max > 0 ? `${(value / max) * 100}%` : '0%';
  }
}
