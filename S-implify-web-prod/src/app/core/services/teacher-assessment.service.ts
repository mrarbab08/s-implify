import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { MOCK_TEACHER_ASSESSMENT_RECORDS } from '../mocks/simplify-mock-data';
import type {
    ApiResponse,
    TeacherAssessmentRecordPageResponse,
    TeacherAssessmentRecordResponse,
    TeacherAssessmentRecordsQuery,
    TtessNewAssessmentPayload,
    TtessRubric,
    TtessSavedAssessmentResponse,
    TtessTeacherLatestResponse,
} from '../models/simplify-api.model';

export interface TeacherAssessmentRecordsResult {
    records: TeacherAssessmentRecordResponse[];
    totalCount: number;
    growthQuarterCode?: string;
}

@Injectable({ providedIn: 'root' })
export class TeacherAssessmentService {
    private readonly base = `${environment.apiUrl}/teacher-assessment`;
    private static readonly PAGE_SIZE = 100;

    constructor(private http: HttpClient) {}

    listRecords(query: TeacherAssessmentRecordsQuery): Observable<TeacherAssessmentRecordPageResponse> {
        if (environment.mockBusinessApis) {
            const filtered = this.filterMockRecords(query);
            const { offset, limit } = query;
            const slice = filtered.slice(offset, offset + limit);
            return of({
                records: slice,
                totalCount: filtered.length,
                offset,
                limit,
                growthQuarterCode: 'Q1',
            });
        }
        let params = new HttpParams()
            .set('districtId', String(query.districtId))
            .set('academicYearId', String(query.academicYearId))
            .set('offset', String(query.offset))
            .set('limit', String(query.limit));
        params = this.appendOptionalQueryParams(params, query);
        return this.http
            .get<ApiResponse<TeacherAssessmentRecordPageResponse>>(`${this.base}/records`, { params })
            .pipe(map((r) => this.normalizePage(r.data)));
    }

    /** Load every page for export (respects the same filters as {@link listRecords}). */
    listAllRecords(
        query: Omit<TeacherAssessmentRecordsQuery, 'offset' | 'limit'>,
    ): Observable<TeacherAssessmentRecordsResult> {
        return this.listRecords({
            ...query,
            offset: 0,
            limit: TeacherAssessmentService.PAGE_SIZE,
        }).pipe(
            switchMap((first) =>
                this.collectRemainingPages(query, first).pipe(
                    map((records) => ({
                        records,
                        totalCount: first.totalCount,
                        growthQuarterCode: first.growthQuarterCode,
                    })),
                ),
            ),
        );
    }

    /**
     * POST /api/teacher-assessment/ttess — save a full 16-dimension T-TESS assessment.
     * The backend computes the overall score, band and growth and mirrors one scored
     * row into teacher_assessment_records so the page data picks it up.
     */
    createTtessAssessment(payload: TtessNewAssessmentPayload): Observable<TtessSavedAssessmentResponse> {
        return this.http
            .post<ApiResponse<TtessSavedAssessmentResponse>>(`${this.base}/ttess`, payload)
            .pipe(map((r) => r.data));
    }

    /**
     * GET /api/teacher-assessment/ttess/teacher-latest — the teacher's most recent
     * scored assessment for the "New Assessment" summary card (null when none).
     */
    getTeacherLatest(districtId: number, teacherIdExternal: string): Observable<TtessTeacherLatestResponse | null> {
        const params = new HttpParams()
            .set('districtId', String(districtId))
            .set('teacherIdExternal', teacherIdExternal);
        return this.http
            .get<ApiResponse<TtessTeacherLatestResponse | null>>(`${this.base}/ttess/teacher-latest`, { params })
            .pipe(map((r) => (r.data == null ? null : r.data)));
    }

    /* ================= T-TESS rubric (District Profile → T-TESS Questions) ================= */

    /** GET /api/ttess-rubric?districtId= — domains, questions and rating options for a district. */
    getTtessRubric(districtId: number): Observable<TtessRubric> {
        const params = new HttpParams().set('districtId', String(districtId));
        return this.http
            .get<ApiResponse<TtessRubric>>(`${environment.apiUrl}/ttess-rubric`, { params })
            .pipe(map((r) => r.data));
    }

