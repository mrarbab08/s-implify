import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
    ApiResponse,
    CampusAttendanceUploadResponse,
    CcmrSheetUploadResponse,
    GrowthSheetUploadResponse,
    IndividualAttendanceUploadResponse,
    RawscoresUploadListItem,
    RawscoresUploadRequest,
    RawscoresUploadResponse,
    StudentStandardsUploadResponse,
    TeacherAssessmentUploadResponse,
    UploadApiResult,
} from '../models/simplify-api.model';

@Injectable({ providedIn: 'root' })
export class SimplifyUploadsService {
    private readonly api = environment.apiUrl;

    constructor(private http: HttpClient) {}

    uploadGrowthSheet(
        file: File,
        opts: {
            districtId: number;
            academicYearId: number;
            quarterCode: string;
            uploadedBy?: string;
        },
    ): Observable<UploadApiResult<GrowthSheetUploadResponse>> {
        const fd = new FormData();
        fd.append('file', file, file.name);

        let params = new HttpParams()
            .set('districtId', String(opts.districtId))
            .set('academicYearId', String(opts.academicYearId))
            .set('quarterCode', opts.quarterCode.trim());
        if (opts.uploadedBy) {
            params = params.set('uploadedBy', opts.uploadedBy);
        }

        return this.http
            .post<ApiResponse<GrowthSheetUploadResponse>>(`${this.api}/growth-sheet/upload`, fd, {
                params,
            })
            .pipe(
                map((r) => ({
                    data: r.data as GrowthSheetUploadResponse,
                    message: r.message,
                    statusCode: r.statusCode,
                })),
            );
    }

    uploadRawscoresSheet(
        file: File,
        opts: {
            districtId: number;
            academicYearId: number;
            uploadedBy?: string;
        },
    ): Observable<UploadApiResult<RawscoresUploadResponse>> {
        const fd = new FormData();
        fd.append('file', file, file.name);

        let params = new HttpParams()
            .set('districtId', String(opts.districtId))
            .set('academicYearId', String(opts.academicYearId));
        if (opts.uploadedBy) {
            params = params.set('uploadedBy', opts.uploadedBy);
        }

        return this.http
            .post<ApiResponse<RawscoresUploadResponse>>(`${this.api}/rawscores-uploads/upload`, fd, {
                params,
            })
            .pipe(
                map((r) => ({
                    data: r.data as RawscoresUploadResponse,
                    message: r.message,
                    statusCode: r.statusCode,
                })),
            );
    }

    uploadCampusAttendanceExcel(
        file: File,
        opts: {
            districtId: number;
            academicYearId: number;
            districtGoal?: number;
            estimatedDollarsPerStudent?: number;
            uploadedBy?: string;
        },
    ): Observable<UploadApiResult<CampusAttendanceUploadResponse>> {
        const fd = new FormData();
        fd.append('file', file, file.name);

        let params = new HttpParams()
            .set('districtId', String(opts.districtId))
            .set('academicYearId', String(opts.academicYearId));
        if (opts.districtGoal != null) {
            params = params.set('districtGoal', String(opts.districtGoal));
        }
        if (opts.estimatedDollarsPerStudent != null) {
            params = params.set(
                'estimatedDollarsPerStudent',
                String(opts.estimatedDollarsPerStudent),
            );
        }
        if (opts.uploadedBy) {
            params = params.set('uploadedBy', opts.uploadedBy);
        }

        return this.http
            .post<ApiResponse<CampusAttendanceUploadResponse>>(
                `${this.api}/campus-attendance/upload`,
                fd,
                { params },
            )
            .pipe(
                map((r) => ({
                    data: r.data as CampusAttendanceUploadResponse,
                    message: r.message,
                    statusCode: r.statusCode,
                })),
            );
    }

    listRawscoresUploads(filters?: {
        districtId?: number;
        academicYearId?: number;
    }): Observable<RawscoresUploadListItem[]> {
        return this.http
            .get<ApiResponse<RawscoresUploadListItem[]>>(`${this.api}/rawscores-uploads`, {
                params: this.uploadListParams(filters),
            })
            .pipe(map((r) => (r.data ?? []).map((item) => this.normalizeUploadHistoryItem(item))));
    }

    listGrowthSheetUploads(filters?: {
        districtId?: number;
        academicYearId?: number;
        quarterCode?: string;
    }): Observable<GrowthSheetUploadResponse[]> {
        return this.http
            .get<ApiResponse<GrowthSheetUploadResponse[]>>(`${this.api}/growth-sheet/uploads`, {
                params: this.uploadListParams(filters),
            })
            .pipe(map((r) => (r.data ?? []).map((item) => this.normalizeUploadHistoryItem(item))));
    }

    getGrowthSheetUpload(uploadId: number): Observable<GrowthSheetUploadResponse> {
        return this.http
            .get<ApiResponse<GrowthSheetUploadResponse>>(
                `${this.api}/growth-sheet/upload/${uploadId}`,
            )
            .pipe(map((r) => r.data as GrowthSheetUploadResponse));
    }

