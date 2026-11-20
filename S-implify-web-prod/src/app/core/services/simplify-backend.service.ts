import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiService } from './api.service';

export interface ApiEnvelope<T> {
    statusCode: number;
    message: string;
    data: T;
}

export interface CampusMetricsRequest {
    academicYearId: number;
    districtId: number;
    quarterCode: string;
    grade?: string[];
    subject?: string[];
    specialEducation?: boolean;
    economicDisadvantage?: boolean;
    emergentBilingual?: string;
    ethnicity?: string;
    testLanguage?: string;
    campusCategoryId?: number;
    campusCode?: string;
    teacherId?: number;
}

export interface CampusTeacherMetricsRequest {
    academicYearId: number;
    districtId: number;
    quarterCode: string;
    campusCode: string;
    grade?: string[];
    subject?: string[];
    specialEducation?: boolean;
    economicDisadvantage?: boolean;
    emergentBilingual?: string;
    ethnicity?: string;
    testLanguage?: string;
}

export interface TeacherMetric {
    teacherId: number;
    teacherIdExternal: string;
    firstName: string;
    lastName: string;
    componentScore: number;
    growth: number;
}

export interface CampusMetric {
    campusId: number;
    campusCode: string;
    campusName: string;
    componentScore: number;
    growth: number;
}

export interface CampusItem {
    campusId: number;
    districtId: number;
    campusCode: string;
    campusName: string;
    campusCategoryId: number;
    isActive: boolean;
}

export interface UploadGrowthSheetQuery {
    districtId: number;
    academicYearId: number;
    quarterCode: string;
    uploadedBy: string;
}

@Injectable({
    providedIn: 'root',
})
export class SimplifyBackendService {
    private readonly baseUrl = environment.apiUrl;

    constructor(
        private readonly api: ApiService,
        private readonly http: HttpClient,
    ) { }

    getCampuses(districtId: number, activeOnly = true): Observable<ApiEnvelope<CampusItem[]>> {
        return this.api.get<ApiEnvelope<CampusItem[]>>('campuses', { districtId, activeOnly });
    }

    getCampusMetrics(payload: CampusMetricsRequest): Observable<ApiEnvelope<CampusMetric[]>> {
        return this.api.post<ApiEnvelope<CampusMetric[]>>('growth/campus-metrics', payload);
    }

    getCampusTeacherMetrics(payload: CampusTeacherMetricsRequest): Observable<ApiEnvelope<TeacherMetric[]>> {
        return this.api.post<ApiEnvelope<TeacherMetric[]>>('growth/campus-teacher-metrics', payload);
    }

    uploadGrowthSheet(file: File, query: UploadGrowthSheetQuery): Observable<ApiEnvelope<unknown>> {
        const formData = new FormData();
        formData.append('file', file);

        const token = localStorage.getItem(environment.tokenKey);
        const headers = new HttpHeaders({
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
        });

        return this.http.post<ApiEnvelope<unknown>>(
            `${this.baseUrl}/growth-sheet/upload`,
            formData,
            { headers, params: { ...query } },
        );
    }
}
