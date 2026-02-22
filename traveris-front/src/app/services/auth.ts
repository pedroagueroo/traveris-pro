import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment.prod';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Asegúrate de que el servidor Node.js esté corriendo en el puerto 3000
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient, private router: Router) { }

  // En tu auth.ts, cambiá la función login para que incluya '/auth'
  login(credenciales: { user: string, pass: string }): Observable<any> {
    // Agregamos /auth antes de /login para que coincida con tu backend
    return this.http.post(`${this.apiUrl}/auth/login`, credenciales).pipe(
      tap((res: any) => {
        localStorage.setItem('token', res.token);
        localStorage.setItem('empresa_nombre', res.empresa_nombre);
        localStorage.setItem('user_rol', res.rol);
        localStorage.setItem('nombre_usuario', res.nombre_usuario);
        this.router.navigate(['/dashboard']);
      })
    );
  }

  // Verifica con rigor si existe un token real para el Guard y el Navbar
  estaLogueado(): boolean {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      // Verificamos que no sea nulo, vacío o un texto de error
      return token !== null && token !== '' && token !== 'undefined';
    }
    return false;
  }

  getNombreEmpresa(): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('empresa_nombre') || 'Agencia';
    }
    return 'Agencia';
  }

  // MÉTODO DE CIERRE TOTAL (Soluciona el error del botón "Atrás")
  logout() {
    // 1. Borramos rastro de sesión y búsqueda
    localStorage.clear();
    sessionStorage.clear();

    // 2. Navegamos al login borrando el historial de navegación actual
    this.router.navigate(['/login'], { replaceUrl: true }).then(() => {
      // 3. Recargamos para resetear los estados de los componentes y el Guard
      window.location.reload();
    });
  }
}