    listCampusAttendanceUploads(filters?: {
        districtId?: number;
        academicYearId?: number;
    }): Observable<CampusAttendanceUploadResponse[]> {
        return this.http
            .get<ApiResponse<CampusAttendanceUploadResponse[]>>(
                `${this.api}/campus-attendance/uploads`,
                { params: this.uploadListParams(filters) },
            )
            .pipe(map((r) => (r.data ?? []).map((item) => this.normalizeUploadHistoryItem(item))));
    }

    uploadTeacherAssessment(
        file: File,
        opts: {
            districtId: number;
            academicYearId?: number;
            scoreMultiplier?: number;
            uploadedBy?: string;
        },
    ): Observable<UploadApiResult<TeacherAssessmentUploadResponse>> {
        const fd = new FormData();
        fd.append('file', file, file.name);

        let params = new HttpParams().set('districtId', String(opts.districtId));
        if (opts.academicYearId != null) {
            params = params.set('academicYearId', String(opts.academicYearId));
        }
        if (opts.scoreMultiplier != null && Number.isFinite(opts.scoreMultiplier)) {
            params = params.set('scoreMultiplier', String(opts.scoreMultiplier));
        }
        if (opts.uploadedBy) {
            params = params.set('uploadedBy', opts.uploadedBy);
        }

        return this.http
            .post<ApiResponse<TeacherAssessmentUploadResponse>>(
                `${this.api}/teacher-assessment/upload`,
                fd,
                { params },
            )
            .pipe(
                map((r) => ({
                    data: this.normalizeUploadHistoryItem<TeacherAssessmentUploadResponse>(r.data),
                    message: r.message,
                    statusCode: r.statusCode,
                })),
            );
    }

    uploadStudentStandards(
        file: File,
        opts: {
            districtId: number;
            academicYearId: number;
            quarterCode: string;
            uploadedBy?: string;
        },
    ): Observable<UploadApiResult<StudentStandardsUploadResponse>> {
        const fd = new FormData();
        fd.append('file', file, file.name);

        let params = new HttpParams()
            .set('districtId', String(opts.districtId))
            .set('academicYearId', String(opts.academicYearId))
            .set('quarterCode', opts.quarterCode.trim());
        if (opts.uploadedBy) {
            params = params.set('uploadedBy', opts.uploadedBy);
        }

        return this.http
            .post<ApiResponse<StudentStandardsUploadResponse>>(
                `${this.api}/student-standards/upload`,
                fd,
                { params },
            )
            .pipe(
                map((r) => ({
                    data: r.data as StudentStandardsUploadResponse,
                    message: r.message,
                    statusCode: r.statusCode,
                })),
            );
    }

    uploadIndividualAttendance(
        file: File,
        opts: {
            districtId: number;
            academicYearId: number;
            quarterCode: string;
            uploadedBy?: string;
        },
    ): Observable<UploadApiResult<IndividualAttendanceUploadResponse>> {
        const fd = new FormData();
        fd.append('file', file, file.name);

        let params = new HttpParams()
            .set('districtId', String(opts.districtId))
            .set('academicYearId', String(opts.academicYearId))
            .set('quarterCode', opts.quarterCode.trim());
        if (opts.uploadedBy) {
            params = params.set('uploadedBy', opts.uploadedBy);
        }

        return this.http
            .post<ApiResponse<IndividualAttendanceUploadResponse>>(
                `${this.api}/individual-attendance/upload`,
                fd,
                { params },
            )
            .pipe(
                map((r) => ({
                    data: r.data as IndividualAttendanceUploadResponse,
                    message: r.message,
                    statusCode: r.statusCode,
                })),
            );
    }

    uploadCcmrSheet(
        file: File,
        opts: {
            districtId: number;
            academicYearId: number;
            uploadedBy?: string;
        },
    ): Observable<UploadApiResult<CcmrSheetUploadResponse>> {
        const fd = new FormData();
        fd.append('file', file, file.name);

        let params = new HttpParams()
            .set('districtId', String(opts.districtId))
            .set('academicYearId', String(opts.academicYearId));
        if (opts.uploadedBy) {
            params = params.set('uploadedBy', opts.uploadedBy);
        }

        return this.http
            .post<ApiResponse<CcmrSheetUploadResponse>>(`${this.api}/ccmr/upload`, fd, { params })
            .pipe(
                map((r) => ({
                    data: r.data as CcmrSheetUploadResponse,
                    message: r.message,
                    statusCode: r.statusCode,
                })),
            );
    }

    listTeacherAssessmentUploads(filters?: {
        districtId?: number;
        academicYearId?: number;
    }): Observable<TeacherAssessmentUploadResponse[]> {
        return this.http
            .get<ApiResponse<TeacherAssessmentUploadResponse[]>>(
                `${this.api}/teacher-assessment/uploads`,
                { params: this.uploadListParams(filters) },
            )
            .pipe(map((r) => (r.data ?? []).map((item) => this.normalizeUploadHistoryItem(item))));
    }

