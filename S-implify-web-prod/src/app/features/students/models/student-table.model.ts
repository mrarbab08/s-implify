/** Column definition for the students performance datatable (@bhplugin/ng-datatable). */
export interface StudentColumnDef {
    field: string;
    title: string;
    filter: boolean;
    /** When true (default for this table), global search includes this column. */
    search?: boolean;
    hide?: boolean;
}

/** One row of student growth data, including dynamic quarter delta fields. */
export interface StudentRow {
    studentName: string;
    campus: string;
    grade: number;
    subject: string;
    instructorName: string;
    staarScore: number;
    staarPerLevel: number;
    quarterScore: number;
    quarterPerLevel: number;
    delta: number;
    app: number;
    meet: number;
    master: number;
    componentScore: number | null;
    growth: number;
    /** Dynamic quarter deltas, e.g. diff_EOY_MOY. */
    [dynamicField: string]: string | number | null | undefined;
}
