import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ApiService } from '../../services/api';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-cliente-detalle',
  standalone: true,
  imports: [CommonModule,FormsModule, RouterModule],
  templateUrl: './cliente-detalle.html'
})
export class ClienteDetalle implements OnInit {
  cliente: any = null; // Empezamos en null para saber cuando carga

  constructor(
    private route: ActivatedRoute,
    private api: ApiService
  ) {}

  ngOnInit(): void {
    // Tomamos el ID de la URL
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.api.getClientePorId(id).subscribe({
        next: (data) => {
          this.cliente = data;
          console.log('Datos cargados:', this.cliente);
        },
        error: (err) => console.error('Error al cargar perfil:', err)
      });
    }
  }
}