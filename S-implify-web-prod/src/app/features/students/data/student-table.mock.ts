import type { StudentColumnDef } from '../models/student-table.model';

/** Fixed columns always shown before dynamic quarter-delta columns. */
export const STUDENT_BASE_COLUMNS: StudentColumnDef[] = [
    { field: 'studentName', title: 'Student Name', filter: true, search: true },
    { field: 'campus', title: 'Campus', filter: true, search: true },
    { field: 'grade', title: 'Grade', filter: true, search: true },
    { field: 'subject', title: 'Subject', filter: true, search: true },
    { field: 'instructorName', title: 'Instructor Name', filter: true, search: true },
    { field: 'staarScore', title: 'STAAR Score', filter: true, search: true },
    { field: 'staarPerLevel', title: 'STAAR Per-lvl', filter: true, search: true },
    { field: 'quarterScore', title: 'Quarter Score', filter: true, search: true },
    { field: 'quarterPerLevel', title: 'Quarter Per-lvl', filter: true, search: true },
    { field: 'delta', title: 'Delta', filter: true, search: true },
    { field: 'app', title: 'App', filter: true, search: true },
    { field: 'meet', title: 'Meet', filter: true, search: true },
    { field: 'master', title: 'Master', filter: true, search: true },
    { field: 'componentScore', title: 'STAAR Component Score', filter: true, search: true },
    { field: 'growth', title: 'Growth', filter: true, search: true },
];
