import { Component, signal } from '@angular/core';
import { NavigationEnd, RouterOutlet,Router } from '@angular/router';
import { Navbar } from "./components/navbar/navbar";
import { CommonModule } from '@angular/common'; 
import { AuthService } from './services/auth'; 
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, Navbar, CommonModule], 
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('traveris-front');
  // Dentro de la clase App
esPaginaLogin: boolean = false;

constructor(public auth: AuthService, private router: Router) {
  // Escuchamos cada cambio de página
  this.router.events.pipe(
    filter(event => event instanceof NavigationEnd)
  ).subscribe((event: any) => {
    // Si la URL es /login, marcamos que estamos en el login
    this.esPaginaLogin = event.url.includes('/login');
  });
}}