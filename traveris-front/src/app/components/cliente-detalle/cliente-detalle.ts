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

  constructor(
    private route: ActivatedRoute,
    private api: ApiService
  ) {}

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
  }

  estaVencido(fecha: string): boolean {
    if (!fecha) return false;
    const hoy = new Date();
    const fechaDoc = new Date(fecha);
    return fechaDoc < hoy;
  }
}