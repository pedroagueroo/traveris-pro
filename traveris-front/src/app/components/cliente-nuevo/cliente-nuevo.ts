import { Component } from '@angular/core';
import { ApiService } from '../../services/api';
import { AuthService } from '../../services/auth';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-cliente-nuevo',
  standalone: true,
  imports: [FormsModule, CommonModule],
  templateUrl: './cliente-nuevo.html',
})
export class ClienteNuevo {

  estadoInicial: any = {
    nombre_completo: '',
    dni_pasaporte: '',
    dni_emision: '',
    dni_vencimiento: '',
    email: '',
    telefono: '',
    fecha_nacimiento: '',
    cuit_cuil: '',
    pasaporte_nro: '',
    pasaporte_emision: '',
    pasaporte_vencimiento: '',
    sexo: 'M',
    nacionalidad: 'Argentina',
    pref_asiento: 'INDIFERENTE',
    pref_comida: '',
    observaciones_salud: ''
  };

  clienteEditando: any = { ...this.estadoInicial };

  constructor(
    private api: ApiService,
    private auth: AuthService,
    private router: Router
  ) { }

  cerrarModal(): void {
    this.router.navigate(['/clientes']);
  }

  botonCancelar(): void {
    if (this.clienteEditando.id) {
      this.cerrarModal();
    } else {
      if (confirm('¿Estás seguro que deseas descartar este registro y volver a clientes?')) {
        this.cerrarModal();
      }
    }
  }

  guardarNuevoCliente() {
    if (!this.clienteEditando.nombre_completo || !this.clienteEditando.dni_pasaporte) {
      alert('Nombre y DNI son obligatorios para crear el legajo.');
      return;
    }

    if (this.clienteEditando.dni_pasaporte.length < 7) {
      alert('Error: El DNI debe tener al menos 7 dígitos.');
      return;
    }

    const clienteConAgencia = {
      ...this.clienteEditando,
      empresa_nombre: this.auth.getNombreEmpresa()
    };

    this.api.crearCliente(clienteConAgencia).subscribe({
      next: () => {
        alert('¡Pasajero registrado con éxito!');
        this.cerrarModal();
      },
      error: (err) => {
        if (err.status === 500 && err.error.error?.includes('unique constraint')) {
          alert('Error: Este DNI ya existe en el sistema. Verificá los datos.');
        } else {
          alert('Error en el servidor: ' + (err.error?.error || 'Error desconocido'));
        }
      }
    });
  }

  actualizarCliente() {
    this.api.actualizarCliente(this.clienteEditando.id, this.clienteEditando).subscribe({
      next: () => {
        alert('¡Ficha actualizada correctamente!');
        this.cerrarModal();
      },
      error: (err) => alert('Error al actualizar: ' + (err.error?.error || err.message))
    });
  }
}
