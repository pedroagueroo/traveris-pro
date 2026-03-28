import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

@Component({
  selector: 'app-clientes-lista',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './clientes-lista.html'
})
export class ClientesListaComponent implements OnInit {
  clientes: any[] = [];
  mostrarModal: boolean = false;
  clienteEditando: any = {};
  terminoBusqueda: string = '';
  paginaActual: number = 1;
  itemsPorPagina: number = 5;

  constructor(
    private api: ApiService,
    private auth: AuthService
  ) { }

  ngOnInit(): void {
    this.obtenerClientes();
  }

  get clientesFiltrados() {
    const termino = this.terminoBusqueda.toLowerCase();
    return this.clientes.filter((c: any) =>
      c.nombre_completo.toLowerCase().includes(termino) ||
      c.dni_pasaporte.includes(termino)
    );
  }

  get clientesPaginados() {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    const fin = inicio + this.itemsPorPagina;
    return this.clientesFiltrados.slice(inicio, fin);
  }

  get totalPaginas() {
    return Math.ceil(this.clientesFiltrados.length / this.itemsPorPagina);
  }

  onSearchChange() {
    this.paginaActual = 1;
  }

  obtenerClientes() {
    const miAgencia = this.auth.getNombreEmpresa();
    this.api.getClientesPorAgencia(miAgencia).subscribe({
      next: (data: any) => this.clientes = data,
      error: (err: any) => console.error('Error al traer clientes:', err)
    });
  }

  exportarExcel() {
    const ws: XLSX.WorkSheet = XLSX.utils.json_to_sheet(this.clientes);
    const wb: XLSX.WorkBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.writeFile(wb, `Clientes_${this.auth.getNombreEmpresa()}.xlsx`);
  }

  confirmarBorrado(cliente: any): void {
    const mensaje = `¿ESTÁS SEGURO? Estás por eliminar permanentemente a: ${cliente.nombre_completo.toUpperCase()}.`;
    if (confirm(mensaje)) {
      this.api.eliminarCliente(cliente.id).subscribe({
        next: () => {
          alert('Registro eliminado correctamente.');
          this.obtenerClientes();
        },
        error: (err: any) => alert('No se pudo eliminar: ' + (err.error?.error || 'El cliente puede tener reservas activas.'))
      });
    }
  }

  // Punto 8: Eliminación masiva de clientes
  eliminarTodosClientes() {
    const total = this.clientes.length;
    if (total === 0) return alert("No hay clientes para eliminar.");
    
    const paso1 = confirm(`⚠️ ATENCIÓN: Vas a eliminar ${total} cliente(s) de la agencia.\n\nEsta acción NO se puede deshacer.\n\n¿Continuar?`);
    if (!paso1) return;
    
    const paso2 = prompt(`Para confirmar, escribí "ELIMINAR TODOS" (en mayúsculas):`);
    if (paso2 !== 'ELIMINAR TODOS') {
      alert("Operación cancelada. El texto no coincide.");
      return;
    }

    let eliminados = 0;
    let errores = 0;
    
    this.clientes.forEach((c: any, index: number) => {
      this.api.eliminarCliente(c.id).subscribe({
        next: () => {
          eliminados++;
          if (eliminados + errores === total) {
            alert(`Proceso completado: ${eliminados} eliminados, ${errores} con error (posiblemente tienen reservas activas).`);
            this.obtenerClientes();
          }
        },
        error: () => {
          errores++;
          if (eliminados + errores === total) {
            alert(`Proceso completado: ${eliminados} eliminados, ${errores} con error (posiblemente tienen reservas activas).`);
            this.obtenerClientes();
          }
        }
      });
    });
  }

  abrirModalEdicion(cliente: any) {
    this.clienteEditando = {
      ...cliente,
      fecha_nacimiento: cliente.fecha_nacimiento ? cliente.fecha_nacimiento.split('T')[0] : '',
      dni_emision: cliente.dni_emision ? cliente.dni_emision.split('T')[0] : '',
      dni_vencimiento: cliente.dni_vencimiento ? cliente.dni_vencimiento.split('T')[0] : '',
      pasaporte_emision: cliente.pasaporte_emision ? cliente.pasaporte_emision.split('T')[0] : '',
      pasaporte_vencimiento: cliente.pasaporte_vencimiento ? cliente.pasaporte_vencimiento.split('T')[0] : ''
    };
    this.mostrarModal = true;
  }

  cerrarModal() {
    this.mostrarModal = false;
    this.clienteEditando = {};
  }

  guardarCambios() {
    if (!this.clienteEditando.id) return;

    const datosLimpios = { ...this.clienteEditando };
    if (!datosLimpios.fecha_nacimiento) datosLimpios.fecha_nacimiento = null;
    if (!datosLimpios.dni_emision) datosLimpios.dni_emision = null;
    if (!datosLimpios.dni_vencimiento) datosLimpios.dni_vencimiento = null;
    if (!datosLimpios.pasaporte_emision) datosLimpios.pasaporte_emision = null;
    if (!datosLimpios.pasaporte_vencimiento) datosLimpios.pasaporte_vencimiento = null;

    this.api.actualizarCliente(this.clienteEditando.id, datosLimpios).subscribe({
      next: () => {
        alert('Ficha actualizada correctamente');
        this.cerrarModal();
        this.obtenerClientes();
      },
      error: (err: any) => alert('Error al actualizar: ' + (err.error?.error || 'Error de conexión'))
    });
  }
}