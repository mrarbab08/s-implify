# S-Implify — Angular Feature-Based Architecture

## Overview

This project follows a **Feature-Based Architecture** pattern with strict module boundaries,
centralized singleton services, and environment-driven configuration.

---

## Directory Structure

```
src/
├── environments/
│   ├── environment.ts          # Dev config (apiUrl, tokenKey, appVersion…)
│   └── environment.prod.ts     # Prod config — never hardcode values
│
├── app/
│   ├── core/                   # ← Loaded ONCE by AppModule
│   │   ├── core.module.ts
│   │   ├── index.ts            # Barrel exports
│   │   ├── services/
│   │   │   ├── app-initializer.service.ts   # Theme/locale bootstrap
│   │   │   ├── api.service.ts               # Centralized HTTP wrapper
│   │   │   └── auth.service.ts              # Login, logout, token mgmt
│   │   ├── guards/
│   │   │   ├── auth.guard.ts                # Protect authenticated routes
│   │   │   └── guest.guard.ts               # Prevent auth'd users on login pages
│   │   └── interceptors/
│   │       ├── auth.interceptor.ts          # Auto-inject Bearer token
│   │       └── error.interceptor.ts         # Global 401/403/500 handling
│   │
│   ├── shared/                 # ← Reusable UI modules (no business logic)
│   │   ├── shared.module.ts    # All third-party UI modules, icons, forms
│   │   └── icon/               # SVG icon components
│   │
│   ├── layouts/                # ← All layout shells
│   │   ├── layouts.module.ts
│   │   ├── app-layout/         # Main authenticated shell
│   │   ├── auth-layout/        # Auth/public shell
│   │   ├── header/
│   │   ├── footer/
│   │   ├── sidebar/
│   │   └── theme-customizer/
│   │
│   ├── store/                  # ← NgRx state management
│   │   ├── index.ts            # Barrel: actions + selectors + reducers
│   │   ├── index.reducer.ts    # Legacy reducer (string action types)
│   │   └── theme/
│   │       ├── theme.actions.ts    # Typed createAction() actions
│   │       ├── theme.selectors.ts  # createSelector() selectors
│   │       └── theme.reducer.ts    # Typed createReducer() reducer
│   │
│   ├── features/               # ← Lazy-loaded feature modules
│   │   ├── dashboard/
│   │   │   └── dashboard.module.ts
│   │   └── auth/
│   │       └── auth.module.ts
│   │
│   ├── apps/                   # Lazy — Chat, Mailbox, Calendar, etc.
│   ├── components/             # Lazy — UI component showcase
│   ├── datatables/             # Lazy — data tables
│   ├── elements/               # Lazy — element showcase
│   ├── forms/                  # Lazy — form examples
│   ├── pages/                  # Lazy — error pages, contact, coming-soon
│   └── users/                  # Lazy — user management
│
└── shared.module.ts            # ← Backward-compat shim → app/shared/shared.module.ts
```

---

## Module Boundaries

| Module | Imports | Provided By | Loaded |
|--------|---------|-------------|--------|
| `CoreModule` | `HttpClientModule` | `AppModule` (once) | Eager |
| `SharedModule` | All 3rd-party UI libs | Feature modules | Lazy per feature |
| `LayoutsModule` | `SharedModule`, `RouterModule` | `AppModule` | Eager |
| `DashboardModule` | `SharedModule` | Router (lazy) | Lazy |
| `AuthModule` | `SharedModule` | Router (lazy) | Lazy |

---

## Environment Configuration

All environment-specific values are read from `src/environments/environment.ts`:

```typescript
export const environment = {
    production: false,
    appName: 'S-Implify',
    appVersion: '2.0.0',
    apiUrl: 'http://localhost:8080/api',
    authApiUrl: 'http://localhost:8080/api/auth',
    defaultLanguage: 'en',
    tokenKey: 'simplify_access_token',
    refreshTokenKey: 'simplify_refresh_token',
};
```

**Rule: Never hardcode API URLs, token names, or versions in component/service code.**

---

## TypeScript Path Aliases (`tsconfig.json`)

```typescript
import { AuthService }   from '@core/services/auth.service';
import { SharedModule }  from '@shared/shared.module';
import { themeReducer }  from '@store/theme/theme.reducer';
import { DashboardModule } from '@features/dashboard/dashboard.module';
import { AppLayout }     from '@layouts/app-layout/app-layout.component';
import { environment }   from '@env/environment';
```

---

## Authentication Flow

```
User visits protected route
    → AuthGuard.canActivate()
        → AuthService.isLoggedIn()         (checks localStorage token)
            ✓ Token exists  → Allow route
            ✗ No token      → Redirect to /auth/cover-login

User logs in
    → AuthService.login(payload)
        → POST /api/auth/login
        → Stores accessToken + refreshToken in localStorage
        → Router navigates to /

User visits auth page while logged in
    → GuestGuard.canActivate()
        → AuthService.isLoggedIn() = true
        → Redirects to /
```

---

## HTTP Interceptor Chain

Every outgoing HTTP request passes through:

1. **AuthInterceptor** — Attaches `Authorization: Bearer <token>` header
2. **ErrorInterceptor** — Catches `401 → logout + redirect`, `403 → error page`, `500 → logs`

---

## NgRx Store

### Current State (Legacy compatibility)

The app currently dispatches string-type actions (e.g., `{ type: 'toggleTheme', payload: 'dark' }`)
via the `indexReducer` in `store/index.reducer.ts`. This is preserved for backward compatibility.

### Typed Actions (New pattern — use for new features)

```typescript
import { toggleTheme, toggleSidebar } from '@store/theme/theme.actions';
import { selectIsDarkMode } from '@store/theme/theme.selectors';

// Dispatch
this.store.dispatch(toggleTheme({ payload: 'dark' }));

// Select
this.isDark$ = this.store.select(selectIsDarkMode);
```

---

## Adding a New Feature Module

1. Create `src/app/features/<feature-name>/<feature-name>.module.ts`
2. Declare all components in the module
3. Import `SharedModule.forRoot()` for UI utilities
4. Add lazy route to `app.route.ts`:
   ```typescript
   {
     path: 'feature-path',
     loadChildren: () => import('./features/<name>/<name>.module').then(m => m.<Name>Module)
   }
   ```
5. Use `AuthGuard` on protected routes, `GuestGuard` on public-only routes
