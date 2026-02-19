import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms'; 
import { ApiService } from '../../services/api'; 
import { AuthService } from '../../services/auth'; 

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterModule, CommonModule, FormsModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar implements OnInit {
  terminoBusqueda: string = '';
  clientes: any[] = [];
  resultados: any[] = [];

  constructor(
    private router: Router, 
    private api: ApiService,
    public auth: AuthService 
  ) {}

  ngOnInit() {
    // 1. Sacamos el nombre de la empresa desde el servicio
    const miAgencia = this.auth.getNombreEmpresa();

    // 2. Llamamos a la API pasando el nombre obtenido
    this.api.getClientesPorAgencia(miAgencia).subscribe({
      next: (data) => {
        this.clientes = data;
      },
      error: (err) => console.error('Error cargando clientes para buscador', err)
    });
  }

  buscarClientes() {
    if (this.terminoBusqueda.length < 2) {
      this.resultados = [];
      return;
    }

    const busqueda = this.terminoBusqueda.toLowerCase();
    
    // Filtramos sobre la lista que ya vino filtrada por agencia desde el servidor
    this.resultados = this.clientes.filter(c => 
      (c.nombre_completo && c.nombre_completo.toLowerCase().includes(busqueda)) || 
      (c.dni_pasaporte && c.dni_pasaporte.toString().includes(busqueda))
    ).slice(0, 5);
  }

  limpiarBusqueda() {
    this.terminoBusqueda = '';
    this.resultados = [];
  }

  // Fusionamos tu lógica de salir con el servicio de auth
  salir() {
    if (confirm('¿Deseas cerrar tu sesión en Traveris Pro?')) {
      this.auth.logout(); 
    }
  }
}