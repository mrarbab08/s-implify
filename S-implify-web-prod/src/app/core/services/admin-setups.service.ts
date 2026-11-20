import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { MOCK_ACADEMIC_YEARS, MOCK_CAMPUS_CATEGORIES, MOCK_CAMPUS_GRADES, MOCK_DISTRICTS, MOCK_DISTRICT_SUBJECT_IDS, MOCK_GRADES, MOCK_STATES, MOCK_SUBJECTS, mockCampusesFor, mockCampusGradesFor, mockDistrictAcademiesFor, mockDistrictQuartersFor } from '../mocks/simplify-mock-data';
import type {
    AcademicYear,
    AcademicYearRequest,
    ApiResponse,
    Campus,
    CampusCategory,
    CampusCategoryRequest,
    CampusGradeItemDto,
    CampusGradeRequest,
    CampusGradesSyncRequest,
    CampusRequest,
    District,
    DistrictAcademy,
    DistrictAcademyRequest,
    DistrictQuarter,
    DistrictQuarterRequest,
    DistrictRequest,
    DistrictSubjectDto,
    DistrictSubjectsRequest,
    Grade,
    GradeRequest,
    State,
    StateRequest,
    Subject,
    SubjectRequest,
} from '../models/simplify-api.model';

/**
 * Admin CRUD for reference data (Swagger: States, Districts, Authentication register).
 */
@Injectable({ providedIn: 'root' })
export class AdminSetupsService {
    private readonly base = environment.apiUrl;

    constructor(private http: HttpClient) {}

    listStates(activeOnly = false): Observable<State[]> {
        if (environment.mockBusinessApis) {
            const rows = [...MOCK_STATES];
            return of(activeOnly ? rows.filter((s) => s.isActive) : rows);
        }
        const params = new HttpParams().set('activeOnly', String(activeOnly));
        return this.http
            .get<ApiResponse<State[]>>(`${this.base}/states`, { params })
            .pipe(map((r) => r.data ?? []));
    }

    getState(id: number): Observable<State> {
        if (environment.mockBusinessApis) {
            const row = MOCK_STATES.find((s) => s.stateId === id) ?? MOCK_STATES[0];
            return of(row);
        }
        return this.http
            .get<ApiResponse<State>>(`${this.base}/states/${id}`)
            .pipe(map((r) => r.data as State));
    }

    createState(body: StateRequest): Observable<State> {
        if (environment.mockBusinessApis) {
            const next: State = {
                stateId: MOCK_STATES.length + 1,
                stateCode: body.stateCode,
                stateName: body.stateName,
                isActive: body.isActive ?? true,
            };
            MOCK_STATES.push(next);
            return of(next);
        }
        return this.http
            .post<ApiResponse<State>>(`${this.base}/states`, body)
            .pipe(map((r) => r.data as State));
    }

    updateState(id: number, body: StateRequest): Observable<State> {
        if (environment.mockBusinessApis) {
            const idx = MOCK_STATES.findIndex((s) => s.stateId === id);
            if (idx >= 0) {
                MOCK_STATES[idx] = {
                    ...MOCK_STATES[idx],
                    stateCode: body.stateCode,
                    stateName: body.stateName,
                    isActive: body.isActive ?? MOCK_STATES[idx].isActive,
                };
                return of(MOCK_STATES[idx]);
            }
            return of(MOCK_STATES[0]);
        }
        return this.http
            .put<ApiResponse<State>>(`${this.base}/states/${id}`, body)
            .pipe(map((r) => r.data as State));
    }

    listDistricts(options?: { stateId?: number; activeOnly?: boolean }): Observable<District[]> {
        if (environment.mockBusinessApis) {
            let rows = [...MOCK_DISTRICTS];
            if (options?.stateId != null) {
                rows = rows.filter((d) => d.stateId === options.stateId);
            }
            if (options?.activeOnly !== false) {
                rows = rows.filter((d) => d.isActive);
            }
            return of(rows);
        }
        let params = new HttpParams().set('activeOnly', String(options?.activeOnly ?? false));
        if (options?.stateId != null) {
            params = params.set('stateId', String(options.stateId));
        }
        return this.http
            .get<ApiResponse<District[]>>(`${this.base}/districts`, { params })
            .pipe(map((r) => r.data ?? []));
    }

