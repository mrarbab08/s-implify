import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import type {
    ApiResponse,
    StudentGrowthRecordPageResponse,
    StudentGrowthRecordResponse,
    StudentGrowthRecordsByTeacherRequest,
    StudentGrowthRecordsQuery,
} from '../models/simplify-api.model';

@Injectable({ providedIn: 'root' })
export class StudentGrowthRecordsService {
    private readonly base = `${environment.apiUrl}/student-growth-records`;

    constructor(private http: HttpClient) {}

    listRecords(query: StudentGrowthRecordsQuery): Observable<StudentGrowthRecordPageResponse> {
        let params = new HttpParams()
            .set('districtId', String(query.districtId))
            .set('academicYearId', String(query.academicYearId))
            .set('quarterCode', query.quarterCode)
            .set('offset', String(query.offset))
            .set('limit', String(query.limit));
        params = this.appendOptionalQueryParams(params, query);

        return this.http
            .get<ApiResponse<StudentGrowthRecordPageResponse>>(this.base, { params })
            .pipe(map((r) => this.normalizePage(r.data)));
    }

    listByTeacher(body: StudentGrowthRecordsByTeacherRequest): Observable<StudentGrowthRecordResponse[]> {
        return this.http
            .post<ApiResponse<unknown>>(`${this.base}/by-teacher`, body)
            .pipe(map((r) => this.normalizeByTeacherRecords(r.data)));
    }

    private normalizeByTeacherRecords(raw: unknown): StudentGrowthRecordResponse[] {
        if (Array.isArray(raw)) {
            return raw.map((row) => this.normalizeRecord(row));
        }
        const p = (raw ?? {}) as Record<string, unknown>;
        const recordsRaw = (p['records'] ?? p['Records'] ?? []) as unknown[];
        return recordsRaw.map((row) => this.normalizeRecord(row));
    }

    private appendOptionalQueryParams(
        params: HttpParams,
        query: StudentGrowthRecordsQuery,
    ): HttpParams {
        const campusCode = query.campusCode?.trim();
        const gradeCode = query.gradeCode?.trim();
        const subjectCode = query.subjectCode?.trim();
        const teacherId = query.teacherId?.trim();
        const emergentBilingual = query.emergentBilingual?.trim();
        const testLanguage = query.testLanguage?.trim();
        const ethnicity = query.ethnicity?.trim();

        if (campusCode) params = params.set('campusCode', campusCode);
        if (gradeCode) params = params.set('gradeCode', gradeCode);
        if (subjectCode) params = params.set('subjectCode', subjectCode);
        if (teacherId) params = params.set('teacherId', teacherId);
        if (query.specialEducation != null) {
            params = params.set('specialEducation', String(query.specialEducation));
        }
        if (query.economicDisadvantage != null) {
            params = params.set('economicDisadvantage', String(query.economicDisadvantage));
        }
        if (emergentBilingual) params = params.set('emergentBilingual', emergentBilingual);
        if (testLanguage) params = params.set('testLanguage', testLanguage);
        if (ethnicity) params = params.set('ethnicity', ethnicity);
        return params;
    }

    private normalizePage(raw: unknown): StudentGrowthRecordPageResponse {
        const p = (raw ?? {}) as Record<string, unknown>;
        const recordsRaw = (p['records'] ?? p['Records'] ?? []) as unknown[];
        return {
            records: recordsRaw.map((row) => this.normalizeRecord(row)),
            totalCount: Number(p['totalCount'] ?? p['TotalCount'] ?? recordsRaw.length),
            offset: Number(p['offset'] ?? p['Offset'] ?? 0),
            limit: Number(p['limit'] ?? p['Limit'] ?? recordsRaw.length),
            districtId: Number(p['districtId'] ?? p['DistrictId'] ?? 0) || undefined,
            academicYearId: Number(p['academicYearId'] ?? p['AcademicYearId'] ?? 0) || undefined,
            quarterCode: (p['quarterCode'] ?? p['QuarterCode']) as string | undefined,
            quarterSequence: (p['quarterSequence'] ?? p['QuarterSequence']) as string[] | undefined,
        };
    }

    private normalizeRecord(raw: unknown): StudentGrowthRecordResponse {
        const r = (raw ?? {}) as Record<string, unknown>;
        const num = (key: string, alt: string) => {
            const v = r[key] ?? r[alt];
            if (v == null || v === '') return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        };
        const str = (key: string, alt: string) => (r[key] ?? r[alt]) as string | undefined;
        const progressionRaw = (r['quarterScoreProgression'] ?? r['QuarterScoreProgression'] ?? []) as unknown[];
        return {
            studentGrowthRecordId: Number(r['studentGrowthRecordId'] ?? r['StudentGrowthRecordId'] ?? 0) || undefined,
            growthSheetUploadId: Number(r['growthSheetUploadId'] ?? r['GrowthSheetUploadId'] ?? 0) || undefined,
            districtId: Number(r['districtId'] ?? r['DistrictId'] ?? 0) || undefined,
            academicYearId: Number(r['academicYearId'] ?? r['AcademicYearId'] ?? 0) || undefined,
            quarterCode: str('quarterCode', 'QuarterCode'),
            localId: str('localId', 'LocalId'),
            studentName: str('studentName', 'StudentName'),
            campusCode: str('campusCode', 'CampusCode'),
            gradeCode: str('gradeCode', 'GradeCode'),
            subjectCode: str('subjectCode', 'SubjectCode'),
            teacherId: str('teacherId', 'TeacherId'),
            teacherName: str('teacherName', 'TeacherName'),
            testLang: str('testLang', 'TestLang'),
            staar: num('staar', 'Staar'),
            staarPerLevel: num('staarPerLevel', 'StaarPerLevel'),
            quarterScore: num('quarterScore', 'QuarterScore'),
            quarterPerLevel: num('quarterPerLevel', 'QuarterPerLevel'),
            cs: num('cs', 'Cs'),
            delta: num('delta', 'Delta'),
            growth: num('growth', 'Growth'),
            app: num('app', 'App'),
            meets: num('meets', 'Meets'),
            masters: num('masters', 'Masters'),
            totalGrowthForQuarter: num('totalGrowthForQuarter', 'TotalGrowthForQuarter'),
            hb1416: num('hb1416', 'Hb1416'),
            hb1416Delta: num('hb1416Delta', 'Hb1416Delta'),
            quarterScoreProgression: progressionRaw.map((step) => {
                const s = (step ?? {}) as Record<string, unknown>;
                const stepNum = (key: string, alt: string) => {
                    const v = s[key] ?? s[alt];
                    if (v == null || v === '') return null;
                    const n = Number(v);
                    return Number.isFinite(n) ? n : null;
                };
                return {
                    earlierQuarterCode: s['earlierQuarterCode'] as string | undefined,
                    earlierQuarterScore: stepNum('earlierQuarterScore', 'EarlierQuarterScore'),
                    laterQuarterCode: s['laterQuarterCode'] as string | undefined,
                    laterQuarterScore: stepNum('laterQuarterScore', 'LaterQuarterScore'),
                };
            }),
            createdAt: str('createdAt', 'CreatedAt'),
            updatedAt: str('updatedAt', 'UpdatedAt'),
            createdBy: (r['createdBy'] ?? r['CreatedBy']) as string | null | undefined,
            updatedBy: (r['updatedBy'] ?? r['UpdatedBy']) as string | null | undefined,
        };
    }
}
