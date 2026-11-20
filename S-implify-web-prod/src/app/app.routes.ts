import { Routes } from '@angular/router';

import { environment } from '../environments/environment';
import { AppLayout } from './layouts/app-layout/app-layout.component';
import { AuthLayout } from './layouts/auth-layout/auth-layout.component';
import { AuthGuard } from './core/guards/auth.guard';
import { RoleSelectionGuard } from './core/guards/role-selection.guard';

const devSandboxChildRoutes: Routes = environment.enableDevSandbox
    ? [
          { path: '', loadChildren: () => import('./apps/apps.module').then((m) => m.AppsModule) },
          {
              path: '',
              loadChildren: () =>
                  import('./components/components.module').then((m) => m.ComponentsModule),
          },
          {
              path: '',
              loadChildren: () => import('./elements/elements.module').then((m) => m.ElementsModule),
          },
          { path: '', loadChildren: () => import('./forms/form.module').then((m) => m.FormModule) },
          {
              path: '',
              loadChildren: () =>
                  import('./datatables/datatables.module').then((m) => m.DatatablesModule),
          },
      ]
    : [];

const templatePageRoutes: Routes = environment.enableDevSandbox
    ? [
          {
              path: 'pages',
              component: AuthLayout,
              children: [
                  {
                      path: '',
                      loadChildren: () => import('./pages/pages.module').then((m) => m.PagesModule),
                  },
              ],
          },
      ]
    : [];

export const routes: Routes = [
    {
        path: 'auth/select-role',
        canActivate: [RoleSelectionGuard],
        loadComponent: () =>
            import('./features/auth/pages/select-role/select-role-page.component').then(
                (m) => m.SelectRolePageComponent,
            ),
        data: { title: 'Select Role' },
    },

    {
        path: 'auth',
        component: AuthLayout,
        children: [
            {
                path: '',
                loadChildren: () =>
                    import('./features/auth/auth.routes').then((m) => m.AUTH_ROUTES),
            },
        ],
    },

    {
        path: '',
        component: AppLayout,
        canActivate: [AuthGuard],
        children: [
            {
                path: '',
                loadChildren: () =>
                    import('./features/dashboard/dashboard.routes').then((m) => m.DASHBOARD_ROUTES),
            },
            {
                path: 't-tess',
                loadChildren: () =>
                    import('./features/teachers/teachers.routes').then((m) => m.TEACHERS_ROUTES),
            },
            {
                path: 'attendance',
                loadChildren: () =>
                    import('./features/attendance/attendance.routes').then((m) => m.ATTENDANCE_ROUTES),
            },
            { path: 'individual-attendance', redirectTo: 'attendance/individual', pathMatch: 'full' },
            {
                path: 'academies',
                loadChildren: () =>
                    import('./features/academies/academies.routes').then((m) => m.ACADEMIES_ROUTES),
            },
            {
                path: 'students',
                loadChildren: () =>
                    import('./features/students/students.routes').then((m) => m.STUDENTS_ROUTES),
            },
            {
                path: '',
                loadChildren: () => import('./features/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
            },
            {
                path: '',
                loadChildren: () => import('./users/user.module').then((m) => m.UsersModule),
            },
            ...devSandboxChildRoutes,
        ],
    },

    ...templatePageRoutes,

    { path: '**', redirectTo: 'dashboard' },
];
