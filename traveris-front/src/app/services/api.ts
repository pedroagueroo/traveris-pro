import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private URL = 'http://localhost:3000'; // Tu puerto de Node.js

  constructor(private http: HttpClient) { }

  // --- SECCIÓN CLIENTES ---
  // Ahora usamos siempre la versión por agencia para el listado principal
  getClientesPorAgencia(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/clientes/agencia/${empresa}`);
  }

  getClientePorId(id: any): Observable<any> {
    return this.http.get(`${this.URL}/clientes/${id}`);
  }

  crearCliente(cliente: any): Observable<any> {
    return this.http.post(`${this.URL}/clientes`, cliente);
  }

  actualizarCliente(id: number, cliente: any): Observable<any> {
    return this.http.put(`${this.URL}/clientes/${id}`, cliente);
  }

  eliminarCliente(id: number): Observable<any> {
    return this.http.delete(`${this.URL}/clientes/${id}`);
  }

  // --- SECCIÓN RESERVAS (LEGAJOS) ---
  getReservasPorAgencia(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/reservas/agencia/${empresa}`);
  }

  getReservaPorId(id: number): Observable<any> {
    return this.http.get(`${this.URL}/reservas/${id}`);
  }

  crearReserva(reserva: any): Observable<any> {
    return this.http.post(`${this.URL}/reservas`, reserva);
  }

  eliminarReserva(id: number): Observable<any> {
    return this.http.delete(`${this.URL}/reservas/${id}`);
  }

  actualizarEstadoReserva(id: number, estado: string): Observable<any> {
    return this.http.put(`${this.URL}/reservas/${id}/estado`, { estado });
  }

  getReservasPorCliente(idCliente: string): Observable<any> {
    return this.http.get(`${this.URL}/reservas/cliente/${idCliente}`);
  }

  // --- SECCIÓN RESERVAS (NUEVAS FUNCIONES PARA EDICIÓN) ---

// Esta es la que trae el legajo con sus vuelos, pasajeros y servicios de una
getReservaDetalleCompleto(id: any): Observable<any> {
  return this.http.get(`${this.URL}/reservas/completa/${id}`);
}

// Esta es la que manda el payload gigante para sobreescribir los cambios
actualizarReserva(id: any, reserva: any): Observable<any> {
  return this.http.put(`${this.URL}/reservas/${id}`, reserva);
}

  // --- SECCIÓN CAJA (MOVIMIENTOS) ---
  getMovimientosPorReserva(idReserva: number): Observable<any> {
    return this.http.get(`${this.URL}/caja/reserva/${idReserva}`);
  }

  eliminarMovimiento(id: number): Observable<any> {
    // Verificamos que no se cuelen caracteres extraños
    return this.http.delete(`${this.URL}/caja/${id}`);
  }

  convertirMoneda(datos: any): Observable<any> {
    return this.http.post(`${this.URL}/caja/convertir-moneda`, datos);
  }

  // --- SECCIÓN DASHBOARD (FILTRADO CRÍTICO) ---

  // Esta función arregla los paneles de colores (Azul, Rojo, Verde)
  getDashboardStats(empresa: string): Observable<any> {
    return this.http.get(`${this.URL}/reservas/dashboard/stats/${empresa}`);
  }

  // Esta función arregla la tabla de movimientos del Dashboard
  getUltimosMovimientos(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/caja/ultimos/${empresa}`);
  }

  // --- SECCIÓN CAJA CONTABLE (NUEVAS RUTAS) ---

  // Cambiamos el POST para que use la nueva ruta de registro unificado
  crearMovimientoCaja(datos: any): Observable<any> {
    return this.http.post(`${this.URL}/api/caja-contable/registrar`, datos);
  }

  getBalanceCaja(empresa: string): Observable<any> {
    // Cambiamos 'balance-general' por la ruta que configuramos en el back
    return this.http.get(`${this.URL}/api/caja-contable/balance-general/${empresa}`);
  }
  // Actualizamos el reporte diario
  getReporteDiario(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/api/caja-contable/reporte-diario/${empresa}`);
  }

  // Actualizamos las cotizaciones
  getCotizacionesCompletas(): Observable<any> {
    return this.http.get(`${this.URL}/api/caja-contable/cotizaciones-completas`);
  }

  eliminarMovimientoContable(id: number): Observable<any> {
    return this.http.delete(`${this.URL}/api/caja-contable/${id}`);
  }

  getBalanceBilleteras(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/api/caja-contable/balance-billeteras/${empresa}`);
  }


  getRadarVencimientos(empresa: string): Observable<any[]> {
    // Quitamos el '/api' inicial porque tus rutas de reserva no lo usan
    return this.http.get<any[]>(`${this.URL}/reservas/radar/vencimientos/${empresa}`);
  }


  // --- SECCIÓN GESTIÓN DE ARCHIVOS ---

  // Subir un archivo (PDF, Imagen, etc.) al legajo
  subirArchivoReserva(idReserva: number, formData: FormData): Observable<any> {
    return this.http.post(`${this.URL}/reservas/${idReserva}/subir-archivo`, formData);
  }

  // Obtener la lista de archivos asociados a una reserva
  getArchivosReserva(idReserva: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/reservas/${idReserva}/archivos`);
  }

  // Opcional: Eliminar un archivo si te equivocaste al subirlo
  eliminarArchivoReserva(idArchivo: number): Observable<any> {
    return this.http.delete(`${this.URL}/reservas/archivo/${idArchivo}`);
  }

  // --- SECCIÓN DE NOTIFICACIONES Y CORREO ---

  // Envía documentación (Voucher/Cotización) por email al cliente
  enviarMail(idReserva: number, datosMail: any): Observable<any> {
    return this.http.post(`${this.URL}/reservas/${idReserva}/enviar-documento`, datosMail);
  }

  // Obtiene los cumpleañeros del día para el radar
  getRadarCumpleanios(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/clientes/radar/cumpleanios/${empresa}`);
  }

  enviarSaludoCumple(datos: { email: string, nombre: string }): Observable<any> {
  return this.http.post(`${this.URL}/clientes/enviar-saludo-cumple`, datos);
}

}

