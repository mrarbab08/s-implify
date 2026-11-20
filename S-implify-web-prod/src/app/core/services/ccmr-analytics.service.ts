import { Injectable } from '@angular/core';

import { HttpClient, HttpParams } from '@angular/common/http';

import { Observable, of } from 'rxjs';

import { map } from 'rxjs/operators';

import { environment } from '../../../environments/environment';

import {

    MOCK_CCMR_ACADEMY_GRAD_BY_MONTH,

    MOCK_CCMR_ACADEMY_RECORDS,

    MOCK_CCMR_ACADEMY_STATS,

    MOCK_CCMR_MONTHLY_RATES,

} from '../mocks/simplify-mock-data';

import type {

    ApiResponse,

    CcmrAcademyMonthGradRateDto,

    CcmrAcademyMonthlyGradRateDto,

    CcmrAcademyStatsItemDto,

    CcmrAcademyStatsRequest,

    CcmrAcademyMonthlyGradRateRequest,

    CcmrAcademyRecordDto,

    CcmrAcademyRecordsRequest,

    CcmrRecordItemDto,

    CcmrCreditThresholds,

    CcmrDistrictMonthRateDto,

    CcmrDistrictMonthlyRatesRequest,

} from '../models/simplify-api.model';



@Injectable({ providedIn: 'root' })

export class CcmrAnalyticsService {

    private readonly base = `${environment.apiUrl}/ccmr`;



    constructor(private http: HttpClient) {}



    postDistrictMonthlyRates(

        body: CcmrDistrictMonthlyRatesRequest,

    ): Observable<CcmrDistrictMonthRateDto[]> {

        if (environment.mockBusinessApis) {

            return of([...MOCK_CCMR_MONTHLY_RATES]);

        }

        return this.http

            .post<ApiResponse<CcmrDistrictMonthRateDto[]>>(`${this.base}/monthly-rates`, body)

            .pipe(map((r) => r.data ?? []));

    }



    postAcademyStats(body: CcmrAcademyStatsRequest): Observable<CcmrAcademyStatsItemDto[]> {

        if (environment.mockBusinessApis) {

            return of([...MOCK_CCMR_ACADEMY_STATS]);

        }

        return this.http

            .post<ApiResponse<CcmrAcademyStatsItemDto[]>>(`${this.base}/academy-stats`, body)

            .pipe(map((r) => r.data ?? []));

    }



    postAcademyGradRateByMonth(

        body: CcmrAcademyMonthlyGradRateRequest,

    ): Observable<CcmrAcademyMonthlyGradRateDto[]> {

        if (environment.mockBusinessApis) {

            return of([...MOCK_CCMR_ACADEMY_GRAD_BY_MONTH]);

        }

        return this.http

            .post<ApiResponse<CcmrAcademyMonthlyGradRateDto[]>>(

                `${this.base}/academy-grad-rate-by-month`,

                body,

            )

            .pipe(map((r) => this.normalizeAcademyGradTrends(r.data ?? [])));

    }



    /** Group nested, flat, or map-shaped grad-rate rows into `{ school, months[] }`. */

    private normalizeAcademyGradTrends(raw: unknown[]): CcmrAcademyMonthlyGradRateDto[] {

        if (!raw.length) {

            return [];

        }



        const grouped = new Map<string, CcmrAcademyMonthGradRateDto[]>();



        for (const row of raw) {

            if (!row || typeof row !== 'object') {

                continue;

            }

            const item = row as Record<string, unknown>;

            const school = String(

                item['school'] ?? item['School'] ?? item['academy'] ?? item['Academy'] ?? '',

            ).trim();

            if (!school) {

                continue;

            }



            let months = this.normalizeMonthsField(

                item['months'] ??

                    item['Months'] ??

                    item['monthlyGradRates'] ??

                    item['MonthlyGradRates'] ??

                    item['monthRates'] ??

                    item['MonthRates'],

            );



            if (

                !months.length &&

                (item['calendarMonth'] ||

                    item['CalendarMonth'] ||

                    item['month'] ||

                    item['Month'] ||

                    item['gradRate'] != null ||

                    item['GradRate'] != null)

            ) {

                months = [this.normalizeMonthEntry(item)];

            }



            if (!months.length) {

                continue;

            }



            const bucket = grouped.get(school) ?? [];

            bucket.push(...months);

            grouped.set(school, bucket);

        }



        return [...grouped.entries()].map(([school, months]) => ({ school, months }));

    }



