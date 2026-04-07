import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-reservas-lista',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './reservas-lista.html'
})
export class ReservasListaComponent implements OnInit {
  reservas: any[] = [];
  reservasCompletas: any[] = [];
  
  // Paginación
  paginaActual: number = 1;
  itemsPorPagina: number = 10;
  terminoBusqueda: string = '';

  get reservasFiltradas() {
    const termino = this.terminoBusqueda.toLowerCase();
    return this.reservas.filter((r: any) =>
      (r.titular_nombre && r.titular_nombre.toLowerCase().includes(termino)) ||
      (r.destino_final && r.destino_final.toLowerCase().includes(termino)) ||
      (r.id && r.id.toString().includes(termino))
    );
  }

  get reservasPaginadas() {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    const fin = inicio + this.itemsPorPagina;
    return this.reservasFiltradas.slice(inicio, fin);
  }

  get totalPaginas() {
    return Math.ceil(this.reservasFiltradas.length / this.itemsPorPagina);
  }

  onSearchChange() {
    this.paginaActual = 1;
  }

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
      next: (data: any[]) => {
        const processed = data.map((r: any) => {
            const cArs = parseFloat(r.saldo_cobrar_ars) || 0;
            const cUsd = parseFloat(r.saldo_cobrar_usd) || 0;
            const cEur = parseFloat(r.saldo_cobrar_eur) || 0;
            const pArs = parseFloat(r.saldo_pagar_ars) || 0;
            const pUsd = parseFloat(r.saldo_pagar_usd) || 0;
            const pEur = parseFloat(r.saldo_pagar_eur) || 0;
            
            // Requisito 11.1: Saldada SOLO SI TODOS los balances son 0.
            r.estaSaldada = Math.abs(cArs) <= 0.01 && Math.abs(cUsd) <= 0.01 && Math.abs(cEur) <= 0.01 && 
                            Math.abs(pArs) <= 0.01 && Math.abs(pUsd) <= 0.01 && Math.abs(pEur) <= 0.01;
            
            r.tieneDeudaCliente = cArs > 0.01 || cUsd > 0.01 || cEur > 0.01;
            return r;
        });
        this.reservas = processed;
        this.reservasCompletas = [...processed];
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
      this.reservas = this.reservasCompletas.filter((r: any) => r.tieneDeudaCliente);
    } else if (tipo === 'SALDADA') {
      this.reservas = this.reservasCompletas.filter((r: any) => r.estaSaldada);
    }
  }

  // Eliminación individual de reserva
  eliminarReservaIndividual(id: number) {
    const paso1 = confirm(`⚠️ ATENCIÓN: Vas a eliminar (Soft Delete) la reserva #${id} y sus datos asociados.\n\n¿Estás seguro/a de continuar?`);
    if (!paso1) return;

    this.api.eliminarReserva(id).subscribe({
      next: () => {
        alert(`Reserva #${id} eliminada correctamente.`);
        this.obtenerReservas();
      },
      error: () => {
        alert(`Error al eliminar la reserva #${id}.`);
      }
    });
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