    getDistrict(id: number): Observable<District> {
        if (environment.mockBusinessApis) {
            const row = MOCK_DISTRICTS.find((d) => d.districtId === id) ?? MOCK_DISTRICTS[0];
            return of(row);
        }
        return this.http
            .get<ApiResponse<District>>(`${this.base}/districts/${id}`)
            .pipe(map((r) => r.data as District));
    }

    createDistrict(body: DistrictRequest): Observable<District> {
        if (environment.mockBusinessApis) {
            const next: District = {
                districtId: MOCK_DISTRICTS.length + 1,
                stateId: body.stateId,
                districtName: body.districtName,
                districtCode: body.districtCode,
                districtAbbreviation: body.districtAbbreviation,
                districtPhone: body.districtPhone,
                districtLogo: body.districtLogo,
                districtTimeZone: body.districtTimeZone,
                isActive: body.isActive ?? true,
            };
            MOCK_DISTRICTS.push(next);
            return of(next);
        }
        return this.http
            .post<ApiResponse<District>>(`${this.base}/districts`, body)
            .pipe(map((r) => r.data as District));
    }

    updateDistrict(id: number, body: DistrictRequest): Observable<District> {
        if (environment.mockBusinessApis) {
            const idx = MOCK_DISTRICTS.findIndex((d) => d.districtId === id);
            if (idx >= 0) {
                MOCK_DISTRICTS[idx] = {
                    ...MOCK_DISTRICTS[idx],
                    ...body,
                    districtId: MOCK_DISTRICTS[idx].districtId,
                };
                return of(MOCK_DISTRICTS[idx]);
            }
            return of(MOCK_DISTRICTS[0]);
        }
        return this.http
            .put<ApiResponse<District>>(`${this.base}/districts/${id}`, body)
            .pipe(map((r) => r.data as District));
    }

    listDistrictQuarters(options?: {
        districtId?: number;
        academicYearId?: number;
        activeOnly?: boolean;
    }): Observable<DistrictQuarter[]> {
        if (environment.mockBusinessApis) {
            let rows: DistrictQuarter[] = [];
            if (options?.districtId != null) {
                rows = mockDistrictQuartersFor(options.districtId);
            }
            if (options?.academicYearId != null) {
                rows = rows.filter((q) => q.academicYearId === options.academicYearId);
            }
            if (options?.activeOnly) {
                rows = rows.filter((q) => q.isActive);
            }
            return of(rows);
        }
        let params = new HttpParams().set('activeOnly', String(options?.activeOnly ?? false));
        if (options?.districtId != null) {
            params = params.set('districtId', String(options.districtId));
        }
        if (options?.academicYearId != null) {
            params = params.set('academicYearId', String(options.academicYearId));
        }
        return this.http
            .get<ApiResponse<DistrictQuarter[]>>(`${this.base}/district-quarters`, { params })
            .pipe(map((r) => r.data ?? []));
    }

    createDistrictQuarter(body: DistrictQuarterRequest): Observable<DistrictQuarter> {
        if (environment.mockBusinessApis) {
            const next: DistrictQuarter = {
                districtQuarterId: 100 + body.districtId,
                districtId: body.districtId,
                academicYearId: body.academicYearId,
                quarterCode: body.quarterCode,
                quarterName: body.quarterName,
                startDate: body.startDate,
                endDate: body.endDate,
                sortOrder: body.sortOrder,
                isActive: body.isActive ?? true,
            };
            return of(next);
        }
        return this.http
            .post<ApiResponse<DistrictQuarter>>(`${this.base}/district-quarters`, body)
            .pipe(map((r) => r.data as DistrictQuarter));
    }

    updateDistrictQuarter(id: number, body: DistrictQuarterRequest): Observable<DistrictQuarter> {
        if (environment.mockBusinessApis) {
            return of({
                districtQuarterId: id,
                districtId: body.districtId,
                academicYearId: body.academicYearId,
                quarterCode: body.quarterCode,
                quarterName: body.quarterName,
                startDate: body.startDate,
                endDate: body.endDate,
                sortOrder: body.sortOrder,
                isActive: body.isActive ?? true,
            });
        }
        return this.http
            .put<ApiResponse<DistrictQuarter>>(`${this.base}/district-quarters/${id}`, body)
            .pipe(map((r) => r.data as DistrictQuarter));
    }

