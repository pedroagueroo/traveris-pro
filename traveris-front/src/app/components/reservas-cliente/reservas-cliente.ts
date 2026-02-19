import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ApiService } from '../../services/api';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-reservas-cliente',
  templateUrl: './reservas-cliente.html',
  styleUrls: ['./reservas-cliente.css'],
  standalone: true, // Asegurate de tenerlo si usas imports directos
  imports: [CommonModule, RouterModule]
})
export class ReservasClienteComponent implements OnInit {
  clienteId: string | null = null;
  nombreCliente: string = "";
  todasLasReservas: any[] = [];
  reservasFiltradas: any[] = [];

  filtroActual: string = 'TODAS';
  paginaActual: number = 1;
  itemsPorPagina: number = 5;

  constructor(
    private route: ActivatedRoute,
    private api: ApiService,
    public router: Router
  ) { }

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
    this.clienteId = params.get('id');
    if (this.clienteId) {
      this.cargarDatos(); // Se vuelve a disparar la carga con el nuevo ID
    }
  });
  }

  cargarDatos() {
    if (!this.clienteId) return;

    this.api.getReservasPorCliente(this.clienteId).subscribe({
      next: (data) => {
        this.todasLasReservas = Array.isArray(data) ? data : (data ? [data] : []);

        if (this.todasLasReservas.length > 0) {
          this.nombreCliente = this.todasLasReservas[0].nombre_titular || 'Pasajero';
        }
        this.aplicarFiltro('TODAS');
      },
      error: (err) => {
        console.error("Error al traer reservas:", err);
        this.todasLasReservas = [];
      }
    });
  }

  aplicarFiltro(estado: string) {
    this.filtroActual = estado;
    this.paginaActual = 1;

    if (estado === 'TODAS') {
      this.reservasFiltradas = this.todasLasReservas;
    } else if (estado === 'EN_CURSO') {
      this.reservasFiltradas = this.todasLasReservas.filter(r =>
        r.estado?.toUpperCase() === 'ABIERTO'
      );
    } else {
      this.reservasFiltradas = this.todasLasReservas.filter(r =>
        r.estado?.toUpperCase() === estado.toUpperCase()
      );
    }
  }

  get reservasPaginadas() {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    return this.reservasFiltradas.slice(inicio, inicio + this.itemsPorPagina);
  }

  cambiarPagina(n: number) {
    this.paginaActual += n;
  }

  totalPaginas() {
    return Math.ceil(this.reservasFiltradas.length / this.itemsPorPagina);
  }

  // CORRECCIÓN: Ajuste de ruta para coincidir con el dashboard de detalle
  verDetalle(id: number) {
    // Según tu estructura de rutas: /reservas/ID
    this.router.navigate(['/reservas', id]);
  }

  eliminarReserva(id: number) {
    if (confirm('¿Estás seguro de eliminar este legajo? Esta acción no se puede deshacer.')) {
      this.api.eliminarReserva(id).subscribe({
        next: () => {
          // Refrescamos la lista localmente para que desaparezca de la tabla
          this.todasLasReservas = this.todasLasReservas.filter(r => r.id !== id);
          this.aplicarFiltro(this.filtroActual);
          alert('Reserva eliminada correctamente');
        },
        error: (err) => {
          console.error("Error al eliminar:", err);
          alert('No se pudo eliminar la reserva');
        }
      });
    }
  }
}