    private normalizeMonthsField(raw: unknown): CcmrAcademyMonthGradRateDto[] {

        if (raw == null) {

            return [];

        }

        if (Array.isArray(raw)) {

            return raw

                .map((entry) => {

                    if (entry == null) {

                        return null;

                    }

                    if (typeof entry === 'number') {

                        return { gradRate: entry };

                    }

                    if (typeof entry === 'object') {

                        return this.normalizeMonthEntry(entry as Record<string, unknown>);

                    }

                    return null;

                })

                .filter((m): m is CcmrAcademyMonthGradRateDto => m != null);

        }

        if (typeof raw === 'object') {

            return Object.entries(raw as Record<string, unknown>).map(([key, value]) => ({

                calendarMonth: key,

                gradRate: value != null ? Number(value) : undefined,

            }));

        }

        return [];

    }



    private normalizeMonthEntry(row: Record<string, unknown>): CcmrAcademyMonthGradRateDto {

        const calendarMonth = String(

            row['calendarMonth'] ??

                row['CalendarMonth'] ??

                row['month'] ??

                row['Month'] ??

                row['monthName'] ??

                row['MonthName'] ??

                '',

        ).trim();

        const gradRateRaw =
            row['gradRate'] ?? row['GradRate'] ?? row['gradeRate'] ?? row['GradeRate'];
        let gradRate: number | undefined;
        if (gradRateRaw != null && gradRateRaw !== '') {
            const parsed = Number(String(gradRateRaw).replace(/%/g, '').trim());
            gradRate = Number.isFinite(parsed) ? parsed : undefined;
        }
        return {
            calendarMonth: calendarMonth || undefined,
            gradRate,
        };

    }



    buildThresholdPayload(

        districtId: number,

        academicYearId: number,

        thresholds: CcmrCreditThresholds,

    ): CcmrAcademyMonthlyGradRateRequest {

        return { districtId, academicYearId, ...thresholds };

    }

    /** GET /api/ccmr/records — student rows for a month; omit academyCode for all academies. */
    getAcademyRecords(params: CcmrAcademyRecordsRequest): Observable<CcmrAcademyRecordDto[]> {
        if (environment.mockBusinessApis) {
            const key = (params.academyCode ?? '').trim().toUpperCase();
            const rows = !key
                ? [...MOCK_CCMR_ACADEMY_RECORDS]
                : MOCK_CCMR_ACADEMY_RECORDS.filter(
                      (r) => (r.school ?? '').trim().toUpperCase() === key,
                  );
            return of(rows);
        }
        let httpParams = new HttpParams()
            .set('districtId', String(params.districtId))
            .set('academicYearId', String(params.academicYearId))
            .set('calendarMonth', params.calendarMonth);
        const academyCode = params.academyCode?.trim();
        if (academyCode) {
            httpParams = httpParams.set('academyCode', academyCode);
        }
        return this.http
            .get<ApiResponse<CcmrRecordItemDto[]>>(`${this.base}/records`, { params: httpParams })
            .pipe(map((r) => (r.data ?? []).map((row) => this.normalizeAcademyRecord(row))));
    }

    private normalizeAcademyRecord(raw: unknown): CcmrAcademyRecordDto {
        const r = (raw ?? {}) as Record<string, unknown>;
        const str = (key: string, alt: string) => (r[key] ?? r[alt]) as string | undefined;
        const num = (key: string, alt: string) => {
            const v = r[key] ?? r[alt];
            return v == null || v === '' ? undefined : Number(v);
        };
        const metRaw = r['ccmrMet'] ?? r['CcmrMet'] ?? r['ccmrMET'] ?? r['CCMRMET'];
        return {
            firstName: str('firstName', 'FirstName'),
            lastName: str('lastName', 'LastName'),
            studentId: str('studentId', 'StudentId') ?? str('localId', 'LocalId'),
            school:
                str('academyCode', 'AcademyCode') ??
                str('school', 'School'),
            credit: num('credit', 'Credit') ?? num('credits', 'Credits'),
            campus:
                str('campusName', 'CampusName') ??
                str('campus', 'Campus') ??
                str('campusCode', 'CampusCode'),
            grade: str('grade', 'Grade') ?? str('gradeCode', 'GradeCode'),
            planA: str('planA', 'PlanA') ?? str('plan_a', 'PLAN_A'),
            planB: str('planB', 'PlanB') ?? str('plan_b', 'PLAN_B'),
            ccmrMet: metRaw as boolean | string | undefined,
        };
    }

}