    listStudentStandardsUploads(filters?: {
        districtId?: number;
        academicYearId?: number;
        quarterCode?: string;
    }): Observable<StudentStandardsUploadResponse[]> {
        return this.http
            .get<ApiResponse<StudentStandardsUploadResponse[]>>(
                `${this.api}/student-standards/uploads`,
                { params: this.uploadListParams(filters) },
            )
            .pipe(map((r) => (r.data ?? []).map((item) => this.normalizeUploadHistoryItem(item))));
    }

    listIndividualAttendanceUploads(filters?: {
        districtId?: number;
        academicYearId?: number;
        quarterCode?: string;
    }): Observable<IndividualAttendanceUploadResponse[]> {
        return this.http
            .get<ApiResponse<IndividualAttendanceUploadResponse[]>>(
                `${this.api}/individual-attendance/uploads`,
                { params: this.uploadListParams(filters) },
            )
            .pipe(map((r) => (r.data ?? []).map((item) => this.normalizeUploadHistoryItem(item))));
    }

    listCcmrUploads(filters?: {
        districtId?: number;
        academicYearId?: number;
    }): Observable<CcmrSheetUploadResponse[]> {
        return this.http
            .get<ApiResponse<CcmrSheetUploadResponse[]>>(`${this.api}/ccmr/uploads`, {
                params: this.uploadListParams(filters),
            })
            .pipe(map((r) => (r.data ?? []).map((item) => this.normalizeUploadHistoryItem(item))));
    }

    deleteGrowthSheetUpload(uploadId: number): Observable<string | undefined> {
        return this.deleteUploadById('growth-sheet/uploads', uploadId);
    }

    deleteCcmrUpload(uploadId: number): Observable<string | undefined> {
        return this.deleteUploadById('ccmr/uploads', uploadId);
    }

    deleteCampusAttendanceUpload(uploadId: number): Observable<string | undefined> {
        return this.deleteUploadById('campus-attendance/uploads', uploadId);
    }

    deleteIndividualAttendanceUpload(uploadId: number): Observable<string | undefined> {
        return this.deleteUploadById('individual-attendance/uploads', uploadId);
    }

    deleteTeacherAssessmentUpload(uploadId: number): Observable<string | undefined> {
        return this.deleteUploadById('teacher-assessment/uploads', uploadId);
    }

    deleteStudentStandardsUpload(uploadId: number): Observable<string | undefined> {
        return this.deleteUploadById('student-standards/uploads', uploadId);
    }

    deleteRawscoresUpload(uploadId: number): Observable<string | undefined> {
        return this.deleteUploadById('rawscores-uploads', uploadId);
    }

    private deleteUploadById(pathPrefix: string, uploadId: number): Observable<string | undefined> {
        return this.http
            .delete<ApiResponse<unknown>>(`${this.api}/${pathPrefix}/${uploadId}`)
            .pipe(map((r) => r.message));
    }

    private uploadListParams(filters?: {
        districtId?: number;
        academicYearId?: number;
        quarterCode?: string;
    }): HttpParams {
        let params = new HttpParams();
        if (filters?.districtId != null) {
            params = params.set('districtId', String(filters.districtId));
        }
        if (filters?.academicYearId != null) {
            params = params.set('academicYearId', String(filters.academicYearId));
        }
        if (filters?.quarterCode?.trim()) {
            params = params.set('quarterCode', filters.quarterCode.trim());
        }
        return params;
    }

    createRawscoresUploadMetadata(body: RawscoresUploadRequest): Observable<RawscoresUploadListItem> {
        return this.http
            .post<ApiResponse<RawscoresUploadListItem>>(`${this.api}/rawscores-uploads`, body)
            .pipe(map((r) => r.data as RawscoresUploadListItem));
    }

    private normalizeUploadHistoryItem<T>(raw: unknown): T {
        if (!raw || typeof raw !== 'object') {
            return raw as T;
        }

        const record = raw as Record<string, unknown>;
        const errorMessage = record['errorMessage'] ?? record['ErrorMessage'];
        const sheetMessages = record['sheetMessages'] ?? record['SheetMessages'];
        const scoreMultiplierRaw = record['scoreMultiplier'] ?? record['ScoreMultiplier'];
        const scoreMultiplier =
            scoreMultiplierRaw == null || scoreMultiplierRaw === ''
                ? undefined
                : Number(scoreMultiplierRaw);

        return {
            ...record,
            ...(errorMessage !== undefined ? { errorMessage } : {}),
            ...(Array.isArray(sheetMessages) ? { sheetMessages } : {}),
            ...(Number.isFinite(scoreMultiplier) ? { scoreMultiplier } : {}),
        } as T;
    }
}