    /** PUT /api/ttess-rubric/domains/:id — rename a domain. Returns the refreshed rubric. */
    updateTtessDomain(domainId: number, domainName: string, updatedBy?: string): Observable<TtessRubric> {
        return this.http
            .put<ApiResponse<TtessRubric>>(`${environment.apiUrl}/ttess-rubric/domains/${domainId}`, {
                domainName,
                updatedBy,
            })
            .pipe(map((r) => r.data));
    }

    /** POST /api/ttess-rubric/questions — add a question under any domain. */
    createTtessQuestion(body: {
        districtId: number;
        ttessDomainId: number;
        questionCode: string;
        questionText: string;
        createdBy?: string;
    }): Observable<TtessRubric> {
        return this.http
            .post<ApiResponse<TtessRubric>>(`${environment.apiUrl}/ttess-rubric/questions`, body)
            .pipe(map((r) => r.data));
    }

    /** PUT /api/ttess-rubric/questions/:id — edit code/text or activate/deactivate. */
    updateTtessQuestion(
        questionId: number,
        body: { questionCode?: string; questionText?: string; isActive?: boolean; updatedBy?: string },
    ): Observable<TtessRubric> {
        return this.http
            .put<ApiResponse<TtessRubric>>(`${environment.apiUrl}/ttess-rubric/questions/${questionId}`, body)
            .pipe(map((r) => r.data));
    }

    /** PUT /api/ttess-rubric/questions/reorder — sortOrder follows the given id order. */
    reorderTtessQuestions(districtId: number, ttessQuestionIds: number[], updatedBy?: string): Observable<TtessRubric> {
        return this.http
            .put<ApiResponse<TtessRubric>>(`${environment.apiUrl}/ttess-rubric/questions/reorder`, {
                districtId,
                ttessQuestionIds,
                updatedBy,
            })
            .pipe(map((r) => r.data));
    }

    /** PUT /api/ttess-rubric/options — edit rating-scale labels / point values (bulk). */
    updateTtessOptions(
        districtId: number,
        options: Array<{ ttessOptionId: number; optionLabel?: string; pointValue?: number; isActive?: boolean }>,
        updatedBy?: string,
    ): Observable<TtessRubric> {
        return this.http
            .put<ApiResponse<TtessRubric>>(`${environment.apiUrl}/ttess-rubric/options`, {
                districtId,
                options,
                updatedBy,
            })
            .pipe(map((r) => r.data));
    }

    private collectRemainingPages(
        query: Omit<TeacherAssessmentRecordsQuery, 'offset' | 'limit'>,
        first: TeacherAssessmentRecordPageResponse,
        acc: TeacherAssessmentRecordResponse[] = [],
    ): Observable<TeacherAssessmentRecordResponse[]> {
        const merged = [...acc, ...first.records];
        const done =
            merged.length >= first.totalCount ||
            first.records.length === 0 ||
            first.records.length < first.limit;
        if (done) {
            return of(merged);
        }
        const nextOffset = merged.length;
        return this.listRecords({
            ...query,
            offset: nextOffset,
            limit: TeacherAssessmentService.PAGE_SIZE,
        }).pipe(switchMap((page) => this.collectRemainingPages(query, page, merged)));
    }

    private appendOptionalQueryParams(
        params: HttpParams,
        query: TeacherAssessmentRecordsQuery,
    ): HttpParams {
        const gradeCode = query.gradeCode?.trim();
        const subjectCode = query.subjectCode?.trim();
        if (gradeCode) {
            params = params.set('gradeCode', gradeCode);
        }
        if (subjectCode) {
            params = params.set('subjectCode', subjectCode);
        }
        if (query.averageScoreMin != null && Number.isFinite(query.averageScoreMin)) {
            params = params.set('averageScoreMin', String(query.averageScoreMin));
        }
        if (query.averageScoreMax != null && Number.isFinite(query.averageScoreMax)) {
            params = params.set('averageScoreMax', String(query.averageScoreMax));
        }
        return params;
    }