    listDistrictAcademies(options?: { districtId?: number; activeOnly?: boolean }): Observable<DistrictAcademy[]> {
        if (environment.mockBusinessApis) {
            let rows: DistrictAcademy[] = [];
            if (options?.districtId != null) {
                rows = mockDistrictAcademiesFor(options.districtId);
            }
            if (options?.activeOnly) {
                rows = rows.filter((a) => a.isActive);
            }
            return of(rows);
        }
        let params = new HttpParams().set('activeOnly', String(options?.activeOnly ?? false));
        if (options?.districtId != null) {
            params = params.set('districtId', String(options.districtId));
        }
        return this.http
            .get<ApiResponse<DistrictAcademy[]>>(`${this.base}/district-academies`, { params })
            .pipe(map((r) => r.data ?? []));
    }

    createDistrictAcademy(body: DistrictAcademyRequest): Observable<DistrictAcademy> {
        if (environment.mockBusinessApis) {
            const next: DistrictAcademy = {
                districtAcademyId: 200 + body.districtId,
                districtId: body.districtId,
                academyCode: body.academyCode,
                academyName: body.academyName,
                sortOrder: body.sortOrder,
                isActive: body.isActive ?? true,
            };
            return of(next);
        }
        return this.http
            .post<ApiResponse<DistrictAcademy>>(`${this.base}/district-academies`, body)
            .pipe(map((r) => r.data as DistrictAcademy));
    }

    updateDistrictAcademy(id: number, body: DistrictAcademyRequest): Observable<DistrictAcademy> {
        if (environment.mockBusinessApis) {
            return of({
                districtAcademyId: id,
                districtId: body.districtId,
                academyCode: body.academyCode,
                academyName: body.academyName,
                sortOrder: body.sortOrder,
                isActive: body.isActive ?? true,
            });
        }
        return this.http
            .put<ApiResponse<DistrictAcademy>>(`${this.base}/district-academies/${id}`, body)
            .pipe(map((r) => r.data as DistrictAcademy));
    }

    listGrades(activeOnly = false): Observable<Grade[]> {
        if (environment.mockBusinessApis) {
            const rows = [...MOCK_GRADES];
            return of(activeOnly ? rows.filter((g) => g.isActive) : rows);
        }
        const params = new HttpParams().set('activeOnly', String(activeOnly));
        return this.http
            .get<ApiResponse<Grade[]>>(`${this.base}/grades`, { params })
            .pipe(map((r) => r.data ?? []));
    }

    createGrade(body: GradeRequest): Observable<Grade> {
        if (environment.mockBusinessApis) {
            const next: Grade = {
                gradeId: MOCK_GRADES.length + 1,
                gradeCode: body.gradeCode,
                gradeName: body.gradeName,
                sortOrder: body.sortOrder,
                isActive: body.isActive ?? true,
            };
            MOCK_GRADES.push(next);
            return of(next);
        }
        return this.http
            .post<ApiResponse<Grade>>(`${this.base}/grades`, body)
            .pipe(map((r) => r.data as Grade));
    }

    updateGrade(id: number, body: GradeRequest): Observable<Grade> {
        if (environment.mockBusinessApis) {
            const idx = MOCK_GRADES.findIndex((g) => g.gradeId === id);
            if (idx >= 0) {
                MOCK_GRADES[idx] = {
                    ...MOCK_GRADES[idx],
                    gradeCode: body.gradeCode,
                    gradeName: body.gradeName,
                    sortOrder: body.sortOrder,
                    isActive: body.isActive ?? MOCK_GRADES[idx].isActive,
                };
                return of(MOCK_GRADES[idx]);
            }
            return of(MOCK_GRADES[0]);
        }
        return this.http
            .put<ApiResponse<Grade>>(`${this.base}/grades/${id}`, body)
            .pipe(map((r) => r.data as Grade));
    }

