import type { Campus, StudentGrowthRecordResponse } from '../../../core/models/simplify-api.model';
import type { StudentRow } from '../models/student-table.model';
import { quarterDiffValuesFromRecord } from './student-quarter-progression.util';

function numOrZero(value: number | null | undefined): number {
    return value != null && Number.isFinite(value) ? value : 0;
}

function campusLabel(code: string | undefined, campuses: Campus[]): string {
    const trimmed = code?.trim();
    if (!trimmed) {
        return '';
    }
    const campus = campuses.find((c) => c.campusCode === trimmed);
    return campus?.campusName?.trim() || trimmed;
}

export function mapStudentGrowthRecordToRow(
    record: StudentGrowthRecordResponse,
    campuses: Campus[] = [],
    quarterSequence?: string[] | null,
): StudentRow {
    const grade = Number(record.gradeCode);
    const row: StudentRow = {
        studentName: (record.studentName ?? '').trim(),
        campus: campusLabel(record.campusCode, campuses),
        grade: Number.isFinite(grade) ? grade : 0,
        subject: (record.subjectCode ?? '').trim(),
        instructorName: (record.teacherName ?? '').trim(),
        staarScore: numOrZero(record.staar),
        staarPerLevel: numOrZero(record.staarPerLevel),
        quarterScore: numOrZero(record.quarterScore),
        quarterPerLevel: numOrZero(record.quarterPerLevel),
        delta: numOrZero(record.delta),
        app: numOrZero(record.app),
        meet: numOrZero(record.meets),
        master: numOrZero(record.masters),
        componentScore:
            record.cs != null && Number.isFinite(record.cs) ? Number(record.cs) : null,
        growth: numOrZero(record.growth),
        ...quarterDiffValuesFromRecord(record, quarterSequence),
    };

    return row;
}
