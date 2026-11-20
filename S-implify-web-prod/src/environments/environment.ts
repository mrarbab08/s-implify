export const environment = {
    production: false,
    appName: 'S-Implify',
    appVersion: '2.0.0',
    /**
     * When true, filters/growth/attendance use in-memory data (no HTTP). Use for UI work without a backend.
     * Also enables the demo login credentials in AuthService (non-production builds only).
     * When false, FiltersService and related calls hit `apiUrl` (Network tab shows requests; backend must be running).
     */
    mockBusinessApis: false,
    apiUrl: 'http://localhost:8080/api',
    authApiUrl: 'http://localhost:8080/api/auth',
    defaultLanguage: 'en',
    tokenKey: 'simplify_access_token',
    refreshTokenKey: 'simplify_refresh_token',
    /** When true, Vristo template demo routes (apps, components, forms, etc.) are registered. */
    enableDevSandbox: true,
};