    listCampusCategories(activeOnly = false): Observable<CampusCategory[]> {
        if (environment.mockBusinessApis) {
            const rows = [...MOCK_CAMPUS_CATEGORIES];
            return of(activeOnly ? rows.filter((c) => c.isActive) : rows);
        }
        const params = new HttpParams().set('activeOnly', String(activeOnly));
        return this.http
            .get<ApiResponse<CampusCategory[]>>(`${this.base}/campus-categories`, { params })
            .pipe(map((r) => r.data ?? []));
    }

    createCampusCategory(body: CampusCategoryRequest): Observable<CampusCategory> {
        if (environment.mockBusinessApis) {
            const next: CampusCategory = {
                campusCategoryId: MOCK_CAMPUS_CATEGORIES.length + 1,
                categoryName: body.categoryName,
                categoryCode: body.categoryCode,
                isActive: body.isActive ?? true,
            };
            MOCK_CAMPUS_CATEGORIES.push(next);
            return of(next);
        }
        return this.http
            .post<ApiResponse<CampusCategory>>(`${this.base}/campus-categories`, body)
            .pipe(map((r) => r.data as CampusCategory));
    }

    updateCampusCategory(id: number, body: CampusCategoryRequest): Observable<CampusCategory> {
        if (environment.mockBusinessApis) {
            const idx = MOCK_CAMPUS_CATEGORIES.findIndex((c) => c.campusCategoryId === id);
            if (idx >= 0) {
                MOCK_CAMPUS_CATEGORIES[idx] = {
                    ...MOCK_CAMPUS_CATEGORIES[idx],
                    categoryName: body.categoryName,
                    categoryCode: body.categoryCode,
                    isActive: body.isActive ?? MOCK_CAMPUS_CATEGORIES[idx].isActive,
                };
                return of(MOCK_CAMPUS_CATEGORIES[idx]);
            }
            return of(MOCK_CAMPUS_CATEGORIES[0]);
        }
        return this.http
            .put<ApiResponse<CampusCategory>>(`${this.base}/campus-categories/${id}`, body)
            .pipe(map((r) => r.data as CampusCategory));
    }

    listCampuses(options?: { districtId?: number; activeOnly?: boolean }): Observable<Campus[]> {
        if (environment.mockBusinessApis) {
            let rows: Campus[] = [];
            if (options?.districtId != null) {
                rows = mockCampusesFor(options.districtId);
            }
            if (options?.activeOnly) {
                rows = rows.filter((c) => c.isActive);
            }
            return of(rows);
        }
        let params = new HttpParams().set('activeOnly', String(options?.activeOnly ?? false));
        if (options?.districtId != null) {
            params = params.set('districtId', String(options.districtId));
        }
        return this.http
            .get<ApiResponse<Campus[]>>(`${this.base}/campuses`, { params })
            .pipe(map((r) => r.data ?? []));
    }

    createCampus(body: CampusRequest): Observable<Campus> {
        if (environment.mockBusinessApis) {
            const next: Campus = {
                campusId: 1000 + body.districtId,
                districtId: body.districtId,
                campusCategoryId: body.campusCategoryId,
                campusCode: body.campusCode,
                campusIdExternal: body.campusIdExternal,
                campusName: body.campusName,
                isActive: body.isActive ?? true,
            };
            return of(next);
        }
        return this.http
            .post<ApiResponse<Campus>>(`${this.base}/campuses`, body)
            .pipe(map((r) => r.data as Campus));
    }

    updateCampus(id: number, body: CampusRequest): Observable<Campus> {
        if (environment.mockBusinessApis) {
            return of({
                campusId: id,
                districtId: body.districtId,
                campusCategoryId: body.campusCategoryId,
                campusCode: body.campusCode,
                campusIdExternal: body.campusIdExternal,
                campusName: body.campusName,
                isActive: body.isActive ?? true,
            });
        }
        return this.http
            .put<ApiResponse<Campus>>(`${this.base}/campuses/${id}`, body)
            .pipe(map((r) => r.data as Campus));
    }

