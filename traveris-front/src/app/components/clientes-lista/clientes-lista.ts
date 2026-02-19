import { Component, OnInit } from '@angular/core';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth'; // <--- IMPORTANTE
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
    private auth: AuthService // <--- Inyectamos Auth
  ) { }

  ngOnInit(): void {
    this.obtenerClientes();
  }

  // 1. Primero filtramos la lista completa según la búsqueda
  get clientesFiltrados() {
    const termino = this.terminoBusqueda.toLowerCase();
    return this.clientes.filter(c =>
      c.nombre_completo.toLowerCase().includes(termino) ||
      c.dni_pasaporte.includes(termino)
    );
  }

  // 2. Luego cortamos la lista filtrada para mostrar solo 5
  get clientesPaginados() {
    const inicio = (this.paginaActual - 1) * this.itemsPorPagina;
    const fin = inicio + this.itemsPorPagina;
    return this.clientesFiltrados.slice(inicio, fin);
  }

  // 3. Calculamos el total de páginas basado en el filtro
  get totalPaginas() {
    return Math.ceil(this.clientesFiltrados.length / this.itemsPorPagina);
  }

  // Función para reiniciar la página al buscar
  onSearchChange() {
    this.paginaActual = 1;
  }

  obtenerClientes() {
    // ACOPLAMIENTO: Pedimos solo los clientes de la agencia logueada
    const miAgencia = this.auth.getNombreEmpresa();

    this.api.getClientesPorAgencia(miAgencia).subscribe({
      next: (data) => this.clientes = data,
      error: (err) => console.error('Error al traer clientes:', err)
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
        error: (err) => alert('No se pudo eliminar el cliente.')
      });
    }
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

    // Aseguramos que si las fechas están vacías, viajen como NULL a la base de datos
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
      error: (err) => alert('Error al actualizar: ' + (err.error?.error || 'Error de conexión'))
    });
  }
}