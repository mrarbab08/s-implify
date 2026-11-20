import { Routes } from '@angular/router';
import { GuestGuard } from '../../core/guards/guest.guard';

export const AUTH_ROUTES: Routes = [
    {
        path: 'login',
        canActivate: [GuestGuard],
        loadComponent: () => import('./pages/boxed-signin').then((m) => m.BoxedSigninComponent),
        data: { title: 'Login' },
    },
    {
        path: 'register',
        canActivate: [GuestGuard],
        loadComponent: () => import('./pages/boxed-signup').then((m) => m.BoxedSignupComponent),
        data: { title: 'Register' },
    },
    {
        path: 'boxed-lockscreen',
        canActivate: [GuestGuard],
        loadComponent: () => import('./pages/boxed-lockscreen').then((m) => m.BoxedLockscreenComponent),
        data: { title: 'Boxed Lockscreen' },
    },
    {
        path: 'password-reset',
        canActivate: [GuestGuard],
        loadComponent: () =>
            import('./pages/boxed-password-reset').then((m) => m.BoxedPasswordResetComponent),
        data: { title: 'Password Reset' },
    },
    {
        path: 'change-password',
        canActivate: [GuestGuard],
        loadComponent: () =>
            import('./pages/change-password').then((m) => m.ChangePasswordComponent),
        data: { title: 'Change Password' },
    },
    { path: 'boxed-password-reset', redirectTo: 'password-reset', pathMatch: 'full' },
    { path: 'reset-password', redirectTo: 'change-password', pathMatch: 'full' },
    { path: 'boxed-signin', redirectTo: 'login', pathMatch: 'full' },
    { path: 'boxed-signup', redirectTo: 'register', pathMatch: 'full' },
    {
        path: 'cover-lockscreen',
        canActivate: [GuestGuard],
        loadComponent: () => import('./pages/cover-lockscreen').then((m) => m.CoverLockscreenComponent),
        data: { title: 'Cover Lockscreen' },
    },
    { path: 'cover-login', redirectTo: 'login', pathMatch: 'full' },
    {
        path: 'cover-password-reset',
        canActivate: [GuestGuard],
        loadComponent: () =>
            import('./pages/cover-password-reset').then((m) => m.CoverPasswordResetComponent),
        data: { title: 'Cover Password Reset' },
    },
    { path: 'cover-register', redirectTo: 'register', pathMatch: 'full' },
];
