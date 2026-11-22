import { Injectable, inject } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { AdminSetupsService } from '../../../core/services/admin-setups.service';
import { AuthService } from '../../../core/services/auth.service';
import { DistrictContextService } from '../../../core/services/district-context.service';
import { GrowthAnalyticsService } from '../../../core/services/growth-analytics.service';
import { StudentGrowthRecordsService } from '../../../core/services/student-growth-records.service';
import { StudentMobilityService } from '../../../core/services/student-mobility.service';
import { TeacherAssessmentService } from '../../../core/services/teacher-assessment.service';
import type {
    Campus,
    CampusGradeItemDto,
    CampusGrowthMetricsRequest,
    Grade,
    StudentGrowthRecordResponse,
    TeacherAssessmentRecordResponse,
    TopClassroomsRequest,
} from '../../../core/models/simplify-api.model';
import type {
    ReportData,
    ReportId,
    ReportRow,
    ReportSection,
    ReportStudentOption,
} from '../models/report.models';

/** Honest empty state — used for every report with no data in the current selection. */
export const NO_REPORT_DATA = 'No data for the current selection';
const NO_DATA = 'No data';

interface ReportDefinition {
    id: ReportId;
    title: string;
}

const REPORT_DEFINITIONS: ReportDefinition[] = [
    { id: 'school', title: 'School Report' },
    { id: 'classroom', title: 'Classroom Report' },
    { id: 'grade', title: 'Grade Report' },
    { id: 'students-consolidated', title: 'Students Consolidated Report' },
    { id: 'district-school', title: 'District School Report' },
    { id: 'district-grade', title: 'District Grade Report' },
    { id: 'students-assessment', title: 'Students Assessment Report' },
    { id: 'students-report-card', title: 'Students Report Card' },
    { id: 'students', title: 'Students Reports' },
    { id: 'employee-assessment', title: 'Employee Assessment Report' },
];

/**
 * Read-only data layer for the printable reports.
 *
 * Every value comes from the same services/endpoints the rest of the portal uses.
 * No score is recomputed here — growth metrics are taken from `/growth/*`
 * (including their backend grade letters), student results from
 * `/student-growth-records`, totals from `/student-mobility/quarter-comparison`
 * and T-TESS results from the saved `/teacher-assessment/records`.
 */
@Injectable({ providedIn: 'root' })
export class ReportsService {
    private readonly ctx = inject(DistrictContextService);
    private readonly auth = inject(AuthService);
    private readonly growth = inject(GrowthAnalyticsService);
    private readonly students = inject(StudentGrowthRecordsService);
    private readonly mobility = inject(StudentMobilityService);
    private readonly teacherAssessment = inject(TeacherAssessmentService);
    private readonly adminSetups = inject(AdminSetupsService);

    titleFor(id: ReportId): string {
        return REPORT_DEFINITIONS.find((d) => d.id === id)?.title ?? 'Report';
    }

    /** Rebuilds the selected report from the current shared context. */
    loadReport(id: ReportId, studentKey: string | null = null): Observable<ReportData> {
        if (!this.ctx.isGrowthContextReady()) {
            return of(this.emptyReport(id));
        }
        switch (id) {
            case 'school':
                return this.loadSchool();
            case 'classroom':
                return this.loadClassroom();
            case 'grade':
                return this.loadGrade(true);
            case 'students-consolidated':
                return this.loadStudentsConsolidated();
            case 'district-school':
                return this.loadDistrictSchool();
            case 'district-grade':
                return this.loadGrade(false);
            case 'students-assessment':
                return this.loadStudentsAssessment();
            case 'students-report-card':
                return this.loadStudentReportCard(studentKey);
            case 'students':
                return this.loadStudentRoster();
            case 'employee-assessment':
                return this.loadEmployeeAssessment();
        }
    }

