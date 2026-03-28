import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';
import { environment } from '../../environments/env';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient, private router: Router) { }

  login(credenciales: { user: string, pass: string }): Observable<any> {
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

  estaLogueado(): boolean {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('token');
      return token !== null && token !== '' && token !== 'undefined';
    }
    return false;
  }

  getToken(): string | null {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('token');
    }
    return null;
  }

  getNombreEmpresa(): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('empresa_nombre') || 'Agencia';
    }
    return 'Agencia';
  }

  getNombreUsuario(): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('nombre_usuario') || '';
    }
    return '';
  }

  getRol(): string {
    if (typeof window !== 'undefined' && window.localStorage) {
      return localStorage.getItem('user_rol') || 'EMPRESA';
    }
    return 'EMPRESA';
  }

  logout() {
    localStorage.clear();
    sessionStorage.clear();
    this.router.navigate(['/login'], { replaceUrl: true }).then(() => {
      window.location.reload();
    });
  }
}