import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import type {
    ApiResponse,
    Grade,
    StudentStandardsAverageItemDto,
    StudentStandardsAverageRequest,
    StudentStandardsStudentScoreDto,
    StudentStandardsStudentScoresRequest,
    Subject,
} from '../models/simplify-api.model';

const MOCK_STANDARD_AVERAGES: StudentStandardsAverageItemDto[] = [
    { standardCode: '4.2.A', average: 56 },
    { standardCode: '4.2.B', average: 45 },
    { standardCode: '4.2.C', average: 78 },
    { standardCode: '4.2.D', average: 62 },
    { standardCode: '4.4.A', average: 71 },
    { standardCode: '4.4.B', average: 55 },
    { standardCode: '4.4.C', average: 49 },
    { standardCode: '4.4.D', average: 64 },
    { standardCode: '4.4.G', average: 58 },
    { standardCode: '4.5.A', average: 52 },
];

const MOCK_STUDENT_SCORES: StudentStandardsStudentScoreDto[] = [
    {
        studentName: 'Almodovar Ocasio, Alexander',
        score: 41,
        '4.2.A': '0%',
        '4.2.B': '33%',
        '4.2.C': '25%',
        '4.2.D': '40%',
        '4.4.A': '55%',
        '4.4.B': '20%',
        '4.4.C': '48%',
        '4.4.D': '35%',
        '4.4.G': '42%',
        '4.5.A': '38%',
    },
    {
        studentName: 'Banda, Maria',
        score: 88,
        '4.2.A': '95%',
        '4.2.B': '100%',
        '4.2.C': '92%',
        '4.2.D': '88%',
        '4.4.A': '90%',
        '4.4.B': '85%',
        '4.4.C': '93%',
        '4.4.D': '87%',
        '4.4.G': '91%',
        '4.5.A': '89%',
    },
    {
        studentName: 'Chen, David',
        score: 57,
        '4.2.A': '55%',
        '4.2.B': '60%',
        '4.2.C': '50%',
        '4.2.D': '58%',
        '4.4.A': '62%',
        '4.4.B': '48%',
        '4.4.C': '59%',
        '4.4.D': '54%',
        '4.4.G': '61%',
        '4.5.A': '56%',
    },
];

@Injectable({ providedIn: 'root' })
export class StudentStandardsService {
    private readonly base = `${environment.apiUrl}/student-standards`;

    constructor(private http: HttpClient) {}

    getStandardAverages(
        body: StudentStandardsAverageRequest,
    ): Observable<StudentStandardsAverageItemDto[]> {
        if (environment.mockBusinessApis) {
            return of([...MOCK_STANDARD_AVERAGES]);
        }
        return this.http
            .post<ApiResponse<StudentStandardsAverageItemDto[]>>(
                `${this.base}/standard-averages`,
                body,
            )
            .pipe(map((r) => this.normalizeAverages((r as ApiResponse<unknown>)?.data)));
    }

    getStudentScores(
        body: StudentStandardsStudentScoresRequest,
    ): Observable<StudentStandardsStudentScoreDto[]> {
        if (environment.mockBusinessApis) {
            return of([...MOCK_STUDENT_SCORES]);
        }
        return this.http
            .post<ApiResponse<StudentStandardsStudentScoreDto[]>>(
                `${this.base}/student-scores`,
                body,
            )
            .pipe(map((r) => this.normalizeStudentScores((r as ApiResponse<unknown>)?.data)));
    }

    private normalizeAverages(raw: unknown): StudentStandardsAverageItemDto[] {
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw.map((row: Record<string, unknown>) => ({
            standardCode: String(row['standardCode'] ?? row['StandardCode'] ?? ''),
            average: this.toNumber(row['average'] ?? row['Average']),
        }));
    }

    private normalizeStudentScores(raw: unknown): StudentStandardsStudentScoreDto[] {
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw.map((row: Record<string, unknown>) => {
            const studentName = String(row['studentName'] ?? row['StudentName'] ?? '');
            const score = this.toNumber(row['score'] ?? row['Score']);
            const nested = row['standardProperties'] ?? row['StandardProperties'];
            const out: StudentStandardsStudentScoreDto = {
                studentName,
                score,
            };
            if (nested && typeof nested === 'object') {
                out.standardProperties = Object.fromEntries(
                    Object.entries(nested as Record<string, unknown>).map(([k, v]) => [
                        k,
                        String(v ?? ''),
                    ]),
                );
            }
            for (const [key, value] of Object.entries(row)) {
                if (
                    key === 'studentName' ||
                    key === 'StudentName' ||
                    key === 'score' ||
                    key === 'Score' ||
                    key === 'standardProperties' ||
                    key === 'StandardProperties'
                ) {
                    continue;
                }
                if (typeof value === 'string' || typeof value === 'number') {
                    out[key] = value;
                }
            }
            return out;
        });
    }