    /** Campus currently in scope: role-pinned campus, or the campus chosen in Search Filters. */
    selectedCampus(): Campus | undefined {
        const scoped = this.auth.scopedCampusId();
        const role = this.ctx.roleScopePayload();
        const id = scoped ?? this.ctx.growthFilters.campusId ?? role.campusId ?? null;
        if (id == null) {
            return undefined;
        }
        const campus = this.ctx.findCampusById(id);
        return campus ? this.ctx.filterCampusesForActiveRole([campus])[0] : undefined;
    }

    // ── 1. School ──────────────────────────────────────────────────────────────

    private loadSchool(): Observable<ReportData> {
        return this.ctx.ensureDistrictCampuses().pipe(
            switchMap(() => {
                const campus = this.selectedCampus();
                const body = campus ? this.reportBody({ campusCode: campus.campusCode }) : null;
                if (!campus || !body) {
                    return of(this.emptyReport('school'));
                }
                return forkJoin({
                    metrics: this.growth.getOverallGrowthMetrics(body).pipe(catchError(() => of(null))),
                    mobility: this.mobility
                        .postQuarterComparison({
                            districtId: body.districtId,
                            academicYearId: body.academicYearId,
                            quarterCode: body.quarterCode,
                            campusCode: campus.campusCode,
                        })
                        .pipe(catchError(() => of(null))),
                }).pipe(
                    map(({ metrics, mobility }) => {
                        const rows: ReportRow[] = [
                            { metric: 'Campus', value: campus.campusName || campus.campusCode },
                            {
                                metric: 'STAAR Component Score',
                                value: this.scored(metrics?.cs, metrics?.csGrade),
                            },
                            { metric: 'Growth', value: this.scored(metrics?.growth, metrics?.growthGrade) },
                            { metric: 'APP', value: this.value(metrics?.app) },
                            { metric: 'MEET', value: this.value(metrics?.meet) },
                            { metric: 'MASTER', value: this.value(metrics?.master) },
                            { metric: 'Total students', value: this.integer(mobility?.totalStudents) },
                        ];
                        const hasData =
                            metrics?.cs != null ||
                            metrics?.growth != null ||
                            metrics?.app != null ||
                            metrics?.meet != null ||
                            metrics?.master != null ||
                            mobility?.totalStudents != null;
                        if (!hasData) {
                            return this.emptyReport('school');
                        }
                        return this.build('school', [
                            {
                                columns: this.columns(['metric', 'Campus / measure'], ['value', 'Value']),
                                rows,
                            },
                        ]);
                    }),
                );
            }),
        );
    }

    // ── 2. Classroom ───────────────────────────────────────────────────────────

    private loadClassroom(): Observable<ReportData> {
        return this.ctx.ensureDistrictCampuses().pipe(
            switchMap(() => {
                const campus = this.selectedCampus();
                const base = this.reportBody();
                if (!base) {
                    return of(this.emptyReport('classroom'));
                }
                const request: TopClassroomsRequest = {
                    districtId: base.districtId,
                    academicYearId: base.academicYearId,
                    quarterCode: base.quarterCode,
                    ...(campus ? { campusCode: campus.campusCode } : {}),
                    ...(base.grade?.length ? { gradeCode: base.grade } : {}),
                    ...(base.subject?.length ? { subjectCode: base.subject } : {}),
                    ...(base.specialEducation !== undefined
                        ? { specialEducation: base.specialEducation }
                        : {}),
                    ...(base.economicDisadvantage !== undefined
                        ? { economicDisadvantage: base.economicDisadvantage }
                        : {}),
                    ...(base.emergentBilingual ? { emergentBilingual: base.emergentBilingual } : {}),
                    ...(base.ethnicity ? { ethnicity: base.ethnicity } : {}),
                    ...(base.testLanguage ? { testLanguage: base.testLanguage } : {}),
                    // All classrooms in scope, not just a leaderboard.
                    top: 1000,
                };
                return this.growth.getTopClassrooms(request).pipe(
                    catchError(() => of([])),
                    map((rooms) => {
                        if (!rooms.length) {
                            return this.emptyReport('classroom');
                        }
                        const rows: ReportRow[] = rooms.map((room) => {
                            const name = [room.firstName, room.lastName]
                                .filter((part) => !!part?.trim())
                                .join(' ')
                                .trim();
                            return {
                                classroom: name || room.teacherIdExternal || NO_DATA,
                                grade: room.grade || NO_DATA,
                                component: this.scored(room.componentScore, this.letter(room.componentScore)),
                                growth: this.scored(room.growth, this.letter(room.growth)),
                            };
                        });
                        return this.build('classroom', [
                            {
                                columns: this.columns(
                                    ['classroom', 'Classroom'],
                                    ['grade', 'Grade'],
                                    ['component', 'Component Score'],
                                    ['growth', 'Growth'],
                                ),
                                rows,
                            },
                        ]);
                    }),
                );
            }),
        );
    }

