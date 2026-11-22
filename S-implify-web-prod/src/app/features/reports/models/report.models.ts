/** Identifiers for the ten printable reports. */
export type ReportId =
    | 'school'
    | 'classroom'
    | 'grade'
    | 'students-consolidated'
    | 'district-school'
    | 'district-grade'
    | 'students-assessment'
    | 'students-report-card'
    | 'students'
    | 'employee-assessment';

export interface ReportLink {
    id: ReportId;
    label: string;
}

export interface ReportLinkGroup {
    /** Optional heading such as SCHOOL or DISTRICT. */
    label?: string;
    items: ReportLink[];
}

export interface ReportMenuSection {
    label: string;
    groups: ReportLinkGroup[];
}

export interface ReportColumn {
    field: string;
    title: string;
}

export type ReportRow = Record<string, string | number | null | undefined>;

export interface ReportSection {
    /** Optional caption shown above the table (on screen and in print). */
    title?: string;
    columns: ReportColumn[];
    rows: ReportRow[];
}

/** One student in the current selection, used by the Report Card picker. */
export interface ReportStudentOption {
    key: string;
    label: string;
}

export interface ReportData {
    title: string;
    sections: ReportSection[];
    /** Shown instead of rows when the current selection has no data. */
    emptyMessage?: string;
    /** Populated for the Report Card picker only. */
    studentOptions?: ReportStudentOption[];
}
