export const environment = {
    production: true,
    appName: 'S-Implify',
    appVersion: '2.0.0',
    /**
     * Production always talks to the real API through the same origin:
     * nginx (see nginx.conf) proxies `/api/` to the backend container.
     * Relative URLs keep the bundle domain-agnostic — no rebuild needed when
     * the domain changes, and no CORS preflights.
     */
    mockBusinessApis: false,
    apiUrl: '/api',
    authApiUrl: '/api/auth',
    defaultLanguage: 'en',
    tokenKey: 'simplify_access_token',
    refreshTokenKey: 'simplify_refresh_token',
    /** When true, Vristo template demo routes (apps, components, forms, etc.) are registered. */
    enableDevSandbox: false,
};