    // ── 3 & 6. Grade reports (campus / district) ────────────────────────────────

    private loadGrade(campusOnly: boolean): Observable<ReportData> {
        const reportId: ReportId = campusOnly ? 'grade' : 'district-grade';
        return forkJoin([this.ctx.ensureDistrictCampuses(), this.ctx.ensureGrades()]).pipe(
            switchMap(() => {
                const campus = campusOnly ? this.selectedCampus() : undefined;
                if (campusOnly && !campus) {
                    return of(this.emptyReport(reportId));
                }
                const grades$: Observable<Grade[] | CampusGradeItemDto[]> = campus
                    ? this.adminSetups
                          .listCampusGrades({
                              districtId: this.ctx.selection.districtId!,
                              campusId: campus.campusId,
                              activeOnly: true,
                          })
                          .pipe(catchError(() => of<CampusGradeItemDto[]>([])))
                    : of(this.ctx.grades.filter((g) => g.isActive !== false));
                return grades$.pipe(
                    switchMap((grades) => {
                        const body = this.reportBody(campus ? { campusCode: campus.campusCode } : {});
                        if (!body || !grades.length) {
                            return of(this.emptyReport(reportId));
                        }
                        return forkJoin(
                            grades.map((grade) =>
                                this.growth
                                    // The backend applies its own gradeLetter() and agg() rules.
                                    .getOverallGrowthMetrics({ ...body, grade: [grade.gradeCode] })
                                    .pipe(
                                        map((metrics) => ({ grade, metrics })),
                                        catchError(() => of({ grade, metrics: null })),
                                    ),
                            ),
                        ).pipe(
                            map((results) => {
                                const rows: ReportRow[] = [];
                                for (const { grade, metrics } of results) {
                                    if (
                                        metrics?.cs == null &&
                                        metrics?.growth == null &&
                                        metrics?.app == null &&
                                        metrics?.meet == null &&
                                        metrics?.master == null
                                    ) {
                                        continue; // No invented row for a grade without data.
                                    }
                                    rows.push({
                                        grade: grade.gradeName || grade.gradeCode,
                                        component: this.scored(metrics?.cs, metrics?.csGrade),
                                        growth: this.scored(metrics?.growth, metrics?.growthGrade),
                                        app: this.value(metrics?.app),
                                        meet: this.value(metrics?.meet),
                                        master: this.value(metrics?.master),
                                    });
                                }
                                return rows.length
                                    ? this.build(reportId, [
                                          {
                                              columns: this.columns(
                                                  ['grade', 'Grade'],
                                                  ['component', 'Component Score'],
                                                  ['growth', 'Growth'],
                                                  ['app', 'APP'],
                                                  ['meet', 'MEET'],
                                                  ['master', 'MASTER'],
                                              ),
                                              rows,
                                          },
                                      ])
                                    : this.emptyReport(reportId);
                            }),
                        );
                    }),
                );
            }),
        );
    }

    // ── 4. Students consolidated ───────────────────────────────────────────────

