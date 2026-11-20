import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
    {
        path: 'super-admin-dashboard',
        loadComponent: () =>
            import('./pages/super-admin-dashboard/super-admin-dashboard.component').then(
                (m) => m.SuperAdminDashboardComponent
            ),
        data: { title: 'Super Admin Dashboard' },
    },
    {
        path: 'data-uploads',
        loadComponent: () =>
            import('./pages/data-uploads/data-uploads.component').then(
                (m) => m.DataUploadsComponent
            ),
        data: { title: 'Data uploads' },
    },
    {
        path: 'user-setups',
        loadComponent: () =>
            import('./pages/user-setups/user-setups.component').then(
                (m) => m.UserSetupsComponent
            ),
        data: { title: 'Setups' },
    },
    {
        path: 'district-profile/:districtId',
        loadComponent: () =>
            import('./pages/district-profile/district-profile.component').then(
                (m) => m.DistrictProfileComponent
            ),
        data: { title: 'District profile' },
    },
];
