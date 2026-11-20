import { ApplicationRef, Injectable, NgZone, inject } from '@angular/core';
import {
    HttpEvent,
    HttpHandler,
    HttpInterceptor,
    HttpRequest,
} from '@angular/common/http';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

/**
 * Ensures Angular runs change detection after business API responses complete.
 * Without this, some screens stay on loading/empty until the user clicks (HTTP
 * callbacks were not triggering a view refresh consistently across the app).
 */
@Injectable()
export class ChangeDetectionInterceptor implements HttpInterceptor {
    private readonly appRef = inject(ApplicationRef);
    private readonly ngZone = inject(NgZone);
    private tickScheduled = false;

    intercept(request: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
        const track = this.isBusinessApiRequest(request.url);
        return next.handle(request).pipe(
            finalize(() => {
                if (track) {
                    this.scheduleTick();
                }
            }),
        );
    }

    private isBusinessApiRequest(url: string): boolean {
        return (
            url.startsWith(environment.apiUrl) ||
            url.startsWith(environment.authApiUrl) ||
            url.includes('/api/')
        );
    }

    /** Coalesce parallel responses in the same turn into one CD cycle. */
    private scheduleTick(): void {
        if (this.tickScheduled) {
            return;
        }
        this.tickScheduled = true;
        queueMicrotask(() => {
            this.tickScheduled = false;
            this.ngZone.run(() => {
                try {
                    this.appRef.tick();
                } catch {
                    /* app may be destroyed mid-flight */
                }
            });
        });
    }
}
