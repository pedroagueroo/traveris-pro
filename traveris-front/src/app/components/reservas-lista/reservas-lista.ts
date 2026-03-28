import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';
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
    private auth: AuthService
  ) { }

  ngOnInit(): void {
    this.obtenerReservas();
  }

  obtenerReservas() {
    const miAgencia = this.auth.getNombreEmpresa();
    this.api.getReservasPorAgencia(miAgencia).subscribe({
      next: (data: any) => {
        this.reservas = data;
        this.reservasCompletas = [...data];
      },
      error: (err: any) => console.error('Error al traer reservas:', err)
    });
  }

  filtrar(tipo: string) {
    if (tipo === 'TODOS') {
      this.reservas = [...this.reservasCompletas];
    } else if (tipo === 'ABIERTO') {
      this.reservas = this.reservasCompletas.filter((r: any) => r.estado === 'ABIERTO');
    } else if (tipo === 'DEUDA') {
      this.reservas = this.reservasCompletas.filter((r: any) => parseFloat(r.saldo_real) > 0.01);
    }
  }

  // Punto 8: Eliminación masiva de reservas
  eliminarTodasReservas() {
    const total = this.reservasCompletas.length;
    if (total === 0) return alert("No hay reservas para eliminar.");

    const paso1 = confirm(`⚠️ ATENCIÓN: Vas a eliminar ${total} reserva(s) y TODOS sus datos asociados.\n\nEsta acción NO se puede deshacer.\n\n¿Continuar?`);
    if (!paso1) return;

    const paso2 = prompt(`Para confirmar, escribí "ELIMINAR TODOS" (en mayúsculas):`);
    if (paso2 !== 'ELIMINAR TODOS') {
      alert("Operación cancelada. El texto no coincide.");
      return;
    }

    let eliminados = 0;
    let errores = 0;

    this.reservasCompletas.forEach((r: any) => {
      this.api.eliminarReserva(r.id).subscribe({
        next: () => {
          eliminados++;
          if (eliminados + errores === total) {
            alert(`Proceso completado: ${eliminados} eliminadas, ${errores} con error.`);
            this.obtenerReservas();
          }
        },
        error: () => {
          errores++;
          if (eliminados + errores === total) {
            alert(`Proceso completado: ${eliminados} eliminadas, ${errores} con error.`);
            this.obtenerReservas();
          }
        }
      });
    });
  }
}