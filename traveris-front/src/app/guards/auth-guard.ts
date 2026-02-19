import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth'; 

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.estaLogueado()) {
    return true; 
  } else {
    // Si intenta entrar a /dashboard sin estar logueado, lo mandamos al login
    // y borramos el historial para que no pueda volver con la flecha atrás.
    console.warn('Acceso denegado: Redirigiendo al Login por falta de credenciales');
    router.navigate(['/login'], { replaceUrl: true });
    return false;
  }
};