    /**
     * DELETE /districts/:id — the backend refuses (409) while campuses, teachers,
     * quarters, users, or analytics data still reference the district.
     */
    deleteDistrict(id: number): Observable<void> {
        if (environment.mockBusinessApis) {
            return of(undefined);
        }
        return this.http
            .delete<ApiResponse<unknown>>(`${this.base}/districts/${id}`)
            .pipe(map(() => undefined));
    }

    /**
     * DELETE /campuses/:id — the backend cascades the campus's grade associations
     * and refuses (409) while teachers, users, or analytics data still reference it.
     */
    deleteCampus(id: number): Observable<void> {
        if (environment.mockBusinessApis) {
            return of(undefined);
        }
        return this.http
            .delete<ApiResponse<unknown>>(`${this.base}/campuses/${id}`)
            .pipe(map(() => undefined));
    }

    listAcademicYears(activeOnly = false): Observable<AcademicYear[]> {
        if (environment.mockBusinessApis) {
            const rows = [...MOCK_ACADEMIC_YEARS];
            return of(activeOnly ? rows.filter((y) => y.isActive) : rows);
        }
        const params = new HttpParams().set('activeOnly', String(activeOnly));
        return this.http
            .get<ApiResponse<AcademicYear[]>>(`${this.base}/academic-years`, { params })
            .pipe(map((r) => r.data ?? []));
    }

    createAcademicYear(body: AcademicYearRequest): Observable<AcademicYear> {
        if (environment.mockBusinessApis) {
            const next: AcademicYear = {
                academicYearId: MOCK_ACADEMIC_YEARS.length + 1,
                yearLabel: body.yearLabel,
                startDate: body.startDate,
                endDate: body.endDate,
                isActive: body.isActive ?? true,
            };
            MOCK_ACADEMIC_YEARS.push(next);
            return of(next);
        }
        return this.http
            .post<ApiResponse<AcademicYear>>(`${this.base}/academic-years`, body)
            .pipe(map((r) => r.data as AcademicYear));
    }

    updateAcademicYear(id: number, body: AcademicYearRequest): Observable<AcademicYear> {
        if (environment.mockBusinessApis) {
            const idx = MOCK_ACADEMIC_YEARS.findIndex((y) => y.academicYearId === id);
            if (idx >= 0) {
                MOCK_ACADEMIC_YEARS[idx] = {
                    ...MOCK_ACADEMIC_YEARS[idx],
                    yearLabel: body.yearLabel,
                    startDate: body.startDate,
                    endDate: body.endDate,
                    isActive: body.isActive ?? MOCK_ACADEMIC_YEARS[idx].isActive,
                };
                return of(MOCK_ACADEMIC_YEARS[idx]);
            }
            return of(MOCK_ACADEMIC_YEARS[0]);
        }
        return this.http
            .put<ApiResponse<AcademicYear>>(`${this.base}/academic-years/${id}`, body)
            .pipe(map((r) => r.data as AcademicYear));
    }

    listSubjects(options?: { activeOnly?: boolean }): Observable<Subject[]> {
        const activeOnly = options?.activeOnly ?? false;
        if (environment.mockBusinessApis) {
            const rows = [...MOCK_SUBJECTS];
            return of(activeOnly ? rows.filter((s) => s.isActive) : rows);
        }
        const params = new HttpParams().set('activeOnly', String(activeOnly));
        return this.http
            .get<ApiResponse<Subject[]>>(`${this.base}/subjects`, { params })
            .pipe(map((r) => r.data ?? []));
    }

    getSubject(id: number): Observable<Subject> {
        if (environment.mockBusinessApis) {
            const row = MOCK_SUBJECTS.find((s) => s.subjectId === id) ?? MOCK_SUBJECTS[0];
            return of(row);
        }
        return this.http
            .get<ApiResponse<Subject>>(`${this.base}/subjects/${id}`)
            .pipe(map((r) => r.data as Subject));
    }

    createSubject(body: SubjectRequest): Observable<Subject> {
        if (environment.mockBusinessApis) {
            const next: Subject = {
                subjectId: MOCK_SUBJECTS.length + 1,
                subjectCode: body.subjectCode,
                subjectName: body.subjectName,
                isActive: body.isActive ?? true,
            };
            MOCK_SUBJECTS.push(next);
            return of(next);
        }
        return this.http
            .post<ApiResponse<Subject>>(`${this.base}/subjects`, body)
            .pipe(map((r) => r.data as Subject));
    }

