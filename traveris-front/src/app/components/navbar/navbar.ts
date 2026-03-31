import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms'; 
import { ApiService } from '../../services/api'; 
import { AuthService } from '../../services/auth';
import { ThemeService } from '../../services/theme';

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
  sidebarCollapsed: boolean = false;
  mobileMenuOpen: boolean = false;

  constructor(
    private router: Router, 
    private api: ApiService,
    public auth: AuthService,
    public theme: ThemeService
  ) {}

  ngOnInit() {
    const miAgencia = this.auth.getNombreEmpresa();
    this.api.getClientesPorAgencia(miAgencia).subscribe({
      next: (data) => this.clientes = data,
      error: (err) => console.error('Error cargando clientes para buscador', err)
    });

    // Colapsar sidebar en pantallas pequeñas por defecto
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      this.sidebarCollapsed = true;
    }
  }

  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
  }

  toggleMobileMenu() {
    this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  closeMobileMenu() {
    this.mobileMenuOpen = false;
  }

  buscarClientes() {
    if (this.terminoBusqueda.length < 2) {
      this.resultados = [];
      return;
    }
    const busqueda = this.terminoBusqueda.toLowerCase();
    this.resultados = this.clientes.filter(c => 
      (c.nombre_completo && c.nombre_completo.toLowerCase().includes(busqueda)) || 
      (c.dni_pasaporte && c.dni_pasaporte.toString().includes(busqueda))
    ).slice(0, 5);
  }

  limpiarBusqueda() {
    this.terminoBusqueda = '';
    this.resultados = [];
  }

  salir() {
    if (confirm('¿Deseas cerrar tu sesión en Traveris Pro?')) {
      this.auth.logout(); 
    }
  }
}