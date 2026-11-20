import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/**
 * ApiService — CoreModule centralized HTTP service.
 * All feature services should inject this and call the typed methods
 * rather than injecting HttpClient directly.
 */
@Injectable({
    providedIn: 'root',
})
export class ApiService {
    private readonly baseUrl = environment.apiUrl;

    constructor(private http: HttpClient) { }

    private getHeaders(): HttpHeaders {
        const token = localStorage.getItem(environment.tokenKey);
        return new HttpHeaders({
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        });
    }

    get<T>(path: string, params?: any): Observable<T> {
        return this.http.get<T>(`${this.baseUrl}/${path}`, {
            headers: this.getHeaders(),
            params,
        });
    }

    post<T>(path: string, body: any): Observable<T> {
        return this.http.post<T>(`${this.baseUrl}/${path}`, body, {
            headers: this.getHeaders(),
        });
    }

    put<T>(path: string, body: any): Observable<T> {
        return this.http.put<T>(`${this.baseUrl}/${path}`, body, {
            headers: this.getHeaders(),
        });
    }

    patch<T>(path: string, body: any): Observable<T> {
        return this.http.patch<T>(`${this.baseUrl}/${path}`, body, {
            headers: this.getHeaders(),
        });
    }

    delete<T>(path: string): Observable<T> {
        return this.http.delete<T>(`${this.baseUrl}/${path}`, {
            headers: this.getHeaders(),
        });
    }
}