    updateSubject(id: number, body: SubjectRequest): Observable<Subject> {
        if (environment.mockBusinessApis) {
            const idx = MOCK_SUBJECTS.findIndex((s) => s.subjectId === id);
            if (idx >= 0) {
                MOCK_SUBJECTS[idx] = {
                    ...MOCK_SUBJECTS[idx],
                    subjectCode: body.subjectCode,
                    subjectName: body.subjectName,
                    isActive: body.isActive ?? MOCK_SUBJECTS[idx].isActive,
                };
                return of(MOCK_SUBJECTS[idx]);
            }
            return of(MOCK_SUBJECTS[0]);
        }
        return this.http
            .put<ApiResponse<Subject>>(`${this.base}/subjects/${id}`, body)
            .pipe(map((r) => r.data as Subject));
    }

    deleteSubject(id: number): Observable<void> {
        if (environment.mockBusinessApis) {
            const idx = MOCK_SUBJECTS.findIndex((s) => s.subjectId === id);
            if (idx >= 0) {
                MOCK_SUBJECTS.splice(idx, 1);
            }
            return of(undefined);
        }
        return this.http
            .delete<ApiResponse<unknown>>(`${this.base}/subjects/${id}`)
            .pipe(map(() => undefined));
    }

    /** GET /api/district-subjects — subjects associated with a district. */
    listDistrictSubjects(districtId: number): Observable<DistrictSubjectDto[]> {
        if (environment.mockBusinessApis) {
            const ids = MOCK_DISTRICT_SUBJECT_IDS.get(districtId) ?? [];
            return of(
                ids
                    .map((subjectId) => MOCK_SUBJECTS.find((s) => s.subjectId === subjectId))
                    .filter((s): s is Subject => s != null)
                    .map((s) => ({
                        districtId,
                        subjectId: s.subjectId,
                        subjectCode: s.subjectCode,
                        subjectName: s.subjectName,
                        isActive: s.isActive,
                    })),
            );
        }
        const params = new HttpParams().set('districtId', String(districtId));
        return this.http
            .get<ApiResponse<DistrictSubjectDto[]>>(`${this.base}/district-subjects`, { params })
            .pipe(map((r) => r.data ?? []));
    }

    /** PUT /api/district-subjects/sync — replace all subject associations for a district. */
    syncDistrictSubjects(body: DistrictSubjectsRequest): Observable<DistrictSubjectDto[]> {
        if (environment.mockBusinessApis) {
            MOCK_DISTRICT_SUBJECT_IDS.set(body.districtId, [...body.subjectIds]);
            return this.listDistrictSubjects(body.districtId);
        }
        return this.http
            .put<ApiResponse<unknown>>(`${this.base}/district-subjects/sync`, body)
            .pipe(switchMap(() => this.listDistrictSubjects(body.districtId)));
    }

    listCampusGrades(options?: {
        districtId?: number;
        campusId?: number;
        activeOnly?: boolean;
    }): Observable<CampusGradeItemDto[]> {
        if (environment.mockBusinessApis) {
            let rows = mockCampusGradesFor(options?.districtId, options?.campusId);
            if (options?.activeOnly) {
                rows = rows.filter((g) => g.isActive);
            }
            return of(rows);
        }
        if (options?.districtId == null && options?.campusId == null) {
            return of([]);
        }
        let params = new HttpParams().set('activeOnly', String(options?.activeOnly ?? false));
        if (options?.districtId != null) {
            params = params.set('districtId', String(options.districtId));
        }
        if (options?.campusId != null) {
            params = params.set('campusId', String(options.campusId));
        }
        return this.http
            .get<ApiResponse<CampusGradeItemDto[]>>(`${this.base}/campus-grades`, { params })
            .pipe(map((r) => r.data ?? []));
    }

