import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { MOCK_DISTRICT_OVERALL_PERCENTAGES } from '../mocks/simplify-mock-data';
import type {
    ApiResponse,
    DistrictOverallPercentagesRequest,
    DistrictOverallPercentagesResponse,
} from '../models/simplify-api.model';

@Injectable({ providedIn: 'root' })
export class DashboardAnalyticsService {
    private readonly base = `${environment.apiUrl}/dashboard`;

    constructor(private http: HttpClient) {}

    postOverallPercentages(
        body: DistrictOverallPercentagesRequest,
    ): Observable<DistrictOverallPercentagesResponse> {
        if (environment.mockBusinessApis) {
            return of({ ...MOCK_DISTRICT_OVERALL_PERCENTAGES });
        }
        return this.http
            .post<ApiResponse<DistrictOverallPercentagesResponse>>(
                `${this.base}/overall-percentages`,
                body,
            )
            .pipe(map((r) => this.normalizeOverallPercentages(r.data)));
    }

    private normalizeOverallPercentages(raw: unknown): DistrictOverallPercentagesResponse {
        const row = (raw ?? {}) as Record<string, unknown>;
        return {
            ccmrRate: this.toRate(row['ccmrRate'] ?? row['CcmrRate']),
            graduationRate: this.toRate(row['graduationRate'] ?? row['GraduationRate']),
            teachers: this.toRate(row['teachers'] ?? row['Teachers']),
            calendarMonth: this.toOptionalString(row['calendarMonth'] ?? row['CalendarMonth']),
        };
    }

    private toRate(value: unknown): number | undefined {
        if (value == null || value === '') {
            return undefined;
        }
        const parsed = Number(String(value).replace(/%/g, '').trim());
        return Number.isFinite(parsed) ? parsed : undefined;
    }

    private toOptionalString(value: unknown): string | undefined {
        if (value == null) {
            return undefined;
        }
        const text = String(value).trim();
        return text ? text : undefined;
    }
}
