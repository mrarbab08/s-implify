import { Routes } from '@angular/router';

export const ATTENDANCE_ROUTES: Routes = [
    {
        path: '',
        loadComponent: () =>
            import('./pages/attendance-summary/attendance-summary-page.component').then(
                (m) => m.AttendanceSummaryPageComponent,
            ),
        data: { title: 'Campus Attendance' },
    },
    {
        path: 'individual',
        loadComponent: () =>
            import('./pages/individual-attendance/individual-attendance-page.component').then(
                (m) => m.IndividualAttendancePageComponent,
            ),
        data: { title: 'Individual Attendance' },
    },
];
