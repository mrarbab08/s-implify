export const environment = {
    production: false,
    appName: 'S-Implify',
    appVersion: '2.0.0',
    /** Dev deploy hits the real dev backend (not mocked, not localhost). */
    mockBusinessApis: false,
    apiUrl: 'https://simplify-server-dev.niceglacier-fdaf2730.eastus.azurecontainerapps.io/api',
    authApiUrl: 'https://simplify-server-dev.niceglacier-fdaf2730.eastus.azurecontainerapps.io/api/auth',
    defaultLanguage: 'en',
    tokenKey: 'simplify_access_token',
    refreshTokenKey: 'simplify_refresh_token',
    enableDevSandbox: true,
};
