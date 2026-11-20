import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, retry, shareReplay, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import {
    MOCK_ACADEMIC_YEARS,
    MOCK_CAMPUS_CATEGORIES,
    MOCK_DISTRICTS,
    MOCK_GRADES,
    MOCK_STATES,
    MOCK_SUBJECTS,
    mockCampusesFor,
    mockDistrictQuartersFor,
} from '../mocks/simplify-mock-data';
import type {
    AcademicYear,
    ApiResponse,
    Campus,
    CampusCategory,
    District,
    DistrictQuarter,
    Grade,
    State,
    Subject,
} from '../models/simplify-api.model';

/**
 * App-wide filter / reference data (Swagger: States, Districts, Academic Years,
 * District Quarters, Campuses, Campus Categories, Grades, Subjects).
 * Used by header context and feature screens for dropdowns and query params.
 *
 * Responses are cached in-memory for the session so bootstrap + dropdown changes
 * do not re-hit the network for identical queries.
 */
@Injectable({ providedIn: 'root' })
export class FiltersService {
    private readonly base = environment.apiUrl;
    private readonly cache = new Map<string, Observable<unknown>>();

    constructor(private http: HttpClient) {}

    /** Drop cached reference data (e.g. after admin CRUD). */
    invalidateCache(prefix?: string): void {
        if (!prefix) {
            this.cache.clear();
            return;
        }
        for (const key of this.cache.keys()) {
            if (key.startsWith(prefix)) {
                this.cache.delete(key);
            }
        }
    }

    listStates(activeOnly = true): Observable<State[]> {
        return this.cached(`states:${activeOnly}`, () => {
            if (environment.mockBusinessApis) {
                return of(activeOnly ? MOCK_STATES.filter((s) => s.isActive) : MOCK_STATES);
            }
            const params = new HttpParams().set('activeOnly', String(activeOnly));
            return this.http
                .get<ApiResponse<State[]>>(`${this.base}/states`, { params })
                .pipe(map((r) => r.data ?? []));
        });
    }

    listDistricts(options?: { stateId?: number; activeOnly?: boolean }): Observable<District[]> {
        const activeOnly = options?.activeOnly ?? true;
        const stateId = options?.stateId;
        const key = `districts:${stateId ?? 'all'}:${activeOnly}`;
        return this.cached(key, () => {
            if (environment.mockBusinessApis) {
                let rows = [...MOCK_DISTRICTS];
                if (stateId != null) {
                    rows = rows.filter((d) => d.stateId === stateId);
                }
                if (activeOnly === false) {
                    return of(rows);
                }
                return of(rows.filter((d) => d.isActive));
            }
            let params = new HttpParams();
            if (stateId != null) {
                params = params.set('stateId', String(stateId));
            }
            params = params.set('activeOnly', String(activeOnly));
            return this.http
                .get<ApiResponse<District[]>>(`${this.base}/districts`, { params })
                .pipe(map((r) => r.data ?? []));
        });
    }

    getDistrictById(id: number): Observable<District> {
        return this.cached(`district:${id}`, () => {
            if (environment.mockBusinessApis) {
                const d = MOCK_DISTRICTS.find((x) => x.districtId === id) ?? MOCK_DISTRICTS[0];
                return of(d);
            }
            return this.http
                .get<ApiResponse<District>>(`${this.base}/districts/${id}`)
                .pipe(map((r) => r.data as District));
        });
    }

    listAcademicYears(activeOnly = true): Observable<AcademicYear[]> {
        return this.cached(`academic-years:${activeOnly}`, () => {
            if (environment.mockBusinessApis) {
                return of(
                    activeOnly ? MOCK_ACADEMIC_YEARS.filter((y) => y.isActive) : MOCK_ACADEMIC_YEARS,
                );
            }
            const params = new HttpParams().set('activeOnly', String(activeOnly));
            return this.http
                .get<ApiResponse<AcademicYear[]>>(`${this.base}/academic-years`, { params })
                .pipe(map((r) => r.data ?? []));
        });
    }

