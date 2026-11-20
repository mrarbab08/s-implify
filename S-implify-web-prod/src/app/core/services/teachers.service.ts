import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { MOCK_TEACHER_GROWTH, MOCK_TOP_TEACHERS } from '../mocks/simplify-mock-data';
import type {
    ApiResponse,
    TeacherSummaryDto,
    TeachersByScopeRequest,
    TopTeacherItemDto,
    TopTeachersRequest,
} from '../models/simplify-api.model';

@Injectable({ providedIn: 'root' })
export class TeachersService {
    private readonly base = `${environment.apiUrl}/teachers`;

    constructor(private http: HttpClient) {}

    /** GET /api/teachers/by-campus — distinct teachers for a campus (growth records). */
    listTeachersByCampus(districtId: number, campusCode: string): Observable<TeacherSummaryDto[]> {
        if (environment.mockBusinessApis) {
            return of(
                MOCK_TEACHER_GROWTH.map((t) => ({
                    teacherId: t.teacherId,
                    teacherName: `${t.lastName}, ${t.firstName}`,
                })),
            );
        }
        const params = new HttpParams()
            .set('districtId', String(districtId))
            .set('campusCode', campusCode);
        return this.http
            .get<ApiResponse<TeacherSummaryDto[]>>(`${this.base}/by-campus`, { params })
            .pipe(map((r) => this.normalizeTeacherSummaryList(r.data)));
    }

    /** POST /api/teachers/by-scope — teachers for campus/grade/subject scope. */
    listTeachersByScope(body: TeachersByScopeRequest): Observable<TeacherSummaryDto[]> {
        if (environment.mockBusinessApis) {
            return of(
                MOCK_TEACHER_GROWTH.map((t) => ({
                    teacherId: t.teacherId,
                    teacherName: `${t.lastName}, ${t.firstName}`,
                })),
            );
        }
        const payload: TeachersByScopeRequest = {
            districtId: body.districtId,
            academicYearId: body.academicYearId,
            campusCode: body.campusCode.trim(),
        };
        const quarterCode = body.quarterCode?.trim();
        const gradeCode = body.gradeCode?.trim();
        const subjectCode = body.subjectCode?.trim();
        if (quarterCode) {
            payload.quarterCode = quarterCode;
        }
        if (gradeCode) {
            payload.gradeCode = gradeCode;
        }
        if (subjectCode) {
            payload.subjectCode = subjectCode;
        }
        return this.http
            .post<ApiResponse<unknown>>(`${this.base}/by-scope`, payload)
            .pipe(map((r) => this.normalizeTeacherSummaryList(r.data)));
    }

    private normalizeTeacherSummaryList(raw: unknown): TeacherSummaryDto[] {
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw.map((row) => this.normalizeTeacherSummary(row));
    }

    private normalizeTeacherSummary(raw: unknown): TeacherSummaryDto {
        const r = (raw ?? {}) as Record<string, unknown>;
        const pickStr = (...keys: string[]): string => {
            for (const key of keys) {
                const value = r[key];
                if (value == null || value === '') {
                    continue;
                }
                const trimmed = String(value).trim();
                if (trimmed) {
                    return trimmed;
                }
            }
            return '';
        };

        const teacherIdExternal =
            pickStr(
                'teacherIdExternal',
                'TeacherIdExternal',
                'teacher_id_external',
                'externalTeacherId',
                'ExternalTeacherId',
            ) || undefined;
        const teacherIdRaw = r['teacherId'] ?? r['TeacherId'] ?? r['teacher_id'] ?? null;
        const teacherId =
            teacherIdRaw == null || teacherIdRaw === '' ? null : (teacherIdRaw as number | string);

        let teacherName = pickStr(
            'teacherName',
            'TeacherName',
            'name',
            'Name',
            'displayName',
            'DisplayName',
        );
        const firstName = pickStr('firstName', 'FirstName', 'first_name');
        const lastName = pickStr('lastName', 'LastName', 'last_name');
        if (!teacherName) {
            if (lastName && firstName) {
                teacherName = `${lastName}, ${firstName}`;
            } else {
                teacherName = [firstName, lastName].filter(Boolean).join(' ').trim();
            }
        }

        return {
            teacherId,
            teacherIdExternal,
            firstName: firstName || null,
            lastName: lastName || null,
            teacherName: teacherName || null,
            grade: pickStr('grade', 'Grade', 'gradeName', 'GradeName') || null,
            subject: pickStr('subject', 'Subject', 'subjectName', 'SubjectName') || null,
        };
    }

    getTopTeachers(body: TopTeachersRequest): Observable<TopTeacherItemDto[]> {
        if (environment.mockBusinessApis) {
            let rows = [...MOCK_TOP_TEACHERS];
            if (body.campusCategoryCode) {
                rows = rows.filter(
                    (r) =>
                        !r.campusCategoryCode ||
                        r.campusCategoryCode.toUpperCase() === body.campusCategoryCode!.toUpperCase(),
                );
            }
            const top = body.top ?? 5;
            return of(rows.slice(0, top));
        }
        return this.http
            .post<ApiResponse<TopTeacherItemDto[]>>(`${this.base}/top`, body)
            .pipe(map((r) => this.normalizeTopTeacherList(r.data)));
    }

    private normalizeTopTeacherList(raw: unknown): TopTeacherItemDto[] {
        if (!Array.isArray(raw)) {
            return [];
        }
        return raw.map((row) => this.normalizeTopTeacher(row));
    }

    private normalizeTopTeacher(raw: unknown): TopTeacherItemDto {
        const r = (raw ?? {}) as Record<string, unknown>;
        const pickStr = (...keys: string[]): string => {
            for (const key of keys) {
                const value = r[key];
                if (value == null || value === '') {
                    continue;
                }
                const trimmed = String(value).trim();
                if (trimmed) {
                    return trimmed;
                }
            }
            return '';
        };
        const num = (v: unknown): number | null => {
            if (v == null) {
                return null;
            }
            const n = typeof v === 'number' ? v : Number(String(v).trim());
            return Number.isFinite(n) ? n : null;
        };

        const firstName = pickStr('firstName', 'FirstName', 'first_name') || undefined;
        const lastName = pickStr('lastName', 'LastName', 'last_name') || undefined;
        const teacherName =
            pickStr('teacherName', 'TeacherName', 'name', 'Name') ||
            [firstName, lastName].filter(Boolean).join(' ').trim() ||
            undefined;
        const subject =
            pickStr('subject', 'Subject', 'subjectName', 'SubjectName', 'subjectCode', 'SubjectCode') ||
            null;

        return {
            rank: num(r['rank'] ?? r['Rank']) ?? undefined,
            teacherId: num(r['teacherId'] ?? r['TeacherId'] ?? r['teacher_id']) ?? undefined,
            teacherIdExternal:
                pickStr(
                    'teacherIdExternal',
                    'TeacherIdExternal',
                    'teacher_id_external',
                ) || undefined,
            firstName,
            lastName,
            teacherName,
            subject,
            summativeScore: num(r['summativeScore'] ?? r['SummativeScore'] ?? r['summative_score']),
        };
    }
}
