import { EnvironmentProviders, Provider } from '@angular/core';
import { HTTP_INTERCEPTORS, provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

import { AuthInterceptor } from './interceptors/auth.interceptor';
import { ChangeDetectionInterceptor } from './interceptors/change-detection.interceptor';
import { ErrorInterceptor } from './interceptors/error.interceptor';

/**
 * App-wide HTTP client and interceptors (singletons).
 * Import via `app.config.ts` — do not import CoreModule.
 */
export const coreProviders: (Provider | EnvironmentProviders)[] = [
    provideHttpClient(withInterceptorsFromDi()),
    /** Outermost — runs finalize after the full response chain completes. */
    { provide: HTTP_INTERCEPTORS, useClass: ChangeDetectionInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true },
    { provide: HTTP_INTERCEPTORS, useClass: ErrorInterceptor, multi: true },
];
