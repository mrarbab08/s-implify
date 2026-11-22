import { Routes } from '@angular/router';

export const REPORTS_ROUTES: Routes = [
    {
        path: '',
        loadComponent: () =>
            import('./pages/reports-page/reports-page.component').then(
                (m) => m.ReportsPageComponent,
            ),
        data: { title: 'Reports' },
    },
    {
        path: 'student-report-card',
        loadComponent: () =>
            import('./pages/student-report-card-page/student-report-card-page.component').then(
                (m) => m.StudentReportCardPageComponent,
            ),
        data: { title: 'Student Report Card' },
    },
];
