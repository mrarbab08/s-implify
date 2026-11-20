import { Routes } from '@angular/router';

import { TtessAccessGuard } from '../../core/guards/ttess-access.guard';

export const TEACHERS_ROUTES: Routes = [
    {
        path: '',
        canActivate: [TtessAccessGuard],
        loadComponent: () =>
            import('./pages/t-tess/t-tess-page.component').then((m) => m.TtessPageComponent),
        data: { title: 'T-TESS' },
    },
];
