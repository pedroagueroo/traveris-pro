import { Component } from '@angular/core';
import { AuthService } from '../../services/auth'; // Verifica que la ruta sea correcta
import { Router } from '@angular/router'; // <--- CAMBIA ESTO (debe ser @angular/router)
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  credenciales = { user: '', pass: '' };
  errorLogin: boolean = false;

  constructor(private auth: AuthService, private router: Router) {}

  // En tu login.ts, dentro del ngOnInit
ngOnInit() {
  if (this.auth.estaLogueado()) {
    this.router.navigate(['/dashboard']);
  }
}

  onLogin() {
    this.auth.login(this.credenciales).subscribe({
      next: (res) => {
        console.log('Login exitoso:', res);
        this.router.navigate(['/']); // Ahora sí reconocerá el método navigate
      },
      error: (err) => {
        this.errorLogin = true;
        alert('Acceso denegado: Usuario o contraseña incorrectos.');
      }
    });
  }
}