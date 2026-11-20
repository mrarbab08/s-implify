import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
    MOCK_CAMPUS_CATEGORY_GROWTH,
    MOCK_CAMPUS_GROWTH_ROWS,
    MOCK_CAMPUS_IDS_BY_CATEGORY,
    MOCK_GROWTH_OVERALL,
    MOCK_TEACHER_GROWTH,
    MOCK_TEACHER_STUDENT_METRICS,
    MOCK_TOP_CLASSROOMS,
    MOCK_TOP_STUDENTS,
} from '../mocks/simplify-mock-data';
import type {
    ApiResponse,
    CampusCategoryGrowthMetricsResponse,
    CampusGrowthMetricsRequest,
    CampusGrowthMetricsResponse,
    CampusTeacherGrowthMetricsRequest,
    CampusTeacherStudentGrowthMetricsRequest,
    GrowthOverallMetricsRequest,
    GrowthOverallMetricsResponse,
    TeacherGrowthMetricsResponse,
    TeacherStudentGrowthMetricsResponse,
    TopClassroomsRequest,
    TopStudentItemDto,
    TopStudentsRequest,
} from '../models/simplify-api.model';

@Injectable({ providedIn: 'root' })
export class GrowthAnalyticsService {
    private readonly base = `${environment.apiUrl}/growth`;

    constructor(private http: HttpClient) {}

    private normalizeOverall(raw: any): GrowthOverallMetricsResponse {
        const num = (v: any): number => {
            if (v == null) return NaN;
            const n = typeof v === 'number' ? v : Number(String(v).trim());
            return Number.isFinite(n) ? n : NaN;
        };
        const grade = (v: any): string | null => {
            if (v == null) return null;
            const s = String(v).trim();
            return s ? s : null;
        };
        const app = num(raw?.app ?? raw?.APP);
        const meet = num(raw?.meet ?? raw?.MEET);
        const master = num(raw?.master ?? raw?.MASTER);
        const cs = num(
            raw?.cs ??
                raw?.componentScore ??
                raw?.component_score ??
                raw?.component ??
                raw?.component_score_pct,
        );
        const growth = num(raw?.growth ?? raw?.Growth ?? raw?.growthPct ?? raw?.growth_pct);
        const gradesRaw = raw?.gradesByCategory ?? raw?.grades_by_category;
        const gradesByCategory = Array.isArray(gradesRaw)
            ? gradesRaw.map((row: any) => ({
                  campusCategoryId: Number(
                      row?.campusCategoryId ?? row?.campus_category_id ?? 0,
                  ),
                  categoryCode: String(row?.categoryCode ?? row?.category_code ?? ''),
                  categoryName: String(row?.categoryName ?? row?.category_name ?? ''),
                  cs: num(row?.cs ?? row?.componentScore),
                  csGrade: grade(row?.csGrade ?? row?.cs_grade),
                  growth: num(row?.growth),
                  growthGrade: grade(row?.growthGrade ?? row?.growth_grade),
              }))
            : [];

        return {
            app: Number.isFinite(app) ? app : NaN,
            meet: Number.isFinite(meet) ? meet : NaN,
            master: Number.isFinite(master) ? master : NaN,
            cs: Number.isFinite(cs) ? cs : NaN,
            growth: Number.isFinite(growth) ? growth : NaN,
            csGrade: grade(raw?.csGrade ?? raw?.cs_grade),
            growthGrade: grade(raw?.growthGrade ?? raw?.growth_grade),
            gradesByCategory,
        };
    }

    private normalizeCampusRows(raw: any): CampusGrowthMetricsResponse[] {
        if (!Array.isArray(raw)) return [];
        const num = (v: any): number | null => {
            if (v == null) return null;
            const n = typeof v === 'number' ? v : Number(String(v).trim());
            return Number.isFinite(n) ? n : null;
        };
        return raw.map((r) => ({
            campusId: Number(r?.campusId ?? r?.campusID ?? r?.CampusId ?? 0),
            campusCode: String(r?.campusCode ?? r?.campus_code ?? r?.CampusCode ?? ''),
            campusName: String(r?.campusName ?? r?.campus_name ?? r?.CampusName ?? ''),
            componentScore: num(r?.componentScore ?? r?.cs ?? r?.component_score ?? r?.component),
            growth: num(r?.growth ?? r?.growth_pct ?? r?.Growth),
        }));
    }

