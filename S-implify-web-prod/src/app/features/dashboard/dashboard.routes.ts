import { Routes } from '@angular/router';

export const DASHBOARD_ROUTES: Routes = [
    { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
    {
        path: 'dashboard',
        loadComponent: () =>
            import('./pages/growth-overview/growth-overview-page.component').then(
                (m) => m.GrowthOverviewPageComponent,
            ),
        data: { title: 'District Overview' },
    },
    {
        path: 'dashboard/campus-category/:categoryId',
        loadComponent: () =>
            import('./pages/growth-overview/growth-overview-page.component').then(
                (m) => m.GrowthOverviewPageComponent,
            ),
        data: { title: 'Campus category' },
    },
    {
        path: 'dashboard/campus/:id/teacher/:teacherId',
        loadComponent: () =>
            import('./pages/growth-overview/growth-overview-page.component').then(
                (m) => m.GrowthOverviewPageComponent,
            ),
        data: { title: 'Classroom Students' },
    },
    {
        path: 'dashboard/campus/:id',
        loadComponent: () =>
            import('./pages/growth-overview/growth-overview-page.component').then(
                (m) => m.GrowthOverviewPageComponent,
            ),
        data: { title: 'Campus Dashboard' },
    },
    {
        path: 'dashboard/district/:districtId',
        loadComponent: () =>
            import('./pages/growth-overview/growth-overview-page.component').then(
                (m) => m.GrowthOverviewPageComponent,
            ),
        data: { title: 'District Dashboard' },
    },
    {
        path: 'campus-category/:categoryId',
        redirectTo: 'dashboard/campus-category/:categoryId',
    },
    { path: 'campus/:id', redirectTo: 'dashboard/campus/:id' },
];