    private loadStudentsConsolidated(): Observable<ReportData> {
        const id: ReportId = 'students-consolidated';
        return this.ctx.ensureDistrictCampuses().pipe(
            switchMap(() =>
                this.allStudentRecords(this.selectedCampus()?.campusCode).pipe(
                    map((records) => {
                        if (!records.length) {
                            return this.emptyReport(id);
                        }
                        const rows: ReportRow[] = records.map((r) => ({
                            student: r.studentName || NO_DATA,
                            campus: this.campusName(r.campusCode),
                            grade: r.gradeCode || NO_DATA,
                            classroom: r.teacherName || NO_DATA,
                            subject: r.subjectCode || NO_DATA,
                            component: this.value(r.cs),
                            growth: this.value(r.growth),
                            app: this.value(r.app),
                            meet: this.value(r.meets),
                            master: this.value(r.masters),
                            staar: this.value(r.staar),
                        }));
                        return this.build(id, [
                            {
                                columns: this.columns(
                                    ['student', 'Student'],
                                    ['campus', 'Campus'],
                                    ['grade', 'Grade'],
                                    ['classroom', 'Classroom'],
                                    ['subject', 'Subject'],
                                    ['component', 'Component'],
                                    ['growth', 'Growth'],
                                    ['app', 'APP'],
                                    ['meet', 'MEET'],
                                    ['master', 'MASTER'],
                                    ['staar', 'STAAR'],
                                ),
                                rows,
                            },
                        ]);
                    }),
                ),
            ),
        );
    }

    // ── 5. District → School ───────────────────────────────────────────────────

    private loadDistrictSchool(): Observable<ReportData> {
        const id: ReportId = 'district-school';
        return this.ctx.ensureDistrictCampuses().pipe(
            switchMap(() => {
                const campuses = this.ctx.filterCampusesForActiveRole(this.ctx.campuses);
                if (!campuses.length) {
                    return of(this.emptyReport(id));
                }
                return forkJoin(
                    campuses.map((campus) => {
                        const body = this.reportBody({ campusCode: campus.campusCode });
                        return forkJoin({
                            metrics: body
                                ? this.growth.getOverallGrowthMetrics(body).pipe(catchError(() => of(null)))
                                : of(null),
                            mobility: body
                                ? this.mobility
                                      .postQuarterComparison({
                                          districtId: body.districtId,
                                          academicYearId: body.academicYearId,
                                          quarterCode: body.quarterCode,
                                          campusCode: campus.campusCode,
                                      })
                                      .pipe(catchError(() => of(null)))
                                : of(null),
                        }).pipe(map((result) => ({ campus, ...result })));
                    }),
                ).pipe(
                    map((results) => {
                        const rows: ReportRow[] = results.map(({ campus, metrics, mobility }) => ({
                            campus: campus.campusName || campus.campusCode,
                            component: this.scored(metrics?.cs, metrics?.csGrade),
                            growth: this.scored(metrics?.growth, metrics?.growthGrade),
                            app: this.value(metrics?.app),
                            meet: this.value(metrics?.meet),
                            master: this.value(metrics?.master),
                            totalStudents: this.integer(mobility?.totalStudents),
                        }));
                        const hasData = rows.some(
                            (row) =>
                                row['component'] !== NO_DATA ||
                                row['growth'] !== NO_DATA ||
                                row['app'] !== NO_DATA ||
                                row['meet'] !== NO_DATA ||
                                row['master'] !== NO_DATA ||
                                row['totalStudents'] !== NO_DATA,
                        );
                        if (!hasData) {
                            return this.emptyReport(id);
                        }
                        return this.build(id, [
                            {
                                columns: this.columns(
                                    ['campus', 'Campus'],
                                    ['component', 'Component Score'],
                                    ['growth', 'Growth'],
                                    ['app', 'APP'],
                                    ['meet', 'MEET'],
                                    ['master', 'MASTER'],
                                    ['totalStudents', 'Total students'],
                                ),
                                rows,
                            },
                        ]);
                    }),
                );
            }),
        );
    }

    // ── 7. Students assessment report ──────────────────────────────────────────