    listDistrictQuarters(options?: {
        districtId?: number;
        academicYearId?: number;
        activeOnly?: boolean;
    }): Observable<DistrictQuarter[]> {
        const activeOnly = options?.activeOnly ?? true;
        const districtId = options?.districtId;
        const academicYearId = options?.academicYearId;
        const key = `district-quarters:${districtId ?? 'all'}:${academicYearId ?? 'all'}:${activeOnly}`;
        return this.cached(key, () => {
            if (environment.mockBusinessApis) {
                const did = districtId ?? 1;
                let rows = mockDistrictQuartersFor(did);
                if (academicYearId != null) {
                    rows = rows.filter((q) => q.academicYearId === academicYearId);
                }
                if (activeOnly === false) {
                    return of(rows);
                }
                return of(rows.filter((q) => q.isActive));
            }
            let params = new HttpParams();
            if (districtId != null) {
                params = params.set('districtId', String(districtId));
            }
            if (academicYearId != null) {
                params = params.set('academicYearId', String(academicYearId));
            }
            params = params.set('activeOnly', String(activeOnly));
            return this.http
                .get<ApiResponse<DistrictQuarter[]>>(`${this.base}/district-quarters`, { params })
                .pipe(map((r) => r.data ?? []));
        });
    }

    listCampuses(options?: { districtId?: number; activeOnly?: boolean }): Observable<Campus[]> {
        const activeOnly = options?.activeOnly ?? true;
        const districtId = options?.districtId;
        const key = `campuses:${districtId ?? 'all'}:${activeOnly}`;
        return this.cached(key, () => {
            if (environment.mockBusinessApis) {
                const did = districtId ?? 1;
                const rows = mockCampusesFor(did);
                if (activeOnly === false) {
                    return of(rows);
                }
                return of(rows.filter((c) => c.isActive));
            }
            let params = new HttpParams();
            if (districtId != null) {
                params = params.set('districtId', String(districtId));
            }
            params = params.set('activeOnly', String(activeOnly));
            return this.http
                .get<ApiResponse<Campus[]>>(`${this.base}/campuses`, { params })
                .pipe(retry({ count: 2, delay: 800 }), map((r) => r.data ?? []));
        });
    }

    listCampusCategories(activeOnly = true): Observable<CampusCategory[]> {
        return this.cached(`campus-categories:${activeOnly}`, () => {
            if (environment.mockBusinessApis) {
                return of(
                    activeOnly
                        ? MOCK_CAMPUS_CATEGORIES.filter((c) => c.isActive)
                        : MOCK_CAMPUS_CATEGORIES,
                );
            }
            const params = new HttpParams().set('activeOnly', String(activeOnly));
            return this.http
                .get<ApiResponse<CampusCategory[]>>(`${this.base}/campus-categories`, { params })
                .pipe(retry({ count: 2, delay: 800 }), map((r) => r.data ?? []));
        });
    }

    listGrades(activeOnly = true): Observable<Grade[]> {
        return this.cached(`grades:${activeOnly}`, () => {
            if (environment.mockBusinessApis) {
                return of(activeOnly ? MOCK_GRADES.filter((g) => g.isActive) : MOCK_GRADES);
            }
            const params = new HttpParams().set('activeOnly', String(activeOnly));
            return this.http
                .get<ApiResponse<Grade[]>>(`${this.base}/grades`, { params })
                .pipe(map((r) => r.data ?? []));
        });
    }

    listSubjects(options?: { activeOnly?: boolean }): Observable<Subject[]> {
        const activeOnly = options?.activeOnly ?? true;
        const key = `subjects:${activeOnly}`;
        return this.cached(key, () => {
            if (environment.mockBusinessApis) {
                return of(activeOnly ? MOCK_SUBJECTS.filter((s) => s.isActive) : MOCK_SUBJECTS);
            }
            const params = new HttpParams().set('activeOnly', String(activeOnly));
            return this.http
                .get<ApiResponse<Subject[]>>(`${this.base}/subjects`, { params })
                .pipe(map((r) => r.data ?? []));
        });
    }

    private cached<T>(key: string, factory: () => Observable<T>): Observable<T> {
        const hit = this.cache.get(key);
        if (hit) {
            return hit as Observable<T>;
        }
        const stream = factory().pipe(
            /**
             * Never cache a failed request: drop the entry on error so the next caller
             * re-fetches instead of replaying a stuck failure for the whole session
             * (this previously left reference lists like campuses/categories empty).
             */
            tap({ error: () => this.cache.delete(key) }),
            shareReplay({ bufferSize: 1, refCount: false }),
        );
        this.cache.set(key, stream);
        return stream;
    }
}
