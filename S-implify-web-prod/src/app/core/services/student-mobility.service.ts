import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { MOCK_STUDENT_QUARTER_MOBILITY } from '../mocks/simplify-mock-data';
import type {
    ApiResponse,
    StudentQuarterMobilityRequest,
    StudentQuarterMobilityResponse,
} from '../models/simplify-api.model';

@Injectable({ providedIn: 'root' })
export class StudentMobilityService {
    private readonly base = `${environment.apiUrl}/student-mobility`;

    constructor(private http: HttpClient) {}

    /** POST /api/student-mobility/quarter-comparison */
    postQuarterComparison(
        body: StudentQuarterMobilityRequest,
    ): Observable<StudentQuarterMobilityResponse> {
        if (environment.mockBusinessApis) {
            return of({ ...MOCK_STUDENT_QUARTER_MOBILITY, ...body });
        }
        return this.http
            .post<ApiResponse<StudentQuarterMobilityResponse>>(`${this.base}/quarter-comparison`, body)
            .pipe(map((r) => (r.data ?? {}) as StudentQuarterMobilityResponse));
    }
}
