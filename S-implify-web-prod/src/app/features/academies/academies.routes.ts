import { Routes } from '@angular/router';

export const ACADEMIES_ROUTES: Routes = [
    {
        path: 'ccmr',
        loadComponent: () =>
            import('./pages/ccmr/ccmr-page.component').then((m) => m.CcmrPageComponent),
        data: { title: 'CCMR' },
    },
    {
        path: 'standards-matrix',
        loadComponent: () =>
            import('./pages/standards-matrix/standards-matrix-page.component').then(
                (m) => m.StandardsMatrixPageComponent,
            ),
        data: { title: 'Standards Matrix' },
    },
];
