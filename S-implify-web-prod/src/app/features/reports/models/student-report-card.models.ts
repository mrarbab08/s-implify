/** Data displayed by the printable Student Report Card page. All values are live. */
export interface ReportCardDetail {
    label: string;
    value: string;
}

export interface ReportCardScore {
    subject: string;
    score: number | null;
    band: string | null;
}

export interface ReportCardSubjectRow {
    subject: string;
    staar: number | null;
    current: number | null;
    level: string | null;
}

export interface ReportCardTrendPoint {
    period: string;
    score: number;
}

export interface ReportCardStandard {
    code: string;
    pct: number;
    band: 'Mastered' | 'Developing' | 'Re-teach';
}

export interface ReportCardAttendance {
    pct: number | null;
    daysPresent: number | null;
    daysTotal: number | null;
    tardies: number | null;
    status: string | null;
}

export interface StudentReportCardData {
    studentKey: string;
    studentId: string;
    studentName: string;
    initials: string;
    grade: string;
    campus: string;
    homeroom: string;
    titleLine: string;
    details: ReportCardDetail[];
    lastStaar: ReportCardScore | null;
    benchmark: ReportCardScore | null;
    change: string;
    growthStatus: string;
    subjectRows: ReportCardSubjectRow[];
    trend: ReportCardTrendPoint[];
    trendSubject: string;
    standards: ReportCardStandard[];
    standardsSubject: string;
    attendance: ReportCardAttendance | null;
    comment: string | null;
}
