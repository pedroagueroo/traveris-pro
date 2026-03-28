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

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN CLIENTES
  // ═══════════════════════════════════════════════════════════════════════════

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

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN RESERVAS (LEGAJOS)
  // ═══════════════════════════════════════════════════════════════════════════

  getReservasPorAgencia(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/reservas/agencia/${empresa}`);
  }

  getReservaPorId(id: number): Observable<any> {
    return this.http.get(`${this.URL}/reservas/${id}`);
  }

  crearReserva(reserva: any): Observable<any> {
    return this.http.post(`${this.URL}/reservas`, reserva);
  }

  actualizarReserva(id: number, datos: any): Observable<any> {
    return this.http.put(`${this.URL}/reservas/${id}`, datos);
  }

  eliminarReserva(id: number): Observable<any> {
    return this.http.delete(`${this.URL}/reservas/${id}`);
  }

  getReservaCompleta(id: string): Observable<any> {
    return this.http.get(`${this.URL}/reservas/completa/${id}`);
  }

  actualizarEstadoReserva(id: number, estado: string): Observable<any> {
    return this.http.put(`${this.URL}/reservas/${id}/estado`, { estado });
  }

  getReservasPorCliente(idCliente: any): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/reservas/cliente/${idCliente}`);
  }

  getDashboardStats(empresa: string): Observable<any> {
    return this.http.get(`${this.URL}/reservas/dashboard/stats/${empresa}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN CAJA OPERATIVA
  // ═══════════════════════════════════════════════════════════════════════════

  getMovimientosPorReserva(idReserva: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/caja/reserva/${idReserva}`);
  }

  getUltimosMovimientos(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/caja/ultimos/${empresa}`);
  }

  convertirMoneda(datos: any): Observable<any> {
    return this.http.post(`${this.URL}/caja/convertir-moneda`, datos);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN CAJA CONTABLE (Módulo financiero)
  // ═══════════════════════════════════════════════════════════════════════════

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

  // NUEVO: Pago de deuda de tarjeta
  pagarDeudaTarjeta(datos: any): Observable<any> {
    return this.http.post(`${this.URL}/caja-contable/pagar-tarjeta`, datos);
  }

  // NUEVO: Cierre mensual
  getCierreMensual(empresa: string, mes?: number, anio?: number): Observable<any> {
    let url = `${this.URL}/caja-contable/cierre-mensual/${empresa}`;
    const params: string[] = [];
    if (mes) params.push(`mes=${mes}`);
    if (anio) params.push(`anio=${anio}`);
    if (params.length > 0) url += '?' + params.join('&');
    return this.http.get(url);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN RADAR Y VENCIMIENTOS
  // ═══════════════════════════════════════════════════════════════════════════

  getRadarVencimientos(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/reservas/radar/vencimientos/${empresa}`);
  }

  getRadarCumpleanios(empresa: string): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/clientes/radar/cumpleanios/${empresa}`);
  }

  enviarSaludoCumple(datos: { email: string, nombre: string, empresa_nombre?: string }): Observable<any> {
    return this.http.post(`${this.URL}/clientes/enviar-saludo-cumple`, datos);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN GESTIÓN DE ARCHIVOS
  // ═══════════════════════════════════════════════════════════════════════════

  subirArchivoReserva(idReserva: number, formData: FormData): Observable<any> {
    return this.http.post(`${this.URL}/reservas/${idReserva}/subir-archivo`, formData);
  }

  getArchivosReserva(idReserva: number): Observable<any[]> {
    return this.http.get<any[]>(`${this.URL}/reservas/${idReserva}/archivos`);
  }

  eliminarArchivoReserva(idArchivo: number): Observable<any> {
    return this.http.delete(`${this.URL}/reservas/archivo/${idArchivo}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN EMAILS Y DOCUMENTOS
  // ═══════════════════════════════════════════════════════════════════════════

  enviarMail(idReserva: number, datosMail: any): Observable<any> {
    return this.http.post(`${this.URL}/reservas/${idReserva}/enviar-documento`, datosMail);
  }

  // NUEVO: Cotización segura (sin exponer costos internos)
  getCotizacionReserva(idReserva: number): Observable<any> {
    return this.http.get(`${this.URL}/reservas/${idReserva}/cotizacion`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECCIÓN IMPORTACIÓN MASIVA
  // ═══════════════════════════════════════════════════════════════════════════

  importarClientesExcel(formData: FormData): Observable<any> {
    return this.http.post(`${this.URL}/import-clientes/upload`, formData);
  }

  // --- SECCIÓN RECIBOS ---

  generarRecibo(datos: any): Observable<any> {
    return this.http.post(`${this.URL}/recibos/generar`, datos);
  }

  getRecibosPorReserva(idReserva: number): Observable<any[]> {
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