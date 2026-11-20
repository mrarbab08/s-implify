/** Row for the standards-by-student grid (mock / API). */
export interface StandardsMatrixRowVm {
    studentName: string;
    percentScore: number;
    /** Percent scores 0–100 per standard column (same order as `standardCodes`). */
    standardPercents: number[];
}

export interface StudentCohortRowVm {
    studentName: string;
    campus: string;
    grade: string;
    course: string;
    instructor: string;
    staarScore: number;
}

