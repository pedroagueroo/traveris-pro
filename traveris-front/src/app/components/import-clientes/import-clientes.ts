import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';

interface ResultadoImport {
  total: number;
  insertados: number;
  actualizados: number;
  errores: number;
  detalles_errores: { fila: number; motivo: string; datos: string }[];
}

@Component({
  selector: 'app-import-clientes',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './import-clientes.html',
  styleUrl: './import-clientes.css'
})
export class ImportClientesComponent {
  archivoSeleccionado: File | null = null;
  arrastrando = false;
  procesando = false;
  progreso = 0;
  resultado: ResultadoImport | null = null;
  errorGeneral: string = '';
  etapa: 'seleccion' | 'procesando' | 'resultado' = 'seleccion';

  constructor(
    private api: ApiService,
    private auth: AuthService
  ) {}

  // --- DRAG & DROP ---
  onDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.arrastrando = true;
  }

  onDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.arrastrando = false;
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    this.arrastrando = false;

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.validarArchivo(files[0]);
    }
  }

  // --- SELECCIÓN DE ARCHIVO ---
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.validarArchivo(input.files[0]);
    }
  }

  validarArchivo(file: File) {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'xlsx' && ext !== 'xls') {
      this.errorGeneral = 'Solo se permiten archivos Excel (.xlsx o .xls)';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.errorGeneral = 'El archivo no puede superar los 10MB';
      return;
    }
    this.archivoSeleccionado = file;
    this.errorGeneral = '';
    this.resultado = null;
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  quitarArchivo() {
    this.archivoSeleccionado = null;
    this.errorGeneral = '';
    this.resultado = null;
    this.etapa = 'seleccion';
  }

  // --- IMPORTAR ---
  importar() {
    if (!this.archivoSeleccionado) return;

    this.procesando = true;
    this.progreso = 0;
    this.errorGeneral = '';
    this.resultado = null;
    this.etapa = 'procesando';

    // Simular progreso visual
    const interval = setInterval(() => {
      if (this.progreso < 90) {
        this.progreso += Math.random() * 15;
        if (this.progreso > 90) this.progreso = 90;
      }
    }, 300);

    const formData = new FormData();
    formData.append('archivo', this.archivoSeleccionado);
    formData.append('empresa_nombre', this.auth.getNombreEmpresa());

    this.api.importarClientesExcel(formData).subscribe({
      next: (res) => {
        clearInterval(interval);
        this.progreso = 100;
        this.procesando = false;
        this.resultado = res.resultados;
        this.etapa = 'resultado';
      },
      error: (err) => {
        clearInterval(interval);
        this.procesando = false;
        this.progreso = 0;
        this.errorGeneral = err.error?.error || err.error?.detalle || 'Error inesperado al procesar el archivo';
        this.etapa = 'seleccion';
      }
    });
  }

  // --- NUEVA IMPORTACIÓN ---
  nuevaImportacion() {
    this.archivoSeleccionado = null;
    this.resultado = null;
    this.errorGeneral = '';
    this.progreso = 0;
    this.etapa = 'seleccion';
  }
}
