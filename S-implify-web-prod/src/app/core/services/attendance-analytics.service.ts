import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
    MOCK_CATEGORY_ADA,
    MOCK_CAMPUS_WISE_ATTENDANCE,
    MOCK_DISTRICT_ATTENDANCE_SUMMARY,
    MOCK_INDIVIDUAL_CAMPUS_STATS,
    MOCK_INDIVIDUAL_STUDENT_STATS,
    MOCK_LOWEST_ADA,
    MOCK_MONTHLY_ATTENDANCE,
    mockCampusAttendanceRecordsFor,
} from '../mocks/simplify-mock-data';
import type {
    ApiResponse,
    CampusAttendanceRecordDto,
    CampusAttendanceRecordsRequest,
    CampusDailyAttendanceItemDto,
    CampusWiseAttendanceStatDto,
    DistrictAttendanceSummaryDto,
    IndividualAttendanceRecordItemDto,
    IndividualAttendanceRecordsRequest,
    IndividualAttendanceStatsRequest,
    IndividualCampusAttendanceStatsDto,
    IndividualStudentAttendanceStatsDto,
    LowestAdaCampusSnapshotDto,
    LowestAdaThreeDaysRequest,
    MonthlyAttendanceStatDto,
    MonthlyAttendanceStatsRequest,
} from '../models/simplify-api.model';

@Injectable({ providedIn: 'root' })
export class AttendanceAnalyticsService {
    private readonly base = `${environment.apiUrl}/campus-attendance`;
    private readonly individualBase = `${environment.apiUrl}/individual-attendance`;

    constructor(private http: HttpClient) {}

    postMonthlyStats(_body: MonthlyAttendanceStatsRequest): Observable<MonthlyAttendanceStatDto[]> {
        if (environment.mockBusinessApis) {
            return of([...MOCK_MONTHLY_ATTENDANCE]);
        }
        return this.http
            .post<ApiResponse<MonthlyAttendanceStatDto[]>>(`${this.base}/monthly-stats`, _body)
            .pipe(map((r) => r.data ?? []));
    }

    postDistrictAdaSummary(_body: MonthlyAttendanceStatsRequest): Observable<DistrictAttendanceSummaryDto> {
        if (environment.mockBusinessApis) {
            return of({ ...MOCK_DISTRICT_ATTENDANCE_SUMMARY });
        }
        return this.http
            .post<ApiResponse<DistrictAttendanceSummaryDto>>(`${this.base}/ada-summary`, _body)
            .pipe(map((r) => r.data as DistrictAttendanceSummaryDto));
    }

    postCampusWiseStats(_body: MonthlyAttendanceStatsRequest): Observable<CampusWiseAttendanceStatDto[]> {
        if (environment.mockBusinessApis) {
            return of([...MOCK_CAMPUS_WISE_ATTENDANCE]);
        }
        return this.http
            .post<ApiResponse<CampusWiseAttendanceStatDto[]>>(`${this.base}/campus-wise-stats`, _body)
            .pipe(map((r) => r.data ?? []));
    }

    postCampusCategoryMonthlyAda(_body: MonthlyAttendanceStatsRequest): Observable<Record<string, number[]>> {
        if (environment.mockBusinessApis) {
            return of({ ...MOCK_CATEGORY_ADA });
        }
        return this.http
            .post<ApiResponse<Record<string, number[]>>>(`${this.base}/campus-category-ada`, _body)
            .pipe(map((r) => (r.data ?? {}) as Record<string, number[]>));
    }

    postLowestAdaThreeDays(_body: LowestAdaThreeDaysRequest): Observable<LowestAdaCampusSnapshotDto[]> {
        if (environment.mockBusinessApis) {
            return of([...MOCK_LOWEST_ADA]);
        }
        return this.http
            .post<ApiResponse<LowestAdaCampusSnapshotDto[]>>(`${this.base}/lowest-ada-three-days`, _body)
            .pipe(map((r) => r.data ?? []));
    }

    /** GET /api/campus-attendance/records — daily attendance rows for one campus. */
    getCampusAttendanceRecords(
        params: CampusAttendanceRecordsRequest,
    ): Observable<CampusAttendanceRecordDto[]> {
        if (environment.mockBusinessApis) {
            return of(mockCampusAttendanceRecordsFor(params.campusCode));
        }
        const httpParams = new HttpParams()
            .set('districtId', String(params.districtId))
            .set('academicYearId', String(params.academicYearId))
            .set('campusCode', params.campusCode);
        return this.http
            .get<ApiResponse<CampusDailyAttendanceItemDto[]>>(`${this.base}/records`, {
                params: httpParams,
            })
            .pipe(map((r) => (r.data ?? []).map((row) => this.normalizeCampusAttendanceRecord(row))));
    }

    /** Maps the raw API item to the UI row shape (campus name/day are derived in the page). */
    private normalizeCampusAttendanceRecord(
        raw: CampusDailyAttendanceItemDto,
    ): CampusAttendanceRecordDto {
        return {
            attendanceDate: raw.attendanceDate,
            campusAdaPct: raw.campusAda,
            enrollment: raw.enrollment,
            studentAbsents: raw.studentsAbsent ?? raw.absentCount,
            estimatedMissed: raw.estimatedMissed,
            absGoal: raw.absGoal,
        };
    }

    /** District student PIA bands — red <90%, yellow 90–95%, green >95%. */
    postIndividualStudentStats(
        body: IndividualAttendanceStatsRequest,
    ): Observable<IndividualStudentAttendanceStatsDto> {
        if (environment.mockBusinessApis) {
            return of({ ...MOCK_INDIVIDUAL_STUDENT_STATS });
        }
        return this.http
            .post<ApiResponse<IndividualStudentAttendanceStatsDto>>(
                `${this.individualBase}/student-stats`,
                body,
            )
            .pipe(map((r) => r.data ?? {}));
    }

    /** Per-campus student PIA bands (same rules as district rollup). */
    postIndividualStudentStatsByCampus(
        body: IndividualAttendanceStatsRequest,
    ): Observable<IndividualCampusAttendanceStatsDto[]> {
        if (environment.mockBusinessApis) {
            return of([...MOCK_INDIVIDUAL_CAMPUS_STATS]);
        }
        return this.http
            .post<ApiResponse<IndividualCampusAttendanceStatsDto[]>>(
                `${this.individualBase}/student-stats/by-campus`,
                body,
            )
            .pipe(map((r) => r.data ?? []));
    }

    /** GET /api/individual-attendance/records — student PIA rows for a quarter (optionally one campus/band). */
    getIndividualAttendanceRecords(
        params: IndividualAttendanceRecordsRequest,
    ): Observable<IndividualAttendanceRecordItemDto[]> {
        if (environment.mockBusinessApis) {
            return of([] as IndividualAttendanceRecordItemDto[]);
        }
        let httpParams = new HttpParams()
            .set('districtId', String(params.districtId))
            .set('academicYearId', String(params.academicYearId))
            .set('quarterCode', params.quarterCode);
        if (params.campusCode?.trim()) {
            httpParams = httpParams.set('campusCode', params.campusCode.trim());
        }
        if (params.piaMin != null) {
            httpParams = httpParams.set('piaMin', String(params.piaMin));
        }
        if (params.piaMax != null) {
            httpParams = httpParams.set('piaMax', String(params.piaMax));
        }
        return this.http
            .get<ApiResponse<IndividualAttendanceRecordItemDto[]>>(
                `${this.individualBase}/records`,
                { params: httpParams },
            )
            .pipe(map((r) => r.data ?? []));
    }
}