    private toNumber(value: unknown): number {
        if (value == null) {
            return 0;
        }
        const n = typeof value === 'number' ? value : Number(String(value).replace(/%/g, '').trim());
        return Number.isFinite(n) ? n : 0;
    }
}

/** Match grade filter to dbo.Grades code (e.g. "5" → "05"). */
export function resolveGradeCode(input: string, grades: Grade[]): string {
    const trimmed = input.trim();
    if (!trimmed) {
        return trimmed;
    }
    const direct = grades.find((g) => g.gradeCode === trimmed);
    if (direct) {
        return direct.gradeCode;
    }
    const normalized = trimmed.replace(/^0+/, '') || '0';
    const match = grades.find((g) => (g.gradeCode.replace(/^0+/, '') || '0') === normalized);
    return match?.gradeCode ?? trimmed;
}

/** Match subject filter to dbo.Subjects code (case-insensitive). */
export function resolveSubjectCode(input: string, subjects: Subject[]): string {
    const trimmed = input.trim();
    if (!trimmed) {
        return trimmed;
    }
    const upper = trimmed.toUpperCase();
    const match = subjects.find((s) => s.subjectCode.toUpperCase() === upper);
    return match?.subjectCode ?? upper;
}

export function normalizeStudentStandardsScope(
    body: StudentStandardsStudentScoresRequest,
    grades: Grade[] = [],
    subjects: Subject[] = [],
): StudentStandardsStudentScoresRequest {
    return {
        districtId: body.districtId,
        academicYearId: body.academicYearId,
        quarterCode: String(body.quarterCode).trim().toUpperCase(),
        campusCode: String(body.campusCode).trim().toUpperCase(),
        gradeCode: resolveGradeCode(body.gradeCode, grades),
        subjectCode: resolveSubjectCode(body.subjectCode, subjects),
    };
}

export function normalizeStandardAveragesRequest(
    body: StudentStandardsAverageRequest,
    grades: Grade[] = [],
    subjects: Subject[] = [],
): StudentStandardsAverageRequest {
    const base = normalizeStudentStandardsScope(body, grades, subjects);
    const out: StudentStandardsAverageRequest = { ...base };
    if (body.teacherId != null && body.teacherId > 0) {
        out.teacherId = body.teacherId;
    }
    return out;
}

/** Normalizes the student-scores scope and appends optional teacherId when a teacher is selected. */
export function normalizeStudentScoresRequest(
    body: StudentStandardsStudentScoresRequest,
    grades: Grade[] = [],
    subjects: Subject[] = [],
): StudentStandardsStudentScoresRequest {
    const out: StudentStandardsStudentScoresRequest = normalizeStudentStandardsScope(
        body,
        grades,
        subjects,
    );
    if (body.teacherId != null && body.teacherId > 0) {
        out.teacherId = body.teacherId;
    }
    return out;
}

/** Fallback when POST /standard-averages fails — derive column means from student rows. */
export function computeAveragesFromStudentScores(
    students: StudentStandardsStudentScoreDto[],
    standardCodes: string[],
): StudentStandardsAverageItemDto[] {
    if (!students.length || !standardCodes.length) {
        return [];
    }
    return standardCodes.map((standardCode) => {
        const values = students.map((student) => readStudentStandardValue(student, standardCode));
        const sum = values.reduce((acc, v) => acc + v, 0);
        return {
            standardCode,
            average: values.length ? sum / values.length : 0,
        };
    });
}

function readStudentStandardValue(
    student: StudentStandardsStudentScoreDto,
    code: string,
): number {
    const nested = student.standardProperties?.[code];
    if (nested != null) {
        return parseStandardPercent(nested);
    }
    const flat = student[code];
    if (typeof flat === 'string' || typeof flat === 'number') {
        return parseStandardPercent(flat);
    }
    return 0;
}

/** Parse a standard cell value (e.g. "50%", "50%%") into 0–100. */
export function parseStandardPercent(raw: string | number | null | undefined): number {
    if (raw == null) {
        return 0;
    }
    if (typeof raw === 'number') {
        return Number.isFinite(raw) ? raw : 0;
    }
    const n = Number(String(raw).replace(/%/g, '').trim());
    return Number.isFinite(n) ? n : 0;
}
