import { Component } from '@angular/core';
import { AuthService } from '../../services/auth';
import { Router } from '@angular/router';
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
  loading: boolean = false;
  errorMessage: string = '';
  verPassword = false;

  constructor(private auth: AuthService, private router: Router) {}

  ngOnInit() {
    if (this.auth.estaLogueado()) {
      this.router.navigate(['/dashboard']);
    }
  }

  togglePasswordVisibility() {
    this.verPassword = !this.verPassword;
  }

  onLogin() {
    this.errorLogin = false;
    this.errorMessage = '';

    if (!this.credenciales.user || !this.credenciales.pass) {
      this.errorLogin = true;
      this.errorMessage = 'Completá ambos campos para continuar.';
      return;
    }

    this.loading = true;

    this.auth.login(this.credenciales).subscribe({
      next: (res) => {
        this.loading = false;
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        this.loading = false;
        this.errorLogin = true;
        this.errorMessage = 'Usuario o contraseña incorrectos.';
      }
    });
  }
}