    getOverallGrowthMetrics(
        _body: GrowthOverallMetricsRequest,
    ): Observable<GrowthOverallMetricsResponse> {
        if (environment.mockBusinessApis) {
            if (_body.campusCategoryId != null) {
                const cat = MOCK_CAMPUS_CATEGORY_GROWTH.find(
                    (c) => c.campusCategoryId === _body.campusCategoryId,
                );
                const match = MOCK_GROWTH_OVERALL.gradesByCategory?.find(
                    (g) => g.campusCategoryId === _body.campusCategoryId,
                );
                if (cat) {
                    return of({
                        ...MOCK_GROWTH_OVERALL,
                        cs: cat.componentScore ?? MOCK_GROWTH_OVERALL.cs,
                        growth: cat.growth ?? MOCK_GROWTH_OVERALL.growth,
                        csGrade: match?.csGrade ?? 'C',
                        growthGrade: match?.growthGrade ?? 'C',
                        gradesByCategory: undefined,
                    });
                }
            }
            if (_body.campusCode || _body.teacherId != null) {
                return of({
                    ...MOCK_GROWTH_OVERALL,
                    csGrade: 'C',
                    growthGrade: 'C',
                    gradesByCategory: undefined,
                });
            }
            return of({ ...MOCK_GROWTH_OVERALL });
        }
        return this.http
            .post<ApiResponse<GrowthOverallMetricsResponse>>(`${this.base}/overall-metrics`, _body)
            .pipe(map((r) => this.normalizeOverall((r as any)?.data)));
    }

    getCampusGrowthMetrics(_body: CampusGrowthMetricsRequest): Observable<CampusGrowthMetricsResponse[]> {
        if (environment.mockBusinessApis) {
            let rows = [...MOCK_CAMPUS_GROWTH_ROWS];
            if (_body.campusCategoryId != null) {
                const ids = MOCK_CAMPUS_IDS_BY_CATEGORY[_body.campusCategoryId];
                if (ids?.length) {
                    rows = rows.filter((r) => ids.includes(r.campusId));
                }
            }
            if (_body.campusCode) {
                rows = rows.filter(
                    (r) => r.campusCode.toLowerCase() === _body.campusCode!.toLowerCase(),
                );
            }
            return of(rows);
        }
        return this.http
            .post<ApiResponse<CampusGrowthMetricsResponse[]>>(`${this.base}/campus-metrics`, _body)
            .pipe(map((r) => this.normalizeCampusRows((r as any)?.data)));
    }

    getCampusCategoryGrowthMetrics(
        _body: CampusGrowthMetricsRequest,
    ): Observable<CampusCategoryGrowthMetricsResponse[]> {
        if (environment.mockBusinessApis) {
            if (_body.campusCategoryId != null) {
                const row = MOCK_CAMPUS_CATEGORY_GROWTH.find(
                    (c) => c.campusCategoryId === _body.campusCategoryId,
                );
                return of(row ? [row] : []);
            }
            return of([...MOCK_CAMPUS_CATEGORY_GROWTH]);
        }
        return this.http
            .post<ApiResponse<CampusCategoryGrowthMetricsResponse[]>>(
                `${this.base}/campus-category-metrics`,
                _body,
            )
            .pipe(map((r) => this.normalizeCategoryRows((r as any)?.data)));
    }

    private normalizeCategoryRows(raw: unknown): CampusCategoryGrowthMetricsResponse[] {
        if (!Array.isArray(raw)) return [];
        const num = (v: unknown): number | null => {
            if (v == null) return null;
            const n = typeof v === 'number' ? v : Number(String(v).trim());
            return Number.isFinite(n) ? n : null;
        };
        return raw.map((r: any) => ({
            campusCategoryId: Number(r?.campusCategoryId ?? r?.campus_category_id ?? 0),
            campusCategoryName: String(r?.campusCategoryName ?? r?.campus_category_name ?? ''),
            componentScore: num(r?.componentScore ?? r?.cs ?? r?.component_score),
            growth: num(r?.growth ?? r?.growth_pct),
        }));
    }

    getCampusTeacherGrowthMetrics(
        _body: CampusTeacherGrowthMetricsRequest,
    ): Observable<TeacherGrowthMetricsResponse[]> {
        if (environment.mockBusinessApis) {
            const code = (_body.campusCode || '').toUpperCase();
            let h = 0;
            for (let i = 0; i < code.length; i++) {
                h += code.charCodeAt(i);
            }
            return of(
                MOCK_TEACHER_GROWTH.map((t, i) => ({
                    ...t,
                    componentScore: Math.min(
                        100,
                        Math.max(0, t.componentScore + (h % 11) - i * 2),
                    ),
                    growth: Math.min(100, t.growth + (h % 7) * 0.35 + i * 0.5),
                })),
            );
        }
        return this.http
            .post<ApiResponse<TeacherGrowthMetricsResponse[]>>(`${this.base}/campus-teacher-metrics`, _body)
            .pipe(map((r) => this.normalizeTeacherRows((r as any)?.data)));
    }

