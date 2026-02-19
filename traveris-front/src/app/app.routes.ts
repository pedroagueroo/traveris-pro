import { Routes } from '@angular/router';
import { ClientesListaComponent } from './components/clientes-lista/clientes-lista';
import { ClienteNuevo } from './components/cliente-nuevo/cliente-nuevo';
import { ReservasListaComponent } from './components/reservas-lista/reservas-lista';
import { ReservaDetalleComponent } from './components/reserva-detalle/reserva-detalle';
import { ReservasClienteComponent } from './components/reservas-cliente/reservas-cliente';
import { ReservaNuevaComponent } from './components/reserva-nueva/reserva-nueva';
import { Dashboard } from './components/dashboard/dashboard';
import { ClienteDetalle } from './components/cliente-detalle/cliente-detalle';
import { Login } from './components/login/login';
import { authGuard } from './guards/auth-guard';
import { Caja } from './components/caja/caja';

export const routes: Routes = [
  // 1. LA ÚNICA RUTA PÚBLICA
  { path: 'login', component: Login },

  // 2. TODAS LAS RUTAS PROTEGIDAS (Con canActivate)
  { 
    path: '', 
    canActivate: [authGuard], 
    children: [
      { path: 'dashboard', component: Dashboard },
      { path: 'caja', component: Caja },
      { path: 'clientes', component: ClientesListaComponent },
      { path: 'clientes/nuevo', component: ClienteNuevo },
      { path: 'clientes/detalle/:id', component: ClienteDetalle },
      
      // Reservas
      { path: 'reservas', component: ReservasListaComponent },
      { path: 'reservas/nuevo', component: ReservaNuevaComponent }, 
      { path: 'reservas/editar/:id', component: ReservaNuevaComponent }, // <--- AGREGADA
      { path: 'reservas/:id', component: ReservaDetalleComponent }, 
      { path: 'reservas-cliente/:id', component: ReservasClienteComponent },

      // Redirección interna: Si entra a la raíz vacía y está logueado, al dashboard
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  },

  // 3. COMODÍN: Si la ruta no existe o falla el guard, al login
  { path: '**', redirectTo: 'login' }
];