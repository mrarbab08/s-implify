import { CommonModule } from '@angular/common';
import {
    AfterViewInit,
    ChangeDetectorRef,
    Component,
    DestroyRef,
    ElementRef,
    OnDestroy,
    OnInit,
    ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, combineLatest, distinctUntilChanged, forkJoin, of, switchMap } from 'rxjs';
import { DistrictContextService } from '../../../../core/services/district-context.service';
import { GrowthAnalyticsService } from '../../../../core/services/growth-analytics.service';
import {
    computeAveragesFromStudentScores,
    normalizeStandardAveragesRequest,
    normalizeStudentScoresRequest,
    normalizeStudentStandardsScope,
    parseStandardPercent,
    StudentStandardsService,
} from '../../../../core/services/student-standards.service';
import { TeachersService } from '../../../../core/services/teachers.service';
import { AdminSetupsService } from '../../../../core/services/admin-setups.service';
import { areGrowthFiltersEqual } from '../../../../core/models/simplify-api.model';
import type {
    Campus,
    CampusGradeItemDto,
    Grade,
    GrowthOverallMetricsRequest,
    GrowthOverallMetricsResponse,
    StudentStandardsAverageItemDto,
    StudentStandardsStudentScoreDto,
    StudentStandardsStudentScoresRequest,
    Subject,
    TeacherSummaryDto,
} from '../../../../core/models/simplify-api.model';
import type { StandardsMatrixRowVm, StudentCohortRowVm } from './standards-matrix.models';
import { StandardsMatrixComponent } from './standards-matrix.component';
import { SharedModule } from '../../../../shared/shared.module';
import {
    downloadCsv,
    printTable,
    type TableExportColumn,
} from '../../../../core/utils/table-export.util';

@Component({
    selector: 'app-standards-matrix-page',
    templateUrl: './standards-matrix-page.component.html',
    standalone: true,
    imports: [CommonModule, FormsModule, SharedModule, StandardsMatrixComponent],
})
export class StandardsMatrixPageComponent implements OnInit, AfterViewInit, OnDestroy {
    private static readonly PERF_BAR_GROUP_PX = 40;
    /** Fixed category slot (bar + gap). Keeps bar width and spacing constant. */
    private static readonly PERF_BAR_SLOT_PX = 100;
    private static readonly PERF_BAR_CHART_PAD_PX = 72;
    private static readonly PERF_BAR_DEFAULT_CONTAINER_PX = 900;
    filterCampusCode = '';
    filterGradeCode = '';
    filterSubjectCode = '';
    filterTeacherId: number | null = null;

    campuses: Campus[] = [];
    grades: Grade[] = [];
    subjects: Subject[] = [];
    teachers: TeacherSummaryDto[] = [];

    standardsLoading = false;
    standardsError: string | null = null;

    overallMetricsLoading = false;
    overallMetricsError: string | null = null;

    /** KPI strip — POST /growth/overall-metrics (same as main dashboard). */
    kpiComponentScore = '—';
    kpiGrowth = '—';
    kpiApp = '—';
    kpiMeet = '—';
    kpiMaster = '—';
    kpiCsGrade: string | null = null;
    kpiGrowthGrade: string | null = null;

    componentScoreWidth = 0;
    growthWidth = 0;
    appWidth = 0;
    meetWidth = 0;
    masterWidth = 0;

    q1PerformanceChart: any;
    usePerfBarHorizontalScroll = false;
    perfBarScrollWidth = 0;
    cohortRows: StudentCohortRowVm[] = [];
    cohortStaarSortDir: 'neutral' | 'asc' | 'desc' = 'neutral';

    standardCodes: string[] = [];
    matrixRows: StandardsMatrixRowVm[] = [];
    classAveragePercents: number[] = [];

    private perfBarChartPayload: { categories: string[]; averages: number[] } | null = null;
    private perfBarResizeObserver?: ResizeObserver;
    private perfBarContainerWidthPx = 0;
    private lastPerfBarLayoutKey = '';

