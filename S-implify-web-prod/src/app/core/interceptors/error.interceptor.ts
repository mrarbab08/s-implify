import { Injectable } from '@angular/core';
import {
    HttpRequest,
    HttpHandler,
    HttpEvent,
    HttpInterceptor,
    HttpErrorResponse,
} from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { Router } from '@angular/router';

/**
 * ErrorInterceptor — CoreModule interceptor.
 * Handles global HTTP error responses:
 *  - 401: Redirects to login (unauthorized / token expired)
 *  - 403: Redirects to unauthorized page
 *  - 500: Logs server error
 */
@Injectable()
export class ErrorInterceptor implements HttpInterceptor {
    constructor(private router: Router) { }

    intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
        return next.handle(request).pipe(
            catchError((error: HttpErrorResponse) => {
                let errorMessage = 'An unknown error occurred';

                if (error.status === 0) {
                    // Common when browser blocks the request (CORS) or backend is unreachable.
                    errorMessage = 'Cannot reach backend. Please check network/CORS and try again.';
                } else if (error.status === 401) {
                    localStorage.clear();
                    this.router.navigate(['/auth/login']);
                    errorMessage = 'Session expired. Please login again.';
                } else if (error.status === 403) {
                    this.router.navigate(['/pages/error403']);
                    errorMessage = 'You do not have permission to perform this action.';
                } else if (error.status === 500) {
                    errorMessage = 'Internal server error. Please try again later.';
                } else if (error.error?.message) {
                    errorMessage = error.error.message;
                }

                console.error(`[ErrorInterceptor] ${error.status}: ${errorMessage}`);
                return throwError(() => new Error(errorMessage));
            }),
        );
    }
}