    private filterMockRecords(query: TeacherAssessmentRecordsQuery): TeacherAssessmentRecordResponse[] {
        let rows = [...MOCK_TEACHER_ASSESSMENT_RECORDS];
        const gradeCode = query.gradeCode?.trim();
        const subjectCode = query.subjectCode?.trim();
        if (gradeCode) {
            rows = rows.filter((r) => (r.grade ?? '').trim() === gradeCode);
        }
        if (subjectCode) {
            const needle = subjectCode.toLowerCase();
            rows = rows.filter((r) => (r.subjects ?? '').toLowerCase().includes(needle));
        }
        if (query.averageScoreMin != null && Number.isFinite(query.averageScoreMin)) {
            rows = rows.filter(
                (r) => r.averageScore != null && r.averageScore >= query.averageScoreMin!,
            );
        }
        if (query.averageScoreMax != null && Number.isFinite(query.averageScoreMax)) {
            rows = rows.filter(
                (r) => r.averageScore != null && r.averageScore <= query.averageScoreMax!,
            );
        }
        return rows;
    }

    private normalizePage(raw: unknown): TeacherAssessmentRecordPageResponse {
        const p = (raw ?? {}) as Record<string, unknown>;
        const recordsRaw = (p['records'] ?? p['Records'] ?? []) as unknown[];
        return {
            records: recordsRaw.map((row) => this.normalizeRecord(row)),
            totalCount: Number(p['totalCount'] ?? p['TotalCount'] ?? recordsRaw.length),
            offset: Number(p['offset'] ?? p['Offset'] ?? 0),
            limit: Number(p['limit'] ?? p['Limit'] ?? TeacherAssessmentService.PAGE_SIZE),
            growthQuarterCode: (p['growthQuarterCode'] ?? p['GrowthQuarterCode']) as string | undefined,
        };
    }

    private normalizeRecord(raw: unknown): TeacherAssessmentRecordResponse {
        const r = (raw ?? {}) as Record<string, unknown>;
        const num = (...keys: string[]) => {
            for (const key of keys) {
                const v = r[key];
                if (v == null || v === '') {
                    continue;
                }
                const n = Number(v);
                if (Number.isFinite(n)) {
                    return n;
                }
            }
            return null;
        };
        const str = (key: string, alt: string) => (r[key] ?? r[alt]) as string | undefined;
        return {
            teacherAssessmentRecordId: Number(r['teacherAssessmentRecordId'] ?? r['TeacherAssessmentRecordId'] ?? 0) || undefined,
            teacherAssessmentUploadId: Number(r['teacherAssessmentUploadId'] ?? r['TeacherAssessmentUploadId'] ?? 0) || undefined,
            districtId: Number(r['districtId'] ?? r['DistrictId'] ?? 0) || undefined,
            academicYearId: Number(r['academicYearId'] ?? r['AcademicYearId'] ?? 0) || undefined,
            evaluationId: str('evaluationId', 'EvaluationId'),
            teacherIdExternal: str('teacherIdExternal', 'TeacherIdExternal'),
            teacherFirstName: str('teacherFirstName', 'TeacherFirstName'),
            teacherLastName: str('teacherLastName', 'TeacherLastName'),
            subjects: str('subjects', 'Subjects'),
            grade: str('grade', 'Grade'),
            evaluationDate: str('evaluationDate', 'EvaluationDate'),
            appraiserFirstName: str('appraiserFirstName', 'AppraiserFirstName'),
            appraiserLastName: str('appraiserLastName', 'AppraiserLastName'),
            appraiserTitle: str('appraiserTitle', 'AppraiserTitle'),
            campusCode: str('campusCode', 'CampusCode'),
            walkthrough1Score: num('walkthrough1Score', 'Walkthrough1Score'),
            walkthrough2Score: num('walkthrough2Score', 'Walkthrough2Score'),
            walkthrough3Score: num('walkthrough3Score', 'Walkthrough3Score'),
            walkthrough4Score: num('walkthrough4Score', 'Walkthrough4Score'),
            observation1Score: num('observation1Score', 'Observation1Score'),
            observation2Score: num('observation2Score', 'Observation2Score'),
            summativeScore: num('summativeScore', 'SummativeScore'),
            averageScore: num('averageScore', 'AverageScore'),
            growth: num('growth', 'Growth'),
            createdAt: str('createdAt', 'CreatedAt'),
            updatedAt: str('updatedAt', 'UpdatedAt'),
            createdBy: str('createdBy', 'CreatedBy'),
            updatedBy: str('updatedBy', 'UpdatedBy'),
        };
    }
}
