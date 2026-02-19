import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth'; // <--- Inyectamos el servicio de auth
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-reservas-lista',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './reservas-lista.html'
})
export class ReservasListaComponent implements OnInit {
  reservas: any[] = [];
  reservasCompletas: any[] = [];

  constructor(
    private api: ApiService,
    private auth: AuthService // <--- Constructor
  ) { }

  ngOnInit(): void {
    this.obtenerReservas();
  }

  obtenerReservas() {
    // Obtenemos el nombre de la empresa del usuario actual
    const miAgencia = this.auth.getNombreEmpresa();

    // Llamamos a la API usando el filtro de agencia
    this.api.getReservasPorAgencia(miAgencia).subscribe({
      next: (data) => {
        this.reservas = data;
        this.reservasCompletas = [...data];
      },
      error: (err) => console.error('Error al traer reservas:', err)
    });
  }

  filtrar(tipo: string) {
    if (tipo === 'TODOS') {
        this.reservas = [...this.reservasCompletas];
    } else if (tipo === 'ABIERTO') {
        this.reservas = this.reservasCompletas.filter(r => r.estado === 'ABIERTO');
    } else if (tipo === 'DEUDA') {
        this.reservas = this.reservasCompletas.filter(r => parseFloat(r.saldo) > 0.01);
    }
  }
}