    createCampusGrade(body: CampusGradeRequest): Observable<CampusGradeItemDto> {
        if (environment.mockBusinessApis) {
            const campus = mockCampusesFor(body.districtId).find((c) => c.campusId === body.campusId);
            const grade = MOCK_GRADES.find((g) => g.gradeId === body.gradeId);
            const next: CampusGradeItemDto = {
                campusGradeId: MOCK_CAMPUS_GRADES.length + 1,
                districtId: body.districtId,
                campusId: body.campusId,
                campusCode: campus?.campusCode ?? String(body.campusId),
                campusName: campus?.campusName ?? String(body.campusId),
                gradeId: body.gradeId,
                gradeCode: grade?.gradeCode ?? String(body.gradeId),
                gradeName: grade?.gradeName,
                isActive: body.isActive ?? true,
            };
            MOCK_CAMPUS_GRADES.push(next);
            return of(next);
        }
        return this.http
            .post<ApiResponse<CampusGradeItemDto>>(`${this.base}/campus-grades`, body)
            .pipe(map((r) => r.data as CampusGradeItemDto));
    }

    updateCampusGrade(id: number, body: CampusGradeRequest): Observable<CampusGradeItemDto> {
        if (environment.mockBusinessApis) {
            const idx = MOCK_CAMPUS_GRADES.findIndex((g) => g.campusGradeId === id);
            if (idx >= 0) {
                const campus = mockCampusesFor(body.districtId).find((c) => c.campusId === body.campusId);
                const grade = MOCK_GRADES.find((g) => g.gradeId === body.gradeId);
                MOCK_CAMPUS_GRADES[idx] = {
                    ...MOCK_CAMPUS_GRADES[idx],
                    districtId: body.districtId,
                    campusId: body.campusId,
                    campusCode: campus?.campusCode ?? MOCK_CAMPUS_GRADES[idx].campusCode,
                    campusName: campus?.campusName ?? MOCK_CAMPUS_GRADES[idx].campusName,
                    gradeId: body.gradeId,
                    gradeCode: grade?.gradeCode ?? MOCK_CAMPUS_GRADES[idx].gradeCode,
                    gradeName: grade?.gradeName ?? MOCK_CAMPUS_GRADES[idx].gradeName,
                    isActive: body.isActive ?? MOCK_CAMPUS_GRADES[idx].isActive,
                };
                return of(MOCK_CAMPUS_GRADES[idx]);
            }
            return of(mockCampusGradesFor()[0]);
        }
        return this.http
            .put<ApiResponse<CampusGradeItemDto>>(`${this.base}/campus-grades/${id}`, body)
            .pipe(map((r) => r.data as CampusGradeItemDto));
    }

    /** PUT /api/campus-grades/sync — replace all grade associations for a campus. */
    syncCampusGrades(body: CampusGradesSyncRequest): Observable<CampusGradeItemDto[]> {
        if (environment.mockBusinessApis) {
            const remaining = MOCK_CAMPUS_GRADES.filter(
                (g) => !(g.districtId === body.districtId && g.campusId === body.campusId),
            );
            MOCK_CAMPUS_GRADES.length = 0;
            MOCK_CAMPUS_GRADES.push(...remaining);

            const campus = mockCampusesFor(body.districtId).find((c) => c.campusId === body.campusId);
            let nextId =
                MOCK_CAMPUS_GRADES.reduce((max, g) => Math.max(max, g.campusGradeId), 0) + 1;
            for (const gradeId of body.gradeIds) {
                const grade = MOCK_GRADES.find((g) => g.gradeId === gradeId);
                MOCK_CAMPUS_GRADES.push({
                    campusGradeId: nextId++,
                    districtId: body.districtId,
                    campusId: body.campusId,
                    campusCode: campus?.campusCode ?? String(body.campusId),
                    campusName: campus?.campusName ?? String(body.campusId),
                    gradeId,
                    gradeCode: grade?.gradeCode ?? String(gradeId),
                    gradeName: grade?.gradeName,
                    isActive: true,
                });
            }
            return this.listCampusGrades({
                districtId: body.districtId,
                campusId: body.campusId,
            });
        }
        return this.http
            .put<ApiResponse<unknown>>(`${this.base}/campus-grades/sync`, body)
            .pipe(
                switchMap(() =>
                    this.listCampusGrades({
                        districtId: body.districtId,
                        campusId: body.campusId,
                    }),
                ),
            );
    }
}