    private normalizeTeacherRows(raw: unknown): TeacherGrowthMetricsResponse[] {
        if (!Array.isArray(raw)) {
            return [];
        }
        const num = (v: unknown): number => {
            if (v == null) {
                return NaN;
            }
            const n = typeof v === 'number' ? v : Number(String(v).trim());
            return Number.isFinite(n) ? n : NaN;
        };
        return raw.map((r: any) => ({
            teacherId: Number(r?.teacherId ?? r?.TeacherId ?? r?.teacher_id ?? 0),
            teacherIdExternal: r?.teacherIdExternal ?? r?.teacher_id_external,
            firstName: r?.firstName ?? r?.FirstName ?? r?.first_name,
            lastName: r?.lastName ?? r?.LastName ?? r?.last_name,
            grade: (() => {
                const raw =
                    r?.grade ??
                    r?.Grade ??
                    r?.gradeName ??
                    r?.GradeName ??
                    r?.gradeCode ??
                    r?.GradeCode;
                if (raw == null) {
                    return null;
                }
                const text = String(raw).trim();
                return text || null;
            })(),
            componentScore: (() => {
                const x = num(r?.componentScore ?? r?.component_score ?? r?.cs);
                return Number.isFinite(x) ? x : 0;
            })(),
            growth: (() => {
                const x = num(r?.growth ?? r?.growth_pct ?? r?.Growth);
                return Number.isFinite(x) ? x : 0;
            })(),
        }));
    }

    getTopClassrooms(body: TopClassroomsRequest): Observable<TeacherGrowthMetricsResponse[]> {
        if (environment.mockBusinessApis) {
            let rows = [...MOCK_TOP_CLASSROOMS];
            if (body.campusCategoryCode) {
                rows = rows.filter(
                    (r) =>
                        !r.campusCategoryCode ||
                        r.campusCategoryCode.toUpperCase() === body.campusCategoryCode!.toUpperCase(),
                );
            }
            if (body.campusCode) {
                rows = rows.filter(
                    (r) =>
                        !r.campusCode ||
                        r.campusCode.toUpperCase() === body.campusCode!.toUpperCase(),
                );
            }
            const top = body.top ?? 5;
            return of(
                rows.slice(0, top).map(({ campusCategoryCode: _c, campusCode: _cc, ...row }) => row),
            );
        }
        return this.http
            .post<ApiResponse<TeacherGrowthMetricsResponse[]>>(`${this.base}/top-classrooms`, body)
            .pipe(map((r) => this.normalizeTeacherRows((r as any)?.data)));
    }

    getTopStudents(body: TopStudentsRequest): Observable<TopStudentItemDto[]> {
        if (environment.mockBusinessApis) {
            let rows = [...MOCK_TOP_STUDENTS];
            if (body.campusCode) {
                rows = rows.filter(
                    (r) =>
                        !r.campusCode ||
                        r.campusCode.toUpperCase() === body.campusCode.toUpperCase(),
                );
            }
            const top = body.top ?? 5;
            return of(rows.slice(0, top).map(({ campusCode: _c, ...row }) => row));
        }
        return this.http
            .post<ApiResponse<TopStudentItemDto[]>>(`${this.base}/top-students`, body)
            .pipe(map((r) => r.data ?? []));
    }

    getCampusTeacherStudentGrowthMetrics(
        body: CampusTeacherStudentGrowthMetricsRequest,
    ): Observable<TeacherStudentGrowthMetricsResponse[]> {
        if (environment.mockBusinessApis) {
            return of(
                MOCK_TEACHER_STUDENT_METRICS.filter((r) => r.teacherId === body.teacherId).map(
                    ({ teacherId: _id, ...row }) => row,
                ),
            );
        }
        return this.http
            .post<ApiResponse<TeacherStudentGrowthMetricsResponse[]>>(
                `${this.base}/campus-teacher-student-metrics`,
                body,
            )
            .pipe(map((r) => this.normalizeTeacherStudentRows((r as any)?.data)));
    }

    private normalizeTeacherStudentRows(raw: unknown): TeacherStudentGrowthMetricsResponse[] {
        if (!Array.isArray(raw)) {
            return [];
        }
        const num = (v: unknown): number | null => {
            if (v == null) {
                return null;
            }
            const n = typeof v === 'number' ? v : Number(String(v).trim());
            return Number.isFinite(n) ? n : null;
        };
        return raw.map((r: any) => ({
            campusName: r?.campusName ?? r?.CampusName,
            studentName: r?.studentName ?? r?.StudentName,
            grade: r?.grade ?? r?.Grade ?? r?.gradeCode ?? r?.GradeCode,
            subjectCode: r?.subjectCode ?? r?.SubjectCode ?? r?.subject ?? r?.Subject,
            growth: num(r?.growth ?? r?.Growth ?? r?.growthPct ?? r?.growth_pct),
            componentScore: num(
                r?.componentScore ?? r?.component_score ?? r?.cs ?? r?.ComponentScore,
            ),
        }));
    }
}