    @ViewChild('perfBarChartContainer')
    perfBarChartContainer?: ElementRef<HTMLElement>;

    @ViewChild(StandardsMatrixComponent)
    standardsMatrixWidget?: StandardsMatrixComponent;

    constructor(
        readonly districtContext: DistrictContextService,
        private studentStandards: StudentStandardsService,
        private teachersService: TeachersService,
        private adminSetups: AdminSetupsService,
        private growthAnalytics: GrowthAnalyticsService,
        private destroyRef: DestroyRef,
        private cdr: ChangeDetectorRef,
    ) {}

    ngOnInit(): void {
        this.setPerfBarChart([], []);

        this.districtContext
            .initialize()
            .pipe(
                switchMap(() =>
                    combineLatest([
                        this.districtContext.selection$,
                        this.districtContext.growthFilters$,
                    ]).pipe(
                        distinctUntilChanged(
                            ([a, fa], [b, fb]) =>
                                a.districtId === b.districtId &&
                                a.academicYearId === b.academicYearId &&
                                a.quarterCode === b.quarterCode &&
                                areGrowthFiltersEqual(fa, fb) &&
                                fa.specialEducation === fb.specialEducation &&
                                fa.economicDisadvantage === fb.economicDisadvantage &&
                                fa.emergentBilingual === fb.emergentBilingual &&
                                fa.ethnicity === fb.ethnicity &&
                                fa.testLanguage === fb.testLanguage,
                        ),
                        switchMap(() =>
                            forkJoin([
                                this.districtContext.ensureDistrictCampuses(),
                                this.districtContext.ensureSubjectsForSelection(),
                            ]),
                        ),
                    ),
                ),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe(() => {
                this.syncFilterOptions();
                this.loadOverallMetrics();
                this.loadGradesForCampus(this.filterCampusCode, true);
            });
    }

    ngAfterViewInit(): void {
        this.attachPerfBarResizeObserver();
    }

    ngOnDestroy(): void {
        this.perfBarResizeObserver?.disconnect();
    }

    onCampusChange(): void {
        this.filterTeacherId = null;
        this.loadGradesForCampus(this.filterCampusCode, true);
    }

    onFilterChange(): void {
        this.loadTeachers();
        this.loadStandardsData();
        this.loadOverallMetrics();
    }

    get sortedCohortRows(): StudentCohortRowVm[] {
        if (this.cohortStaarSortDir === 'neutral') {
            return this.cohortRows;
        }
        const rows = [...this.cohortRows];
        rows.sort((a, b) =>
            this.cohortStaarSortDir === 'asc'
                ? a.staarScore - b.staarScore
                : b.staarScore - a.staarScore,
        );
        return rows;
    }

    toggleCohortStaarSort(): void {
        this.cohortStaarSortDir =
            this.cohortStaarSortDir === 'neutral'
                ? 'asc'
                : this.cohortStaarSortDir === 'asc'
                  ? 'desc'
                  : 'neutral';
    }

    staarBadgeClass(score: number): string {
        if (score >= 80) {
            return 'bg-success/20 text-success';
        }
        if (score >= 50) {
            return 'bg-warning/20 text-warning';
        }
        return 'bg-danger/20 text-danger';
    }

    teacherDisplayName(t: TeacherSummaryDto): string {
        const name = t.teacherName?.trim();
        if (name) {
            return name;
        }
        return t.teacherId != null ? `Teacher ${t.teacherId}` : 'Teacher';
    }

    /** Numeric teacherId for dropdown binding / comparisons (by-scope returns dbo.Teachers.TeacherId). */
    teacherIdValue(t: TeacherSummaryDto): number | null {
        if (t.teacherId == null || t.teacherId === '') {
            return null;
        }
        const n = Number(t.teacherId);
        return Number.isFinite(n) ? n : null;
    }

    selectedCampusName(): string {
        return (
            this.campuses.find((c) => c.campusCode === this.filterCampusCode)?.campusName ??
            this.filterCampusCode
        );
    }

    selectedTeacherName(): string {
        if (this.filterTeacherId == null) {
            return 'TEACHER (ALL)';
        }
        const t = this.teachers.find((row) => this.teacherIdValue(row) === this.filterTeacherId);
        return t ? this.teacherDisplayName(t) : 'TEACHER (ALL)';
    }

    private loadOverallMetrics(): void {
        const base = this.districtContext.baseGrowthPayload();
        if (!base) {
            this.resetOverallMetrics();
            return;
        }

        const campusCode = this.filterCampusCode?.trim();
        const gradeCode = this.filterGradeCode?.trim();
        const subjectCode = this.filterSubjectCode?.trim();
        const teacherId =
            this.filterTeacherId != null && this.filterTeacherId > 0
                ? this.filterTeacherId
                : undefined;

        // Page Step filters override header growth filters for grade/subject/campus/teacher.
        const body: GrowthOverallMetricsRequest = {
            ...base,
            ...this.districtContext.growthFiltersPayload(),
            ...(campusCode ? { campusCode } : {}),
            ...(gradeCode ? { grade: [gradeCode] } : {}),
            ...(subjectCode ? { subject: [subjectCode] } : {}),
            ...(teacherId != null ? { teacherId } : {}),
        };

        this.overallMetricsLoading = true;
        this.overallMetricsError = null;

        this.growthAnalytics
            .getOverallGrowthMetrics(body)
            .pipe(
                catchError(() => {
                    this.overallMetricsError = 'Could not load growth metrics.';
                    return of(null);
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe((metrics) => {
                this.overallMetricsLoading = false;
                if (metrics) {
                    this.applyOverallMetrics(metrics);
                } else {
                    this.resetOverallMetrics();
                }
                this.cdr.markForCheck();
            });
    }

    /** Maps API `data` to KPI cards: cs → component score, growth, app/meet/master. */
    private applyOverallMetrics(m: GrowthOverallMetricsResponse): void {
        const fmt = (n: number): string =>
            Number.isFinite(n) ? Number(n).toFixed(1) : '—';
        this.kpiComponentScore = fmt(m.cs);
        this.kpiGrowth = fmt(m.growth);
        this.kpiApp = fmt(m.app);
        this.kpiMeet = fmt(m.meet);
        this.kpiMaster = fmt(m.master);
        this.kpiCsGrade = m.csGrade?.trim() || null;
        this.kpiGrowthGrade = m.growthGrade?.trim() || null;
        this.syncMetricBarWidths();
    }

    private resetOverallMetrics(): void {
        this.kpiComponentScore = '—';
        this.kpiGrowth = '—';
        this.kpiApp = '—';
        this.kpiMeet = '—';
        this.kpiMaster = '—';
        this.kpiCsGrade = null;
        this.kpiGrowthGrade = null;
        this.syncMetricBarWidths();
    }

    /** Letter-grade color for KPI displays. */
    gradeLetterClass(grade: string | null | undefined): string {
        const g = (grade ?? '').trim().toUpperCase();
        if (g === 'A') {
            return 'text-emerald-600 dark:text-emerald-400';
        }
        if (g === 'B') {
            return 'text-sky-600 dark:text-sky-400';
        }
        if (g === 'C') {
            return 'text-amber-600 dark:text-amber-400';
        }
        if (g === 'D') {
            return 'text-orange-600 dark:text-orange-400';
        }
        if (g === 'F' || g === 'N') {
            return 'text-red-600 dark:text-red-400';
        }
        return 'text-slate-400 dark:text-slate-500';
    }

    private syncMetricBarWidths(): void {
        const pct = (s: string): number => {
            const n = parseFloat(String(s).replace(/[^\d.-]/g, ''));
            if (!Number.isFinite(n)) {
                return 0;
            }
            return Math.max(0, Math.min(100, n));
        };
        this.componentScoreWidth = pct(this.kpiComponentScore);
        this.growthWidth = pct(this.kpiGrowth);
        this.appWidth = pct(this.kpiApp);
        this.meetWidth = pct(this.kpiMeet);
        this.masterWidth = pct(this.kpiMaster);
    }

    private syncFilterOptions(): void {
        this.campuses = this.districtContext.filterCampusesForActiveRole([
            ...this.districtContext.campuses,
        ]);
        this.subjects = [...this.districtContext.subjects];

        const scopedCampusCode = this.districtContext.roleScopePayload().campusCode;
        if (scopedCampusCode && this.campuses.some((c) => c.campusCode === scopedCampusCode)) {
            this.filterCampusCode = scopedCampusCode;
        } else if (!this.campuses.some((c) => c.campusCode === this.filterCampusCode)) {
            this.filterCampusCode = this.campuses[0]?.campusCode ?? '';
        }
        if (!this.subjects.some((s) => s.subjectCode === this.filterSubjectCode)) {
            this.filterSubjectCode =
                this.districtContext.growthFilters.subjects[0] ??
                this.subjects[0]?.subjectCode ??
                '';
        }
    }

    /** Grades offered at the selected campus (GET /api/campus-grades). */
    private loadGradesForCampus(campusCode: string, reloadStandards = false): void {
        const districtId = this.districtContext.selection.districtId;
        const trimmed = campusCode?.trim();
        if (districtId == null || !trimmed) {
            this.grades = [];
            this.filterGradeCode = '';
            this.teachers = [];
            this.filterTeacherId = null;
            if (reloadStandards) {
                this.loadStandardsData();
                this.loadOverallMetrics();
            }
            this.cdr.markForCheck();
            return;
        }

        const campus = this.campuses.find((c) => c.campusCode === trimmed);
        if (!campus?.campusId) {
            this.grades = [];
            this.filterGradeCode = '';
            this.teachers = [];
            this.filterTeacherId = null;
            if (reloadStandards) {
                this.loadStandardsData();
                this.loadOverallMetrics();
            }
            this.cdr.markForCheck();
            return;
        }

        this.adminSetups
            .listCampusGrades({
                districtId,
                campusId: campus.campusId,
                activeOnly: true,
            })
            .pipe(
                catchError(() => of([] as CampusGradeItemDto[])),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe((rows) => {
                this.grades = rows
                    .map((row) => ({
                        gradeId: row.gradeId,
                        gradeCode: row.gradeCode,
                        gradeName: row.gradeName,
                        isActive: row.isActive,
                    }))
                    .sort((a, b) => this.compareGradeCodes(a.gradeCode, b.gradeCode));

                const preferredGrade = this.districtContext.growthFilters.grades[0];
                if (!this.grades.some((g) => g.gradeCode === this.filterGradeCode)) {
                    this.filterGradeCode =
                        preferredGrade &&
                        this.grades.some((g) => g.gradeCode === preferredGrade)
                            ? preferredGrade
                            : (this.grades[0]?.gradeCode ?? '');
                }

                if (this.isStandardsScopeReady()) {
                    this.loadTeachers();
                } else {
                    this.teachers = [];
                    this.filterTeacherId = null;
                }

                if (reloadStandards) {
                    this.loadStandardsData();
                    this.loadOverallMetrics();
                }
                this.cdr.markForCheck();
            });
    }

    private compareGradeCodes(a: string, b: string): number {
        const na = Number(a);
        const nb = Number(b);
        if (Number.isFinite(na) && Number.isFinite(nb)) {
            return na - nb;
        }
        return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    }

    private isStandardsScopeReady(): boolean {
        return (
            this.districtContext.isGrowthContextReady() &&
            !!this.filterCampusCode?.trim() &&
            !!this.filterGradeCode?.trim() &&
            !!this.filterSubjectCode?.trim()
        );
    }

    /** e.g. "{quarterCode} Performance Standard" from the header quarter selection. */
    get performanceStandardTitle(): string {
        const code = this.districtContext.selection.quarterCode?.trim();
        return code ? `${code} Performance Standard` : 'Performance Standard';
    }

    get canExportCohort(): boolean {
        return !this.standardsLoading && this.cohortRows.length > 0;
    }

    get canExportStandardsMatrix(): boolean {
        return !this.standardsLoading && this.matrixRows.length > 0 && this.standardCodes.length > 0;
    }

    exportCohort(kind: 'excel' | 'print'): void {
        if (!this.canExportCohort) {
            return;
        }
        const cols: TableExportColumn[] = [
            { field: 'studentName', title: 'Student Name' },
            { field: 'campus', title: 'Campus' },
            { field: 'grade', title: 'Grade' },
            { field: 'course', title: 'Course' },
            { field: 'instructor', title: 'Instructor' },
            { field: 'staarScore', title: 'STAAR Score' },
        ];
        const rows = this.sortedCohortRows.map((row) => ({
            studentName: row.studentName,
            campus: row.campus,
            grade: row.grade,
            course: row.course,
            instructor: row.instructor,
            staarScore: `${row.staarScore}%`,
        }));
        const title = `Detailed Student Cohort — ${this.exportFilterContextLabel()}`;
        if (kind === 'excel') {
            downloadCsv(this.exportFilename('student-cohort'), cols, rows);
            return;
        }
        printTable(title, cols, rows);
    }

    exportStandardsMatrix(kind: 'excel' | 'print'): void {
        if (!this.canExportStandardsMatrix) {
            return;
        }
        const cols: TableExportColumn[] = [
            { field: 'studentName', title: 'Student Name' },
            { field: 'percentScore', title: 'Percent Score' },
            ...this.standardCodes.map((code, index) => ({
                field: `standard_${index}`,
                title: code,
            })),
        ];
        const matrixRows = this.standardsMatrixWidget?.sortedMatrixRows ?? this.matrixRows;
        const rows: Record<string, string>[] = matrixRows.map((row) => {
            const out: Record<string, string> = {
                studentName: row.studentName,
                percentScore: `${row.percentScore}%`,
            };
            row.standardPercents.forEach((pct, index) => {
                out[`standard_${index}`] = `${pct}%`;
            });
            return out;
        });
        if (this.classAveragePercents.length) {
            const avgRow: Record<string, string> = {
                studentName: 'Class Average',
                percentScore: '',
            };
            this.classAveragePercents.forEach((pct, index) => {
                avgRow[`standard_${index}`] = `${pct}%`;
            });
            rows.push(avgRow);
        }
        const title = `Standards Matrix — ${this.exportFilterContextLabel()}`;
        if (kind === 'excel') {
            downloadCsv(this.exportFilename('standards-matrix'), cols, rows);
            return;
        }
        printTable(title, cols, rows);
    }

    onExportMenu(target: 'cohort' | 'matrix', kind: 'excel' | 'print'): void {
        if (target === 'cohort') {
            this.exportCohort(kind);
            return;
        }
        this.exportStandardsMatrix(kind);
    }

    private exportFilterContextLabel(): string {
        const campus = this.selectedCampusName() || 'Campus';
        const grade =
            this.grades.find((g) => g.gradeCode === this.filterGradeCode)?.gradeName ??
            this.filterGradeCode ??
            'Grade';
        const subject =
            this.subjects.find((s) => s.subjectCode === this.filterSubjectCode)?.subjectName ??
            this.filterSubjectCode ??
            'Subject';
        const quarter = this.districtContext.selection.quarterCode?.trim();
        return [campus, grade, subject, this.selectedTeacherName(), quarter]
            .filter(Boolean)
            .join(' · ');
    }

    private exportFilename(prefix: string): string {
        const slug = (value: string) =>
            value
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'export';
        return `${prefix}-${slug(this.filterCampusCode)}-${slug(this.filterGradeCode)}-${slug(this.filterSubjectCode)}`;
    }

    private loadTeachers(): void {
        if (!this.isStandardsScopeReady()) {
            this.teachers = [];
            this.filterTeacherId = null;
            return;
        }

        const sel = this.districtContext.selection;
        const districtId = sel.districtId;
        const academicYearId = sel.academicYearId;
        const quarterCode = sel.quarterCode?.trim();
        if (districtId == null || academicYearId == null || !quarterCode) {
            this.teachers = [];
            this.filterTeacherId = null;
            return;
        }

        this.teachersService
            .listTeachersByScope({
                districtId,
                academicYearId,
                campusCode: this.filterCampusCode,
                quarterCode,
                gradeCode: this.filterGradeCode || undefined,
                subjectCode: this.filterSubjectCode || undefined,
            })
            .pipe(
                catchError(() => of([] as TeacherSummaryDto[])),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe((rows) => {
                this.teachers = rows;
                if (
                    this.filterTeacherId != null &&
                    !rows.some((t) => this.teacherIdValue(t) === this.filterTeacherId)
                ) {
                    this.filterTeacherId = null;
                }
                this.cdr.markForCheck();
            });
    }

    private loadStandardsData(): void {
        const scopeBody = this.buildStandardsScopeBody();
        if (!scopeBody) {
            this.standardsError = 'Select district, year, quarter, campus, grade, and subject.';
            this.standardCodes = [];
            this.matrixRows = [];
            this.classAveragePercents = [];
            this.cohortRows = [];
            this.setPerfBarChart([], []);
            return;
        }

        this.standardsLoading = true;
        this.standardsError = null;

        const selectedTeacherId =
            this.filterTeacherId != null && this.filterTeacherId > 0
                ? { teacherId: this.filterTeacherId }
                : {};

        const averagesRequest = normalizeStandardAveragesRequest(
            { ...scopeBody, ...selectedTeacherId },
            this.grades,
            this.subjects,
        );

        const studentScoresRequest = normalizeStudentScoresRequest(
            { ...scopeBody, ...selectedTeacherId },
            this.grades,
            this.subjects,
        );

        forkJoin({
            averages: this.studentStandards.getStandardAverages(averagesRequest).pipe(
                catchError((err) =>
                    of({
                        failed: err?.status === 500,
                        rows: [] as StudentStandardsAverageItemDto[],
                    }),
                ),
            ),
            students: this.studentStandards
                .getStudentScores(studentScoresRequest)
                .pipe(catchError(() => of([] as StudentStandardsStudentScoreDto[]))),
        })
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(({ averages: averagesResult, students }) => {
                this.standardsLoading = false;
                const averagesApiFailed =
                    averagesResult != null &&
                    typeof averagesResult === 'object' &&
                    'failed' in averagesResult &&
                    averagesResult.failed;
                let averages = Array.isArray(averagesResult)
                    ? averagesResult
                    : (averagesResult?.rows ?? []);

                if (!averages.length && students.length) {
                    const codes = this.extractStandardCodes(students);
                    averages = computeAveragesFromStudentScores(students, codes);
                }

                if (averagesApiFailed && students.length) {
                    this.standardsError =
                        'Class averages API is unavailable; showing computed averages from student scores.';
                } else if (!averages.length && !students.length) {
                    this.standardsError =
                        'No standards data for this scope. Upload a student standards sheet for this district, year, quarter, campus, grade, and subject.';
                } else {
                    this.standardsError = null;
                }

                this.standardCodes = averages.map((a) => a.standardCode);
                if (!this.standardCodes.length && students.length) {
                    this.standardCodes = this.extractStandardCodes(students);
                }

                const avgPercents = averages.map((a) => Math.round(a.average));

                this.matrixRows = students.map((student) => ({
                    studentName: student.studentName,
                    percentScore: Math.round(student.score),
                    standardPercents: this.standardCodes.map((code) =>
                        this.readStudentStandardPercent(student, code),
                    ),
                }));
                this.classAveragePercents = avgPercents;

                this.cohortRows = students.map((student) => ({
                    studentName: student.studentName,
                    campus: this.selectedCampusName(),
                    grade: scopeBody.gradeCode,
                    course: scopeBody.subjectCode,
                    instructor: this.selectedTeacherName(),
                    staarScore: Math.round(student.score),
                }));

                this.setPerfBarChart(this.standardCodes, avgPercents);
                this.cdr.markForCheck();
            });
    }

    private buildStandardsScopeBody(): StudentStandardsStudentScoresRequest | null {
        const sel = this.districtContext.selection;
        if (
            sel.districtId == null ||
            sel.academicYearId == null ||
            !sel.quarterCode?.trim() ||
            !this.filterCampusCode?.trim() ||
            !this.filterGradeCode?.trim() ||
            !this.filterSubjectCode?.trim()
        ) {
            return null;
        }
        return normalizeStudentStandardsScope(
            {
                districtId: sel.districtId,
                academicYearId: sel.academicYearId,
                quarterCode: sel.quarterCode,
                campusCode: this.filterCampusCode,
                gradeCode: this.filterGradeCode,
                subjectCode: this.filterSubjectCode,
            },
            this.grades,
            this.subjects,
        );
    }

    private extractStandardCodes(students: StudentStandardsStudentScoreDto[]): string[] {
        const codes = new Set<string>();
        for (const student of students) {
            if (student.standardProperties) {
                Object.keys(student.standardProperties).forEach((k) => codes.add(k));
            }
            for (const key of Object.keys(student)) {
                if (key === 'studentName' || key === 'score' || key === 'standardProperties') {
                    continue;
                }
                codes.add(key);
            }
        }
        return [...codes].sort();
    }

    private readStudentStandardPercent(
        student: StudentStandardsStudentScoreDto,
        code: string,
    ): number {
        const nested = student.standardProperties?.[code];
        if (nested != null) {
            return Math.round(parseStandardPercent(nested));
        }
        const flat = student[code];
        if (typeof flat === 'string' || typeof flat === 'number') {
            return Math.round(parseStandardPercent(flat));
        }
        return 0;
    }

    private setPerfBarChart(categories: string[], averages: number[]): void {
        this.perfBarChartPayload = { categories, averages };
        this.lastPerfBarLayoutKey = '';
        if (!categories.length) {
            this.q1PerformanceChart = null;
            this.usePerfBarHorizontalScroll = false;
            this.perfBarScrollWidth = 0;
            return;
        }
        queueMicrotask(() => {
            this.attachPerfBarResizeObserver();
            this.renderPerfBarChart();
            this.cdr.markForCheck();
        });
    }

    private buildPerfBarLayout(
        n: number,
        containerWidthPx: number,
    ): {
        chartWidth: number | '100%';
        columnWidthPct: number;
        useScroll: boolean;
        scrollWidth: number;
        leftPad: number;
        rightPad: number;
    } {
        const pad = StandardsMatrixPageComponent.PERF_BAR_CHART_PAD_PX;
        const slot = StandardsMatrixPageComponent.PERF_BAR_SLOT_PX;
        const groupPx = StandardsMatrixPageComponent.PERF_BAR_GROUP_PX;
        const container =
            containerWidthPx > 0
                ? containerWidthPx
                : StandardsMatrixPageComponent.PERF_BAR_DEFAULT_CONTAINER_PX;

        const columnWidthPct = Math.round((groupPx * 100) / slot);
        const naturalWidth = pad + Math.max(n, 1) * slot;

        // Too many bars for the panel → fixed-width chart + horizontal scroll.
        if (naturalWidth > container) {
            return {
                chartWidth: naturalWidth,
                columnWidthPct,
                useScroll: true,
                scrollWidth: naturalWidth,
                leftPad: 0,
                rightPad: 0,
            };
        }

        // Full-width chart; pad empty slots so real bars stay centered.
        const fitSlots = Math.max(n, Math.floor(Math.max(container - pad, slot) / slot));
        const extra = Math.max(0, fitSlots - n);
        const leftPad = Math.floor(extra / 2);
        const rightPad = extra - leftPad;

        return {
            chartWidth: '100%',
            columnWidthPct,
            useScroll: false,
            scrollWidth: 0,
            leftPad,
            rightPad,
        };
    }

    private attachPerfBarResizeObserver(): void {
        const el = this.perfBarChartContainer?.nativeElement;
        if (!el || !this.perfBarChartPayload?.categories.length) {
            return;
        }

        this.perfBarResizeObserver?.disconnect();
        this.perfBarResizeObserver = new ResizeObserver((entries) => {
            const w = Math.round(entries[0]?.contentRect.width ?? 0);
            if (w > 0 && Math.abs(w - this.perfBarContainerWidthPx) >= 16) {
                this.perfBarContainerWidthPx = w;
                this.renderPerfBarChart();
            }
        });
        this.perfBarResizeObserver.observe(el);

        const initialW = Math.round(el.getBoundingClientRect().width);
        if (initialW > 0 && initialW !== this.perfBarContainerWidthPx) {
            this.perfBarContainerWidthPx = initialW;
            this.renderPerfBarChart();
        }
    }

    private renderPerfBarChart(): void {
        const payload = this.perfBarChartPayload;
        if (!payload?.categories.length) {
            this.q1PerformanceChart = null;
            return;
        }

        const n = payload.categories.length;
        const layout = this.buildPerfBarLayout(n, this.perfBarContainerWidthPx);
        const layoutKey = `${this.perfBarContainerWidthPx}|${n}|${layout.useScroll}|${layout.leftPad}|${layout.rightPad}|${layout.columnWidthPct}`;
        if (layoutKey === this.lastPerfBarLayoutKey && this.q1PerformanceChart) {
            return;
        }
        this.lastPerfBarLayoutKey = layoutKey;
        this.usePerfBarHorizontalScroll = layout.useScroll;
        this.perfBarScrollWidth = layout.scrollWidth;

        const blankCats = (count: number) => Array.from({ length: count }, () => '');
        const blankVals = (count: number) => Array.from({ length: count }, () => null as number | null);
        const categories = [
            ...blankCats(layout.leftPad),
            ...payload.categories,
            ...blankCats(layout.rightPad),
        ];
        const averages: Array<number | null> = [
            ...blankVals(layout.leftPad),
            ...payload.averages,
            ...blankVals(layout.rightPad),
        ];

        this.q1PerformanceChart = this.buildQ1Chart(
            categories,
            averages,
            layout.chartWidth,
            layout.columnWidthPct,
        );
        this.cdr.markForCheck();
    }

    private buildQ1Chart(
        categories: string[],
        averages: Array<number | null>,
        chartWidth: number | '100%',
        columnWidthPct: number,
    ): any {
        return {
            chart: {
                type: 'bar',
                toolbar: { show: false },
                height: 320,
                width: chartWidth,
                parentHeightOffset: 0,
            },
            colors: ['#004b80'],
            dataLabels: {
                enabled: true,
                formatter: (val: number) =>
                    val == null || !Number.isFinite(val) ? '' : `${Math.round(val)}%`,
                offsetY: -20,
                style: { fontSize: '10px', colors: ['#304758'] },
            },
            plotOptions: {
                bar: {
                    horizontal: false,
                    columnWidth: `${columnWidthPct}%`,
                    dataLabels: { position: 'top' },
                },
            },
            stroke: { show: true, width: 2, colors: ['transparent'] },
            grid: {
                borderColor: '#e2e8f0',
                strokeDashArray: 3,
                padding: { top: 12, right: 12, bottom: 4, left: 12 },
            },
            series: [{ name: 'STANDARD AVERAGE', data: averages }],
            xaxis: {
                categories,
                axisBorder: { show: true },
                axisTicks: { show: true },
                labels: {
                    rotate: categories.filter((c) => !!c).length > 6 ? -25 : 0,
                    rotateAlways: false,
                    style: { fontSize: '10px', fontWeight: 500 },
                    formatter: (val: string) => val || '',
                },
            },
            yaxis: {
                min: 0,
                max: 100,
                tickAmount: 5,
                labels: {
                    formatter: (v: number) => `${v}%`,
                },
            },
            legend: { position: 'top', horizontalAlign: 'right' },
            tooltip: {
                shared: true,
                intersect: false,
                x: {
                    formatter: (val: string) => val || '',
                },
                y: {
                    formatter: (val: number) =>
                        val == null || !Number.isFinite(val) ? '' : `${Math.round(val)}%`,
                },
            },
        };
    }
}
