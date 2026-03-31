import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly STORAGE_KEY = 'traveris_theme';
  private currentTheme: 'light' | 'dark' = 'light';

  constructor() {
    this.initTheme();
  }

  /**
   * Inicializa el tema al arrancar la app:
   * 1. Busca preferencia guardada en localStorage
   * 2. Si no hay, detecta la preferencia del sistema operativo
   * 3. Aplica el tema
   */
  private initTheme(): void {
    if (typeof window === 'undefined') return;

    const saved = localStorage.getItem(this.STORAGE_KEY) as 'light' | 'dark' | null;

    if (saved) {
      this.currentTheme = saved;
    } else {
      // Detectar preferencia del sistema
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.currentTheme = prefersDark ? 'dark' : 'light';
    }

    this.applyTheme();

    // Escuchar cambios en la preferencia del sistema
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      // Solo cambiar automáticamente si no hay preferencia guardada
      if (!localStorage.getItem(this.STORAGE_KEY)) {
        this.currentTheme = e.matches ? 'dark' : 'light';
        this.applyTheme();
      }
    });
  }

  /**
   * Aplica el tema actual al documento
   */
  private applyTheme(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', this.currentTheme);
  }

  /**
   * Alterna entre light y dark
   */
  toggleTheme(): void {
    this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem(this.STORAGE_KEY, this.currentTheme);
    this.applyTheme();
  }

  /**
   * Establece un tema específico
   */
  setTheme(theme: 'light' | 'dark'): void {
    this.currentTheme = theme;
    localStorage.setItem(this.STORAGE_KEY, theme);
    this.applyTheme();
  }

  /**
   * Retorna el tema actual
   */
  getTheme(): 'light' | 'dark' {
    return this.currentTheme;
  }

  /**
   * Verifica si está en dark mode
   */
  isDark(): boolean {
    return this.currentTheme === 'dark';
  }
}
