import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  
  // No agregar token a la ruta de login
  if (req.url.includes('/auth/login')) {
    return next(req);
  }

  const token = auth.getToken();
  
  if (token) {
    req = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  return next(req).pipe(
    catchError((error) => {
      // Si el token expiró o es inválido, redirigir al login
      if (error.status === 401 || error.status === 403) {
        auth.logout();
      }
      return throwError(() => error);
    })
  );
};