import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/env';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private URL = environment.apiUrl;

  constructor(private http: HttpClient) { }

  // ============================================================
  // SECCIÓN CLIENTES
  // ============================================================

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

  // ============================================================
  // SECCIÓN RESERVAS (LEGAJOS)
  // ============================================================

  getReservasPorAgencia(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/reservas/agencia/${empresa}`);
  }

  // FIX: Acepta any para evitar conflictos string/number
  getReservaPorId(id: any): Observable<any> {
    return this.http.get(`${this.URL}/reservas/${id}`);
  }

  crearReserva(reserva: any): Observable<any> {
    return this.http.post(`${this.URL}/reservas`, reserva);
  }

  // FIX: Acepta any para compatibilidad con string | number
  actualizarReserva(id: any, datos: any): Observable<any> {
    return this.http.put(`${this.URL}/reservas/${id}`, datos);
  }

  // FIX: Acepta any para compatibilidad
  actualizarEstadoReserva(id: any, estado: string): Observable<any> {
    return this.http.put(`${this.URL}/reservas/${id}/estado`, { estado });
  }

  // FIX: Acepta any para compatibilidad string/number
  eliminarReserva(id: any): Observable<any> {
    return this.http.delete(`${this.URL}/reservas/${id}`);
  }

  // FIX: Acepta any para evitar error ts(2322) en reserva-nueva.ts
  getReservaDetalleCompleto(id: any): Observable<any> {
    return this.http.get(`${this.URL}/reservas/completa/${id}`);
  }

  // FIX: Acepta any para que no rompa cuando se llama con string
  getReservasPorCliente(idCliente: any): Observable<any> {
    return this.http.get(`${this.URL}/reservas/cliente/${idCliente}`);
  }

  // ============================================================
  // SECCIÓN CAJA (MOVIMIENTOS)
  // ============================================================

  getMovimientosPorReserva(idReserva: any): Observable<any> {
    return this.http.get(`${this.URL}/caja/reserva/${idReserva}`);
  }

  eliminarMovimiento(id: number): Observable<any> {
    return this.http.delete(`${this.URL}/caja/${id}`);
  }

  convertirMoneda(datos: any): Observable<any> {
    return this.http.post(`${this.URL}/caja/convertir-moneda`, datos);
  }

  // ============================================================
  // SECCIÓN DASHBOARD
  // ============================================================

  getDashboardStats(empresa: string): Observable<any> {
    return this.http.get(`${this.URL}/reservas/dashboard/stats/${empresa}`);
  }

  getUltimosMovimientos(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/caja/ultimos/${empresa}`);
  }

  // ============================================================
  // SECCIÓN CAJA CONTABLE
  // ============================================================

  crearMovimientoCaja(datos: any): Observable<any> {
    return this.http.post(`${this.URL}/caja-contable/registrar`, datos);
  }

  getBalanceCaja(empresa: string): Observable<any> {
    return this.http.get(`${this.URL}/caja-contable/balance-general/${empresa}`);
  }

  getReporteDiario(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/caja-contable/reporte-diario/${empresa}`);
  }

  getCotizacionesCompletas(): Observable<any> {
    return this.http.get(`${this.URL}/caja-contable/cotizaciones-completas`);
  }

  eliminarMovimientoContable(id: number): Observable<any> {
    return this.http.delete(`${this.URL}/caja-contable/${id}`);
  }

  getBalanceBilleteras(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/caja-contable/balance-billeteras/${empresa}`);
  }

  getRadarVencimientos(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/reservas/radar/vencimientos/${empresa}`);
  }

  // ============================================================
  // SECCIÓN GESTIÓN DE ARCHIVOS
  // ============================================================

  subirArchivoReserva(idReserva: any, formData: FormData): Observable<any> {
    return this.http.post(`${this.URL}/reservas/${idReserva}/subir-archivo`, formData);
  }

  getArchivosReserva(idReserva: any): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/reservas/${idReserva}/archivos`);
  }

  eliminarArchivoReserva(idArchivo: number): Observable<any> {
    return this.http.delete(`${this.URL}/reservas/archivo/${idArchivo}`);
  }

  // --- ARCHIVOS DE CLIENTE ---

  subirArchivoCliente(idCliente: any, formData: FormData): Observable<any> {
    return this.http.post(`${this.URL}/clientes/${idCliente}/subir-archivo`, formData);
  }

  getArchivosCliente(idCliente: any): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/clientes/${idCliente}/archivos`);
  }

  eliminarArchivoCliente(idArchivo: number): Observable<any> {
    return this.http.delete(`${this.URL}/clientes/archivo/${idArchivo}`);
  }

  // --- HELPER: URL de descarga para cualquier archivo ---
  getUrlDescarga(rutaArchivo: string): string {
    // ruta_archivo viene como "uploads/xxx" o "uploads/clientes/xxx"
    return `${this.URL}/${rutaArchivo}`;
  }

  // ============================================================
  // SECCIÓN NOTIFICACIONES Y CORREO
  // ============================================================

  enviarMail(idReserva: any, datosMail: any): Observable<any> {
    return this.http.post(`${this.URL}/reservas/${idReserva}/enviar-documento`, datosMail);
  }

  getRadarCumpleanios(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/clientes/radar/cumpleanios/${empresa}`);
  }

  enviarSaludoCumple(datos: { email: string, nombre: string }): Observable<any> {
    return this.http.post(`${this.URL}/clientes/enviar-saludo-cumple`, datos);
  }

  // ============================================================
  // SECCIÓN IMPORTACIÓN MASIVA
  // ============================================================

  importarClientesExcel(formData: FormData): Observable<any> {
    return this.http.post(`${this.URL}/import-clientes/upload`, formData);
  }

  // ============================================================
  // SECCIÓN PAGOS CON TARJETA (placeholder — se implementará completo)
  // ============================================================

  pagarDeudaTarjeta(datos: any): Observable<any> {
    return this.http.post(`${this.URL}/caja-contable/pagar-tarjeta`, datos);
  }

  // ============================================================
  // SECCIÓN CIERRE MENSUAL
  // ============================================================

  // ============================================================
  // SECCIÓN CIERRE MENSUAL
  // ============================================================

  getCierreMensual(empresa: string, queryParams: string): Observable<any> {
    return this.http.get(`${this.URL}/caja-contable/cierre-mensual/${encodeURIComponent(empresa)}${queryParams}`);
  }

  // ============================================================
  // SECCIÓN RECIBOS
  // ============================================================

  generarRecibo(datos: any): Observable<any> {
    return this.http.post(`${this.URL}/recibos/generar`, datos);
  }

  getRecibosPorReserva(idReserva: any): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/recibos/reserva/${idReserva}`);
  }

  getRecibosPorEmpresa(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/recibos/empresa/${empresa}`);
  }

  getReciboPorId(id: number): Observable<any> {
    return this.http.get(`${this.URL}/recibos/${id}`);
  }

  anularRecibo(id: number): Observable<any> {
    return this.http.put(`${this.URL}/recibos/anular/${id}`, {});
  }
}