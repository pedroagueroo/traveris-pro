import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ApiService } from '../../services/api';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-cliente-detalle',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './cliente-detalle.html'
})
export class ClienteDetalle implements OnInit {
  cliente: any = null;

  archivosCliente: any[] = [];

  constructor(
    private route: ActivatedRoute,
    private api: ApiService
  ) { }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.api.getClientePorId(id).subscribe({
        next: (data: any) => {
          this.cliente = data;
        },
        error: (err: any) => console.error('Error al cargar perfil:', err)
      });
    }

    this.cargarArchivosCliente();
  }

  cargarArchivosCliente() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.api.getArchivosCliente(id).subscribe({
        next: (data: any[]) => this.archivosCliente = data,
        error: () => this.archivosCliente = []
      });
    }
  }

  onFileSelectedCliente(event: any) {
    const file: File = event.target.files[0];
    if (!file) return;

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    const formData = new FormData();
    formData.append('archivo', file);

    this.api.subirArchivoCliente(id, formData).subscribe({
      next: () => {
        alert("Archivo subido con éxito");
        this.cargarArchivosCliente();
      },
      error: () => alert("Error al subir el archivo")
    });
  }

  eliminarArchivoCliente(idArchivo: number) {
    if (confirm("¿Eliminar este archivo?")) {
      this.api.eliminarArchivoCliente(idArchivo).subscribe({
        next: () => {
          alert("Archivo eliminado");
          this.cargarArchivosCliente();
        },
        error: () => alert("Error al eliminar")
      });
    }
  }

  descargarArchivo(ruta: string) {
    const url = this.api.getUrlDescarga(ruta);
    window.open(url, '_blank');
  }

  estaVencido(fecha: string): boolean {
    if (!fecha) return false;
    const hoy = new Date();
    const fechaDoc = new Date(fecha);
    return fechaDoc < hoy;
  }
}