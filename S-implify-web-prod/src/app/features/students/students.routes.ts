import { Routes } from '@angular/router';

import { StudentsTableService } from './services/students-table.service';

export const STUDENTS_ROUTES: Routes = [
    {
        path: '',
        loadComponent: () =>
            import('./pages/students-page/students-page.component').then((m) => m.StudentsPageComponent),
        providers: [StudentsTableService],
        data: { title: 'Students' },
    },
];