    private loadStudentsAssessment(): Observable<ReportData> {
        const id: ReportId = 'students-assessment';
        return this.ctx.ensureDistrictCampuses().pipe(
            switchMap(() =>
                this.allStudentRecords(this.selectedCampus()?.campusCode).pipe(
                    map((records) => {
                        if (!records.length) {
                            return this.emptyReport(id);
                        }
                        const rows: ReportRow[] = records.map((r) => ({
                            student: r.studentName || NO_DATA,
                            campus: this.campusName(r.campusCode),
                            grade: r.gradeCode || NO_DATA,
                            classroom: r.teacherName || NO_DATA,
                            subject: r.subjectCode || NO_DATA,
                            component: this.value(r.cs),
                            growth: this.value(r.growth),
                            app: this.value(r.app),
                            meet: this.value(r.meets),
                            master: this.value(r.masters),
                        }));
                        return this.build(id, [
                            {
                                columns: this.columns(
                                    ['student', 'Student'],
                                    ['campus', 'Campus'],
                                    ['grade', 'Grade'],
                                    ['classroom', 'Classroom'],
                                    ['subject', 'Subject'],
                                    ['component', 'Component'],
                                    ['growth', 'Growth'],
                                    ['app', 'APP'],
                                    ['meet', 'MEET'],
                                    ['master', 'MASTER'],
                                ),
                                rows,
                            },
                        ]);
                    }),
                ),
            ),
        );
    }

    // ── 8. Students report card ────────────────────────────────────────────────

    private loadStudentReportCard(studentKey: string | null): Observable<ReportData> {
        const id: ReportId = 'students-report-card';
        return this.ctx.ensureDistrictCampuses().pipe(
            switchMap(() =>
                this.allStudentRecords(this.selectedCampus()?.campusCode).pipe(
                    map((records) => {
                        const studentOptions = this.studentOptions(records);
                        if (!studentKey) {
                            const data = this.build(id, []);
                            data.studentOptions = studentOptions;
                            data.emptyMessage = studentOptions.length
                                ? 'Select a student to view the report card.'
                                : NO_REPORT_DATA;
                            if (!studentOptions.length) {
                                data.sections = [this.messageSection()];
                            }
                            return data;
                        }
                        const own = records.filter((r) => this.studentRecordKey(r) === studentKey);
                        if (!own.length) {
                            const data = this.emptyReport(id);
                            data.studentOptions = studentOptions;
                            return data;
                        }
                        const first = own[0];
                        const details: ReportRow[] = [
                            { field: 'Student', value: first.studentName || NO_DATA },
                            { field: 'Campus', value: this.campusName(first.campusCode) },
                            { field: 'Grade', value: first.gradeCode || NO_DATA },
                            { field: 'Classroom', value: first.teacherName || NO_DATA },
                        ];
                        const results: ReportRow[] = own.map((r) => ({
                            subject: r.subjectCode || NO_DATA,
                            component: this.value(r.cs),
                            growth: this.value(r.growth),
                            app: this.value(r.app),
                            meet: this.value(r.meets),
                            master: this.value(r.masters),
                            staar: this.value(r.staar),
                            quarterScore: this.value(r.quarterScore),
                        }));
                        const data = this.build(id, [
                            {
                                title: 'Student details',
                                columns: this.columns(['field', 'Field'], ['value', 'Value']),
                                rows: details,
                            },
                            {
                                title: 'Assessment results',
                                columns: this.columns(
                                    ['subject', 'Subject'],
                                    ['component', 'Component'],
                                    ['growth', 'Growth'],
                                    ['app', 'APP'],
                                    ['meet', 'MEET'],
                                    ['master', 'MASTER'],
                                    ['staar', 'STAAR'],
                                    ['quarterScore', 'Quarter score'],
                                ),
                                rows: results,
                            },
                        ]);
                        data.studentOptions = studentOptions;
                        return data;
                    }),
                ),
            ),
        );
    }

    // ── 9. Students reports (roster) ───────────────────────────────────────────

    private loadStudentRoster(): Observable<ReportData> {
        const id: ReportId = 'students';
        return this.ctx.ensureDistrictCampuses().pipe(
            switchMap(() =>
                this.allStudentRecords(this.selectedCampus()?.campusCode).pipe(
                    map((records) => {
                        const rows = this.studentOptions(records).map((student) => {
                            const r = records.find((row) => this.studentRecordKey(row) === student.key)!;
                            return {
                                student: student.label,
                                campus: this.campusName(r.campusCode),
                                grade: r.gradeCode || NO_DATA,
                                classroom: r.teacherName || NO_DATA,
                            };
                        });
                        if (!rows.length) {
                            return this.emptyReport(id);
                        }
                        return this.build(id, [
                            {
                                columns: this.columns(
                                    ['student', 'Student'],
                                    ['campus', 'Campus'],
                                    ['grade', 'Grade'],
                                    ['classroom', 'Classroom'],
                                ),
                                rows,
                            },
                        ]);
                    }),
                ),
            ),
        );
    }

    // ── 10. Employee assessment report ─────────────────────────────────────────

    private loadEmployeeAssessment(): Observable<ReportData> {
        const id: ReportId = 'employee-assessment';
        const selection = this.ctx.selection;
        if (!this.auth.canAccessTtess()) {
            return of(this.emptyReport(id));
        }
        if (selection.districtId == null || selection.academicYearId == null) {
            return of(this.emptyReport(id));
        }
        return this.ctx.ensureDistrictCampuses().pipe(
            switchMap(() =>
                this.teacherAssessment
                    .listAllRecords({
                        districtId: selection.districtId!,
                        academicYearId: selection.academicYearId!,
                    })
                    .pipe(
                        catchError(() =>
                            of({
                                records: [] as TeacherAssessmentRecordResponse[],
                                totalCount: 0,
                                growthQuarterCode: undefined as string | undefined,
                            }),
                        ),
                        map((result) => {
                            const campus = this.selectedCampus();
                            const records = campus
                                ? result.records.filter(
                                      (r) =>
                                          (r.campusCode || '').trim().toUpperCase() ===
                                          campus.campusCode.trim().toUpperCase(),
                                  )
                                : result.records;
                            if (!records.length) {
                                return this.emptyReport(id);
                            }
                            const rows: ReportRow[] = records.map((r) => {
                                const score = r.averageScore;
                                return {
                                    teacher: this.teacherName(r),
                                    campus: this.campusName(r.campusCode),
                                    date: r.evaluationDate || NO_DATA,
                                    window: result.growthQuarterCode || selection.quarterCode || NO_DATA,
                                    score: this.value(score),
                                    band: score == null ? 'No assessment' : this.scoreBand(score),
                                };
                            });
                            return this.build(id, [
                                {
                                    columns: this.columns(
                                        ['teacher', 'Teacher'],
                                        ['campus', 'Campus'],
                                        ['date', 'Assessment date'],
                                        ['window', 'Window'],
                                        ['score', 'Overall score'],
                                        ['band', 'Band'],
                                    ),
                                    rows,
                                },
                            ]);
                        }),
                    ),
            ),
        );
    }

    // ── shared helpers ─────────────────────────────────────────────────────────

    /** Current dashboard growth body (base selection + active search filters). */
    private reportBody(
        extra: Partial<CampusGrowthMetricsRequest> = {},
    ): CampusGrowthMetricsRequest | null {
        const base = this.ctx.baseGrowthPayload();
        return base ? { ...base, ...this.ctx.growthFiltersPayload(), ...extra } : null;
    }

    /** Every student record in the current selection, paged through the existing API. */
    private allStudentRecords(
        campusCode?: string | null,
    ): Observable<StudentGrowthRecordResponse[]> {
        const base = this.ctx.baseGrowthPayload();
        if (!base) {
            return of([]);
        }
        const pageSize = 500;
        const fetchPage = (offset: number): Observable<StudentGrowthRecordResponse[]> =>
            this.students
                .listRecords({
                    districtId: base.districtId,
                    academicYearId: base.academicYearId,
                    quarterCode: base.quarterCode,
                    offset,
                    limit: pageSize,
                    campusCode: campusCode?.trim() || undefined,
                })
                .pipe(
                    switchMap((page) => {
                        const rows = page.records ?? [];
                        if (rows.length < pageSize || rows.length >= (page.totalCount ?? 0)) {
                            return of(rows);
                        }
                        return fetchPage(offset + pageSize).pipe(map((next) => [...rows, ...next]));
                    }),
                    catchError(() => of<StudentGrowthRecordResponse[]>([])),
                );
        return fetchPage(0);
    }

    private studentOptions(records: StudentGrowthRecordResponse[]): ReportStudentOption[] {
        const seen = new Map<string, ReportStudentOption>();
        for (const r of records) {
            const key = this.studentRecordKey(r);
            if (!seen.has(key)) {
                const name = r.studentName?.trim() || NO_DATA;
                seen.set(key, {
                    key,
                    label: r.localId?.trim() ? `${name} (${r.localId.trim()})` : name,
                });
            }
        }
        return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
    }

    private studentRecordKey(r: StudentGrowthRecordResponse): string {
        return `${r.localId || ''}|${r.studentName || ''}|${r.campusCode || ''}`;
    }

    private teacherName(r: TeacherAssessmentRecordResponse): string {
        return (
            [r.teacherFirstName, r.teacherLastName].filter((part) => !!part?.trim()).join(' ').trim() ||
            r.teacherIdExternal ||
            NO_DATA
        );
    }

    private campusName(code?: string | null): string {
        const key = (code || '').trim().toUpperCase();
        return (
            this.ctx.campuses.find((c) => c.campusCode.trim().toUpperCase() === key)?.campusName ||
            code?.trim() ||
            NO_DATA
        );
    }

    /** Mirrors util.js gradeLetter() in the backend (display only, no score calculation). */
    private letter(score: number | null | undefined): string | null {
        if (score == null || !Number.isFinite(Number(score))) {
            return null;
        }
        const value = Number(score);
        if (value >= 90) return 'A';
        if (value >= 80) return 'B';
        if (value >= 70) return 'C';
        if (value >= 60) return 'D';
        return 'F';
    }

    /** Mirrors the T-TESS bands used by the backend stats endpoint. */
    private scoreBand(score: number): string {
        if (score <= 63) return 'Needs Improvement';
        if (score <= 74) return 'Progressing';
        return 'Proficient';
    }

    private value(score: number | null | undefined): string {
        if (score == null || !Number.isFinite(Number(score))) {
            return NO_DATA;
        }
        return Number(score).toFixed(1);
    }

    /** Student counts are whole numbers — never shown with a fabricated decimal. */
    private integer(value: number | null | undefined): string {
        if (value == null || !Number.isFinite(Number(value))) {
            return NO_DATA;
        }
        return String(Math.round(Number(value)));
    }

    private scored(score: number | null | undefined, grade?: string | null): string {
        if (score == null || !Number.isFinite(Number(score))) {
            return NO_DATA;
        }
        const text = Number(score).toFixed(1);
        return grade?.trim() ? `${text} (${grade.trim()})` : text;
    }

    private columns(...pairs: Array<[string, string]>) {
        return pairs.map(([field, title]) => ({ field, title }));
    }

    private build(id: ReportId, sections: ReportSection[]): ReportData {
        return { title: this.titleFor(id), sections };
    }

    private emptyReport(id: ReportId): ReportData {
        const data = this.build(id, [this.messageSection()]);
        data.emptyMessage = NO_REPORT_DATA;
        return data;
    }

    private messageSection(): ReportSection {
        return {
            columns: this.columns(['message', 'Message']),
            rows: [{ message: NO_REPORT_DATA }],
        };
    }
}
