import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { NgxCustomModalComponent } from 'ngx-custom-modal';
import { Subject, forkJoin, of } from 'rxjs';
import { map as rxMap, catchError, distinctUntilChanged, finalize, startWith, switchMap, tap } from 'rxjs/operators';
import { DistrictContextService } from '../../../../core/services/district-context.service';
import { TeacherAssessmentService } from '../../../../core/services/teacher-assessment.service';
import { TeachersService } from '../../../../core/services/teachers.service';
import { AuthService } from '../../../../core/services/auth.service';
import { downloadCsv, printTable } from '../../../../core/utils/table-export.util';
import { scoreBandRowClass } from '../../../../core/utils/score-band-row-class.util';
import type {
    Campus,
    District,
    DistrictContextSelection,
    Subject as SubjectOption,
    TeacherAssessmentRecordResponse,
    TeacherAssessmentRecordsQuery,
    TeacherSummaryDto,
    TtessNewAssessmentPayload,
    TtessRubric,
    TtessRubricDomain,
    TtessRubricOption,
    TtessSavedAssessmentResponse,
    TtessTeacherLatestResponse,
} from '../../../../core/models/simplify-api.model';
import { FiltersService } from '../../../../core/services/filters.service';
import { SharedModule } from '../../../../shared/shared.module';
import type {
    ApexChart,
    ApexDataLabels,
    ApexLegend,
    ApexPlotOptions,
    ApexTooltip,
    ApexXAxis,
    ApexYAxis,
} from 'ng-apexcharts';

/** Filters sent to GET /teacher-assessment/records. */
export interface TtessFilters {
    gradeCode: string | null;
    subjectCode: string | null;
    averageScoreMin: number | null;
    averageScoreMax: number | null;
}

const EMPTY_TTESS_FILTERS: TtessFilters = {
    gradeCode: null,
    subjectCode: null,
    averageScoreMin: null,
    averageScoreMax: null,
};

/** T-TESS average-score bands (match the table row accents: ≤63 red, 64–74 yellow, >74 green). */
export interface TtessScoreBandCounts {
    /** Average ≤ 63 */
    needsImprovement: number;
    /** 64 ≤ average ≤ 74 */
    progressing: number;
    /** Average > 74 */
    proficient: number;
}

export interface TtessGroupAverage {
    label: string;
    avg: number | null;
    count: number;
}

/** Aggregates computed from every record matching the current filters (never the page slice). */
export interface TtessStats {
    teacherCount: number;
    scoredCount: number;
    avgScore: number | null;
    avgGrowth: number | null;
    /** Share of scored teachers above 74, in percent. */
    proficientPct: number | null;
    bands: TtessScoreBandCounts;
    byGrade: TtessGroupAverage[];
    byCampus: TtessGroupAverage[];
}

/** One selectable T-TESS rating level. */
interface TtessRatingLevel {
    value: number;
    label: string;
}

/** The 5-level T-TESS rating scale (rendered as selectable pills). */
const TTESS_RATING_SCALE: TtessRatingLevel[] = [
    { value: 1, label: 'Improvement Needed' },
    { value: 2, label: 'Developing' },
    { value: 3, label: 'Proficient' },
    { value: 4, label: 'Accomplished' },
    { value: 5, label: 'Distinguished' },
];

/** One T-TESS rubric dimension (code + label + owning domain). */
export interface TtessDimension {
    code: string;
    label: string;
    domain: number;
}

/** The 16 T-TESS dimensions across the 4 domains, in official order. */
const TTESS_DIMENSIONS: TtessDimension[] = [
    // Domain 1 — Planning
    { code: '1.1', label: 'Standards and Alignment', domain: 1 },
    { code: '1.2', label: 'Data and Assessment', domain: 1 },
    { code: '1.3', label: 'Knowledge of Students', domain: 1 },
    { code: '1.4', label: 'Activities', domain: 1 },
    // Domain 2 — Instruction
    { code: '2.1', label: 'Achieving Expectations', domain: 2 },
    { code: '2.2', label: 'Content Knowledge and Expertise', domain: 2 },
    { code: '2.3', label: 'Communication', domain: 2 },
    { code: '2.4', label: 'Differentiation', domain: 2 },
    { code: '2.5', label: 'Monitor and Adjust', domain: 2 },
    // Domain 3 — Learning Environment
    { code: '3.1', label: 'Classroom Environment, Routines and Procedures', domain: 3 },
    { code: '3.2', label: 'Managing Student Behavior', domain: 3 },
    { code: '3.3', label: 'Classroom Culture', domain: 3 },
    // Domain 4 — Professional Practices and Responsibilities
    { code: '4.1', label: 'Professional Demeanor and Ethics', domain: 4 },
    { code: '4.2', label: 'Goal Setting', domain: 4 },
    { code: '4.3', label: 'Professional Development', domain: 4 },
    { code: '4.4', label: 'School Community Involvement', domain: 4 },
];

/** Domain display names keyed by domain number. */
const TTESS_DOMAIN_NAMES: Record<number, string> = {
    1: 'Domain 1 — Planning',
    2: 'Domain 2 — Instruction',
    3: 'Domain 3 — Learning Environment',
    4: 'Domain 4 — Professional Practices and Responsibilities',
};

/** T-TESS band label for a 0–100 score — same thresholds as the page legend. */
function ttessBandLabel(score: number): string {
    if (score <= 63) {
        return 'Needs Improvement';
    }
    if (score <= 74) {
        return 'Progressing';
    }
    return 'Proficient';
}

/** Row shape for ng-datatable on the T-TESS screen. */
export interface TtessTeacherRow {
    staffFirstName: string;
    staffLastName: string;
    subject: string;
    gradeLevel: string;
    appraiserFirstName: string;
    appraiserLastName: string;
    walkthrough1: number | null;
    walkthrough2: number | null;
    walkthrough3: number | null;
    walkthrough4: number | null;
    observation1: number | null;
    observation2: number | null;
    average: number | null;
    growth: number | null;
}

@Component({
    selector: 'app-t-tess-page',
    templateUrl: './t-tess-page.component.html',
    standalone: true,
    imports: [CommonModule, FormsModule, SharedModule],
})
export class TtessPageComponent implements OnInit {
    /** One API page = one screen of rows (matches table density). */
    serverPageSize = 10;
    readonly pageSizeOptions = [10, 20, 50, 100];

    rows: TtessTeacherRow[] = [];
    totalCount = 0;
    growthQuarterCode: string | null = null;
    loading = false;
    exportBusy = false;
    exportError: string | null = null;
    loadError: string | null = null;
    filterError: string | null = null;
    filterOptionsLoading = false;
    filterSubjects: SubjectOption[] = [];
    filtersDraft: TtessFilters = { ...EMPTY_TTESS_FILTERS };
    appliedFilters: TtessFilters = { ...EMPTY_TTESS_FILTERS };
    /** Bound to average min/max number inputs; ngModel may yield number or empty string. */
    averageScoreMinInput: number | string | null = null;
    averageScoreMaxInput: number | string | null = null;
    /** Client-side filter for visible table rows. */
    tableSearch = '';
    /** 0-based offset sent to GET /teacher-assessment/records. */
    currentOffset = 0;

    cols: Array<{
        field: keyof TtessTeacherRow;
        title: string;
        hide?: boolean;
        type?: string;
    }> = [
        { field: 'staffFirstName', title: 'Staff First Name' },
        { field: 'staffLastName', title: 'Staff Last Name' },
        { field: 'subject', title: 'Subject' },
        { field: 'gradeLevel', title: 'Grade Level' },
        { field: 'appraiserFirstName', title: 'Appraiser First Name' },
        { field: 'appraiserLastName', title: 'Appraiser Last Name' },
        { field: 'walkthrough1', title: 'Walkthrough 1', type: 'number' },
        { field: 'walkthrough2', title: 'Walkthrough 2', type: 'number' },
        { field: 'walkthrough3', title: 'Walkthrough 3', type: 'number' },
        { field: 'walkthrough4', title: 'Observation 1', type: 'number' },
        { field: 'observation1', title: 'Observation 2', type: 'number' },
        { field: 'observation2', title: 'Summative', type: 'number' },
        { field: 'average', title: 'Average', type: 'number' },
        { field: 'growth', title: 'Growth', type: 'number' },
    ];

    /** Row accent by average score band (≤63 red, 64–74 yellow, >74 green). */
    readonly averageRowClass = (row: TtessTeacherRow): string => scoreBandRowClass(row.average);

    private readonly pageRequest$ = new Subject<number>();
    /** Re-computes the graphical summary when the selection or applied filters change. */
    private readonly statsRequest$ = new Subject<void>();

    /** Aggregates behind the graphical summary (null = nothing to chart yet). */
    tessStats: TtessStats | null = null;
    statsLoading = false;
    bandChartOptions: any | null = null;
    gradeChartOptions: any | null = null;
    campusChartOptions: any | null = null;

    constructor(
        readonly districtContext: DistrictContextService,
        private filters: FiltersService,
        private teacherAssessment: TeacherAssessmentService,
        private teachersService: TeachersService,
        private auth: AuthService,
        private destroyRef: DestroyRef,
        private cdr: ChangeDetectorRef,
    ) {}

    ngOnInit(): void {
        this.districtContext.selection$
            .pipe(
                distinctUntilChanged(
                    (a, b) =>
                        a.districtId === b.districtId &&
                        Number(a.academicYearId) === Number(b.academicYearId),
                ),
                tap((selection) => {
                    this.currentOffset = 0;
                    this.tableSearch = '';
                    this.resetFilters();
                    if (selection.districtId == null || selection.academicYearId == null) {
                        this.resetRows();
                    }
                }),
                switchMap((selection) => {
                    if (selection.districtId == null || selection.academicYearId == null) {
                        return of(null);
                    }
                    this.loadFilterOptions();
                    return this.pageRequest$.pipe(
                        startWith(0),
                        switchMap((offset) => {
                            const query = this.buildRecordsQueryForSelection(selection, offset);
                            if (!query) {
                                this.resetRows();
                                return of(null);
                            }
                            this.loading = true;
                            this.loadError = null;
                            this.currentOffset = offset;
                            this.cdr.markForCheck();
                            return this.teacherAssessment.listRecords(query).pipe(
                                catchError(() => {
                                    this.loadError = 'Could not load teacher assessment records.';
                                    return of(null);
                                }),
                                finalize(() => {
                                    this.loading = false;
                                    this.cdr.markForCheck();
                                }),
                            );
                        }),
                    );
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe((page) => {
                if (!page) {
                    if (this.loadError) {
                        this.rows = [];
                        this.totalCount = 0;
                    }
                    return;
                }
                this.rows = page.records.map((r) => this.mapRecordToRow(r));
                this.totalCount = page.totalCount;
                this.growthQuarterCode = page.growthQuarterCode ?? null;
                this.cdr.markForCheck();
            });

        /**
         * Graphical summary: recomputed whenever the district/year changes or the
         * filters are re-applied. Aggregated from every matching record (same query
         * the export uses), never just the visible page slice.
         */
        this.districtContext.selection$
            .pipe(
                distinctUntilChanged(
                    (a, b) =>
                        a.districtId === b.districtId &&
                        Number(a.academicYearId) === Number(b.academicYearId),
                ),
                tap(() => {
                    this.tessStats = null;
                    this.bandChartOptions = null;
                    this.gradeChartOptions = null;
                    this.campusChartOptions = null;
                }),
                switchMap((selection) =>
                    this.statsRequest$.pipe(
                        startWith(null as void | null),
                        switchMap(() => this.loadStats(selection)),
                    ),
                ),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe((stats) => {
                this.tessStats = stats;
                this.bandChartOptions = stats ? this.buildBandChartOptions(stats) : null;
                this.gradeChartOptions = stats ? this.buildGroupChartOptions(stats.byGrade, 'Average score by grade') : null;
                this.campusChartOptions = stats ? this.buildGroupChartOptions(stats.byCampus, 'Average score by campus') : null;
                this.cdr.markForCheck();
            });
    }

    get hasActiveFilters(): boolean {
        const f = this.appliedFilters;
        return (
            f.gradeCode != null ||
            f.subjectCode != null ||
            f.averageScoreMin != null ||
            f.averageScoreMax != null
        );
    }

    get canClearFilters(): boolean {
        return (
            this.hasActiveFilters ||
            this.filtersDraft.gradeCode != null ||
            this.filtersDraft.subjectCode != null ||
            this.hasAverageDraftInput(this.averageScoreMinInput) ||
            this.hasAverageDraftInput(this.averageScoreMaxInput)
        );
    }

    get activeFilterChips(): Array<{ id: 'grade' | 'subject' | 'average'; label: string }> {
        const chips: Array<{ id: 'grade' | 'subject' | 'average'; label: string }> = [];
        const f = this.appliedFilters;

        if (f.gradeCode) {
            const grade = this.districtContext.grades.find((g) => g.gradeCode === f.gradeCode);
            chips.push({
                id: 'grade',
                label: `Grade: ${grade?.gradeName || grade?.gradeCode || f.gradeCode}`,
            });
        }

        if (f.subjectCode) {
            const subject = this.filterSubjects.find((s) => s.subjectCode === f.subjectCode);
            chips.push({
                id: 'subject',
                label: `Subject: ${subject?.subjectName || subject?.subjectCode || f.subjectCode}`,
            });
        }

        if (f.averageScoreMin != null || f.averageScoreMax != null) {
            let range = 'Average: ';
            if (f.averageScoreMin != null && f.averageScoreMax != null) {
                range += `${f.averageScoreMin} – ${f.averageScoreMax}`;
            } else if (f.averageScoreMin != null) {
                range += `≥ ${f.averageScoreMin}`;
            } else {
                range += `≤ ${f.averageScoreMax}`;
            }
            chips.push({ id: 'average', label: range });
        }

        return chips;
    }

    removeFilterChip(id: 'grade' | 'subject' | 'average'): void {
        if (id === 'grade') {
            this.filtersDraft.gradeCode = null;
        } else if (id === 'subject') {
            this.filtersDraft.subjectCode = null;
        } else {
            this.averageScoreMinInput = null;
            this.averageScoreMaxInput = null;
        }
        this.applyFilters();
    }

    applyFilters(): void {
        this.filterError = null;
        const averageScoreMin = this.parseAverageInput(this.averageScoreMinInput);
        const averageScoreMax = this.parseAverageInput(this.averageScoreMaxInput);
        if (this.hasAverageDraftInput(this.averageScoreMinInput) && averageScoreMin == null) {
            this.filterError = 'Enter a valid minimum average score.';
            this.cdr.markForCheck();
            return;
        }
        if (this.hasAverageDraftInput(this.averageScoreMaxInput) && averageScoreMax == null) {
            this.filterError = 'Enter a valid maximum average score.';
            this.cdr.markForCheck();
            return;
        }
        if (
            averageScoreMin != null &&
            averageScoreMax != null &&
            averageScoreMin > averageScoreMax
        ) {
            this.filterError = 'Minimum average score cannot exceed maximum.';
            this.cdr.markForCheck();
            return;
        }
        this.filtersDraft = {
            gradeCode: this.filtersDraft.gradeCode,
            subjectCode: this.filtersDraft.subjectCode,
            averageScoreMin,
            averageScoreMax,
        };
        this.appliedFilters = { ...this.filtersDraft };
        this.requestPage(0);
        this.statsRequest$.next();
    }

    clearFilters(): void {
        this.filterError = null;
        this.filtersDraft = { ...EMPTY_TTESS_FILTERS };
        this.appliedFilters = { ...EMPTY_TTESS_FILTERS };
        this.averageScoreMinInput = null;
        this.averageScoreMaxInput = null;
        if (this.districtContext.isAttendanceContextReady()) {
            this.requestPage(0);
            this.statsRequest$.next();
        }
        this.cdr.markForCheck();
    }

    private loadFilterOptions(): void {
        const districtId = this.districtContext.selection.districtId;
        if (districtId == null) {
            this.filterSubjects = [];
            return;
        }
        this.filterOptionsLoading = true;
        this.cdr.markForCheck();
        forkJoin([
            this.districtContext.ensureGrades(),
            this.filters.listSubjects({ activeOnly: false }).pipe(
                catchError(() => of<SubjectOption[]>([])),
            ),
        ])
            .pipe(
                tap(([, subjects]) => {
                    this.filterSubjects = subjects;
                }),
                finalize(() => {
                    this.filterOptionsLoading = false;
                    this.cdr.markForCheck();
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();
    }

    get totalServerPages(): number {
        if (this.totalCount <= 0) {
            return 0;
        }
        return Math.ceil(this.totalCount / this.serverPageSize);
    }

    get currentServerPage(): number {
        return Math.floor(this.currentOffset / this.serverPageSize) + 1;
    }

    get rangeStart(): number {
        return this.totalCount === 0 ? 0 : this.currentOffset + 1;
    }

    get rangeEnd(): number {
        return Math.min(this.currentOffset + this.rows.length, this.totalCount);
    }

    get canGoPrev(): boolean {
        return !this.loading && this.currentOffset > 0;
    }

    get canGoFirst(): boolean {
        return this.canGoPrev;
    }

    get canGoNext(): boolean {
        return !this.loading && this.currentOffset + this.serverPageSize < this.totalCount;
    }

    get canGoLast(): boolean {
        return this.canGoNext;
    }

    get visiblePageNumbers(): number[] {
        const total = this.totalServerPages;
        if (total <= 0) {
            return [];
        }
        const windowSize = 5;
        let start = Math.max(1, this.currentServerPage - Math.floor(windowSize / 2));
        let end = Math.min(total, start + windowSize - 1);
        start = Math.max(1, end - windowSize + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }

    firstServerPage(): void {
        if (!this.canGoFirst) {
            return;
        }
        this.requestPage(0);
    }

    prevServerPage(): void {
        if (!this.canGoPrev) {
            return;
        }
        this.requestPage(Math.max(0, this.currentOffset - this.serverPageSize));
    }

    nextServerPage(): void {
        if (!this.canGoNext) {
            return;
        }
        this.requestPage(this.currentOffset + this.serverPageSize);
    }

    lastServerPage(): void {
        if (!this.canGoLast) {
            return;
        }
        const lastOffset = Math.max(0, (this.totalServerPages - 1) * this.serverPageSize);
        this.requestPage(lastOffset);
    }

    goToServerPage(page: number): void {
        if (this.loading || page < 1 || page > this.totalServerPages || page === this.currentServerPage) {
            return;
        }
        this.requestPage((page - 1) * this.serverPageSize);
    }

    onPageSizeChange(raw: number | string): void {
        const size = Number(raw);
        if (!Number.isFinite(size) || size < 1 || size === this.serverPageSize) {
            return;
        }
        this.serverPageSize = size;
        this.requestPage(0);
    }

    updateColumn(_col: (typeof this.cols)[number]): void {
        this.cols = [...this.cols];
    }

    exportTable(type: 'csv' | 'print'): void {
        if (!this.districtContext.isAttendanceContextReady() || this.totalCount === 0 || this.exportBusy) {
            return;
        }
        const base = this.districtContext.baseAttendancePayload();
        if (!base) {
            return;
        }
        const queryBase = this.buildRecordsQueryBase();
        if (!queryBase) {
            return;
        }
        this.exportBusy = true;
        this.exportError = null;
        this.cdr.markForCheck();
        this.teacherAssessment
            .listAllRecords(queryBase)
            .pipe(
                catchError(() => {
                    this.exportError = 'Could not export teacher records.';
                    return of(null);
                }),
                finalize(() => {
                    this.exportBusy = false;
                    this.cdr.markForCheck();
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe((result) => {
                if (!result) {
                    return;
                }
                const exportRows = result.records.map((r) => this.mapRecordToRow(r));
                const title = this.exportTitle();
                const cols = this.cols.map((c) => ({ field: c.field, title: c.title, hide: c.hide }));
                if (type === 'csv') {
                    downloadCsv(this.exportFilename(), cols, exportRows);
                } else {
                    printTable(title, cols, exportRows);
                }
            });
    }

    get canExport(): boolean {
        return (
            this.districtContext.isAttendanceContextReady() &&
            this.totalCount > 0 &&
            !this.exportBusy &&
            !this.loading
        );
    }

    private exportTitle(): string {
        const district = this.districtContext.districts.find(
            (d) => d.districtId === this.districtContext.selection.districtId,
        );
        const year = this.districtContext.academicYears.find(
            (y) => y.academicYearId === this.districtContext.selection.academicYearId,
        );
        const districtLabel = district?.districtName ?? district?.districtCode ?? 'District';
        const yearLabel = year?.yearLabel ?? 'School year';
        return `T-TESS — ${districtLabel} (${yearLabel})`;
    }

    private exportFilename(): string {
        return this.exportTitle()
            .toLowerCase()
            .replace(/[^\w]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }

    private requestPage(offset: number): void {
        this.pageRequest$.next(offset);
    }

    private resetFilters(): void {
        this.filterError = null;
        this.filtersDraft = { ...EMPTY_TTESS_FILTERS };
        this.appliedFilters = { ...EMPTY_TTESS_FILTERS };
        this.averageScoreMinInput = null;
        this.averageScoreMaxInput = null;
    }

    private buildRecordsQuery(offset: number): TeacherAssessmentRecordsQuery | null {
        return this.buildRecordsQueryForSelection(this.districtContext.selection, offset);
    }

    /** Uses the selection snapshot from the active context stream (avoids stale academicYearId). */
    private buildRecordsQueryForSelection(
        selection: DistrictContextSelection,
        offset: number,
    ): TeacherAssessmentRecordsQuery | null {
        const districtId = selection.districtId;
        const academicYearId = selection.academicYearId;
        if (districtId == null || academicYearId == null) {
            return null;
        }
        const f = this.appliedFilters;
        return {
            districtId,
            academicYearId,
            offset,
            limit: this.serverPageSize,
            gradeCode: f.gradeCode,
            subjectCode: f.subjectCode,
            averageScoreMin: f.averageScoreMin,
            averageScoreMax: f.averageScoreMax,
        };
    }

    private buildRecordsQueryBase(): Omit<TeacherAssessmentRecordsQuery, 'offset' | 'limit'> | null {
        const query = this.buildRecordsQueryForSelection(this.districtContext.selection, 0);
        if (!query) {
            return null;
        }
        const { offset: _offset, limit: _limit, ...base } = query;
        return base;
    }

    private hasAverageDraftInput(raw: number | string | null | undefined): boolean {
        if (raw == null) {
            return false;
        }
        if (typeof raw === 'number') {
            return Number.isFinite(raw);
        }
        return String(raw).trim() !== '';
    }

    private parseAverageInput(raw: number | string | null | undefined): number | null {
        if (raw == null) {
            return null;
        }
        if (typeof raw === 'number') {
            return Number.isFinite(raw) ? raw : null;
        }
        const trimmed = String(raw).trim();
        if (!trimmed) {
            return null;
        }
        const value = Number(trimmed);
        return Number.isFinite(value) ? value : null;
    }

    /** Loads every record matching the current filters (same query as export) and aggregates it. */
    private loadStats(
        selection: DistrictContextSelection,
    ): import('rxjs').Observable<TtessStats | null> {
        const query = this.buildRecordsQueryForSelection(selection, 0);
        if (!query) {
            return of(null);
        }
        const { offset: _offset, limit: _limit, ...queryBase } = query;
        this.statsLoading = true;
        this.cdr.markForCheck();
        return this.teacherAssessment.listAllRecords(queryBase).pipe(
            rxMap((result) => this.computeStats(result.records)),
            catchError(() => of(null)),
            finalize(() => {
                this.statsLoading = false;
                this.cdr.markForCheck();
            }),
        );
    }

    private computeStats(records: TeacherAssessmentRecordResponse[]): TtessStats | null {
        if (!records.length) {
            return null;
        }
        const scored = records.filter(
            (r) => r.averageScore != null && Number.isFinite(Number(r.averageScore)),
        );
        const avgScore = mean(scored.map((r) => Number(r.averageScore)));
        const avgGrowth = mean(
            records
                .filter((r) => r.growth != null && Number.isFinite(Number(r.growth)))
                .map((r) => Number(r.growth)),
        );
        const bands = countBands(scored.map((r) => Number(r.averageScore)));
        const proficientPct =
            bands.proficient > 0 || bands.progressing > 0 || bands.needsImprovement > 0
                ? (bands.proficient / scored.length) * 100
                : null;

        return {
            teacherCount: records.length,
            scoredCount: scored.length,
            avgScore,
            avgGrowth,
            proficientPct,
            bands,
            byGrade: this.groupAverages(records, (r) => gradeLabel(r.grade)),
            byCampus: this.groupAverages(records, (r) => this.campusLabel(r.campusCode)),
        };
    }

    /** Groups records by a label and averages their scores ("—" groups last, no fake data). */
    private groupAverages(
        records: TeacherAssessmentRecordResponse[],
        labelOf: (r: TeacherAssessmentRecordResponse) => string,
    ): TtessGroupAverage[] {
        const groups = new Map<string, number[]>();
        for (const r of records) {
            if (r.averageScore == null || !Number.isFinite(Number(r.averageScore))) {
                continue;
            }
            const label = labelOf(r);
            const bucket = groups.get(label) ?? [];
            bucket.push(Number(r.averageScore));
            groups.set(label, bucket);
        }
        return [...groups.entries()]
            .map(([label, scores]) => ({
                label,
                avg: mean(scores),
                count: scores.length,
            }))
            .sort((a, b) => {
                if (a.label === '—' || a.label === 'Unassigned') {
                    return 1;
                }
                if (b.label === '—' || b.label === 'Unassigned') {
                    return -1;
                }
                return a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: 'base' });
            });
    }

    private campusLabel(campusCode: string | null | undefined): string {
        const code = (campusCode ?? '').trim();
        if (!code) {
            return 'Unassigned';
        }
        const campus = this.districtContext.campuses.find(
            (c) => (c.campusCode || '').toLowerCase() === code.toLowerCase(),
        );
        return campus?.campusName ?? code;
    }

    // ---- Graphical summary chart option builders (ApexCharts) ----

    private buildBandChartOptions(stats: TtessStats) {
        const bands = stats.bands;
        return {
            series: [bands.needsImprovement, bands.progressing, bands.proficient],
            chart: { type: 'donut', height: 300, animations: { enabled: true } } as ApexChart,
            labels: ['Needs Improvement (≤ 63)', 'Progressing (64–74)', 'Proficient (> 74)'],
            colors: ['#e75c5c', '#e2a03f', '#00ab55'],
            legend: { position: 'bottom', fontSize: '13px' } as ApexLegend,
            plotOptions: {
                pie: {
                    donut: {
                        size: '70%',
                        labels: {
                            show: true,
                            name: { show: true, fontSize: '12px' },
                            value: {
                                show: true,
                                fontSize: '20px',
                                fontWeight: 700,
                                formatter: (val: string) => String(val),
                            },
                            total: {
                                show: true,
                                label: 'Teachers',
                                fontSize: '12px',
                                formatter: () => String(stats.scoredCount),
                            },
                        },
                    },
                } as ApexPlotOptions,
            },
            dataLabels: {
                enabled: true,
                formatter: (val: string) => (val ? String(Math.round(Number(val))) : ''),
            } as ApexDataLabels,
            tooltip: { y: { formatter: (val: number) => `${val} teacher${val === 1 ? '' : 's'}` } } as ApexTooltip,
        };
    }

    /** Bar chart of group averages; each bar colored by its score band. */
    private buildGroupChartOptions(groups: TtessGroupAverage[], seriesName: string) {
        const usable = groups.filter((g) => g.avg != null);
        if (!usable.length) {
            return null;
        }
        return {
            series: [{ name: seriesName, data: usable.map((g) => round1(g.avg)) }],
            chart: { type: 'bar', height: 300 } as ApexChart,
            colors: usable.map((g) => bandColor(g.avg)),
            legend: { show: false },
            xaxis: {
                categories: usable.map((g) => (g.count > 1 ? `${g.label} (${g.count})` : g.label)),
                labels: { trim: true, hideOverlappingLabels: true },
            } as ApexXAxis,
            yaxis: { min: 0, max: 100, tickAmount: 5, labels: { formatter: (v: number) => `${v}` } } as ApexYAxis,
            plotOptions: {
                bar: {
                    columnWidth: '55%',
                    distributed: true,
                    dataLabels: { position: 'top' },
                } as ApexPlotOptions,
            },
            dataLabels: {
                enabled: true,
                formatter: (val: string) =>
                    val ? Number(val).toFixed(1) : '',
                offsetY: -18,
                style: { fontSize: '11px', fontWeight: 600 },
            } as ApexDataLabels,
            tooltip: { y: { formatter: (val: number) => (val != null ? `${val.toFixed(1)}` : '—') } } as ApexTooltip,
        };
    }

    private resetRows(): void {
        this.rows = [];
        this.totalCount = 0;
        this.growthQuarterCode = null;
        this.loadError = null;
        this.currentOffset = 0;
    }

    /* ================= New Assessment modal (2-step) ================= */

    @ViewChild('newAssessmentModal')
    newAssessmentModal?: NgxCustomModalComponent;

    /** Step of the modal: 1 = select District → Campus → Teacher, 2 = rubric form. */
    assessStep: 1 | 2 = 1;

    // -- Step 1 state --
    assessDistricts: District[] = [];
    assessDistrictId: number | null = null;
    assessCampuses: Campus[] = [];
    assessCampusId: number | null = null;
    assessCampusCode = '';
    assessTeachers: TeacherSummaryDto[] = [];
    assessTeacherId: number | null = null;
    assessTeacherSearch = '';
    assessLoadingCampuses = false;
    assessLoadingTeachers = false;
    assessTeacherLatest: TtessTeacherLatestResponse | null = null;
    assessTeacherLatestLoading = false;
    assessStep1Error: string | null = null;

    // -- Step 2 state --
    readonly observationTypes = ['Formal Observation', 'Informal Observation', 'Walkthrough'];
    assessObservationDate = '';
    assessObservationType = 'Formal Observation';
    assessEvaluatorName = '';
    /** Rating per active rubric question (ttessQuestionId → selected points); null = not yet answered. */
    assessmentRatings: Record<number, number | null> = {};
    /** Optional evidence/comments per domain number (1–4 from the rubric). */
    assessDomainComments: Record<number, string> = { 1: '', 2: '', 3: '', 4: '' };
    assessOverallComment = '';
    submittingAssessment = false;
    assessSubmitError: string | null = null;
    /** True after a submit attempt — unanswered dimensions get the red highlight. */
    assessSubmitAttempted = false;

    /**
     * The district's T-TESS rubric (domains, questions and answer options), loaded
     * from the database when a district is selected in step 1. Falls back to the
     * hard-coded standard rubric below when the API is unreachable, so the form
     * never renders empty.
     */
    assessRubric: TtessRubric | null = null;
    assessRubricLoading = false;
    assessRubricError: string | null = null;

    openAssessmentModal(): void {
        if (!this.districtContext.isAttendanceContextReady()) {
            return;
        }
        this.assessStep = 1;
        this.assessDistricts = [...this.districtContext.districts];
        this.assessDistrictId = null;
        this.assessCampuses = [];
        this.assessCampusId = null;
        this.assessCampusCode = '';
        this.assessTeachers = [];
        this.assessTeacherId = null;
        this.assessTeacherSearch = '';
        this.assessTeacherLatest = null;
        this.assessStep1Error = null;
        this.assessRubric = null;
        this.assessRubricError = null;
        this.resetAssessmentForm();
        this.newAssessmentModal?.open();
        this.cdr.markForCheck();
    }

    closeAssessmentModal(): void {
        this.newAssessmentModal?.close();
    }

    private resetAssessmentForm(): void {
        this.assessObservationDate = this.todayIsoDate();
        this.assessObservationType = 'Formal Observation';
        const user = this.auth.getCurrentUser();
        this.assessEvaluatorName = user?.displayName?.trim() || [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || '';
        this.assessmentRatings = {};
        for (const q of this.assessActiveQuestions) {
            this.assessmentRatings[q.ttessQuestionId] = null;
        }
        this.assessDomainComments = { 1: '', 2: '', 3: '', 4: '' };
        this.assessOverallComment = '';
        this.submittingAssessment = false;
        this.assessSubmitError = null;
        this.assessSubmitAttempted = false;
    }

    /** Template helper — global Number() is not callable from Angular templates. */
    toNum(value: number | string | null | undefined): number | null {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    private todayIsoDate(): string {
        const d = new Date();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${m}-${day}`;
    }

    // -- Step 1 cascading loads --

    onAssessDistrictChange(): void {
        this.assessCampuses = [];
        this.assessCampusId = null;
        this.assessCampusCode = '';
        this.assessTeachers = [];
        this.assessTeacherId = null;
        this.assessTeacherLatest = null;
        this.assessStep1Error = null;
        this.assessRubric = null;
        this.assessRubricError = null;
        this.resetAssessmentForm();
        if (this.assessDistrictId == null) {
            return;
        }
        // Load this district's editable T-TESS rubric (falls back to the standard rubric on error).
        this.assessRubricLoading = true;
        this.cdr.markForCheck();
        this.teacherAssessment
            .getTtessRubric(this.assessDistrictId)
            .pipe(
                catchError(() => {
                    this.assessRubricError = 'Could not load the district rubric — using the standard T-TESS rubric.';
                    return of(null as TtessRubric | null);
                }),
                finalize(() => {
                    this.assessRubricLoading = false;
                    this.cdr.markForCheck();
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe((rubric) => {
                this.assessRubric = rubric;
                // Re-init the answer keys against the loaded (or fallback) rubric.
                this.resetAssessmentForm();
            });
        this.assessLoadingCampuses = true;
        this.cdr.markForCheck();
        this.filters
            .listCampuses({ districtId: this.assessDistrictId, activeOnly: true })
            .pipe(
                catchError(() => {
                    this.assessStep1Error = 'Could not load campuses for this district.';
                    return of<Campus[]>([]);
                }),
                finalize(() => {
                    this.assessLoadingCampuses = false;
                    this.cdr.markForCheck();
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe((campuses) => {
                this.assessCampuses = campuses;
            });
    }

    onAssessCampusChange(): void {
        this.assessTeachers = [];
        this.assessTeacherId = null;
        this.assessTeacherLatest = null;
        this.assessStep1Error = null;
        const districtId = this.assessDistrictId;
        const campus = this.assessCampuses.find((c) => c.campusId === this.assessCampusId);
        this.assessCampusCode = campus?.campusCode ?? '';
        if (districtId == null || this.assessCampusId == null || !this.assessCampusCode) {
            return;
        }
        this.assessLoadingTeachers = true;
        this.cdr.markForCheck();
        this.teachersService
            .listTeachersByCampus(districtId, this.assessCampusCode)
            .pipe(
                catchError(() => {
                    this.assessStep1Error = 'Could not load teachers for this campus.';
                    return of<TeacherSummaryDto[]>([]);
                }),
                finalize(() => {
                    this.assessLoadingTeachers = false;
                    this.cdr.markForCheck();
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe((teachers) => {
                this.assessTeachers = teachers;
            });
    }

    onAssessTeacherChange(): void {
        this.assessTeacherLatest = null;
        this.assessStep1Error = null;
        const teacher = this.assessSelectedTeacher;
        const districtId = this.assessDistrictId;
        const externalId = teacher?.teacherIdExternal?.trim();
        if (!teacher || districtId == null || !externalId) {
            this.cdr.markForCheck();
            return;
        }
        this.assessTeacherLatestLoading = true;
        this.cdr.markForCheck();
        this.teacherAssessment
            .getTeacherLatest(districtId, externalId)
            .pipe(
                catchError(() => of(null as TtessTeacherLatestResponse | null)),
                finalize(() => {
                    this.assessTeacherLatestLoading = false;
                    this.cdr.markForCheck();
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe((latest) => {
                this.assessTeacherLatest = latest;
            });
    }

    get assessSelectedTeacher(): TeacherSummaryDto | null {
        return this.assessTeachers.find((t) => Number(t.teacherId) === this.assessTeacherId) ?? null;
    }

    get assessTeacherName(): string {
        const t = this.assessSelectedTeacher;
        return t?.teacherName || [t?.lastName, t?.firstName].filter(Boolean).join(', ') || '';
    }

    /** Campus display name for the summary card. */
    get assessCampusName(): string {
        const campus = this.assessCampuses.find((c) => c.campusId === this.assessCampusId);
        return campus?.campusName || campus?.campusCode || '';
    }

    get assessCanContinue(): boolean {
        return this.assessDistrictId != null && this.assessCampusId != null && this.assessTeacherId != null;
    }

    /** Teachers filtered by the in-dropdown search field (name can be long lists). */
    get assessFilteredTeachers(): TeacherSummaryDto[] {
        const needle = this.assessTeacherSearch.trim().toLowerCase();
        if (!needle) {
            return this.assessTeachers;
        }
        return this.assessTeachers.filter((t) =>
            `${t.teacherName ?? ''} ${t.firstName ?? ''} ${t.lastName ?? ''}`.toLowerCase().includes(needle),
        );
    }

    goToStep2(): void {
        if (!this.assessCanContinue) {
            return;
        }
        this.assessStep = 2;
        this.cdr.markForCheck();
    }

    backToStep1(): void {
        // Returns without touching the rubric answers entered so far.
        this.assessStep = 1;
        this.assessSubmitError = null;
        this.cdr.markForCheck();
    }

    // -- Step 2 rubric helpers --

    /**
     * Domains for the form: the district's DB rubric when loaded, otherwise the
     * standard T-TESS rubric (same shape, so the template never branches).
     */
    get assessRubricDomains(): TtessRubricDomain[] {
        if (this.assessRubric) {
            return this.assessRubric.domains.filter((d) => d.isActive !== false);
        }
        // Fallback: group the hard-coded dimensions into the standard 4 domains.
        return Object.keys(TTESS_DOMAIN_NAMES).map((n) => {
            const domainNumber = Number(n);
            return {
                ttessDomainId: -domainNumber,
                districtId: this.assessDistrictId ?? 0,
                domainNumber,
                domainName: TTESS_DOMAIN_NAMES[domainNumber],
                sortOrder: domainNumber,
                isActive: true,
                questions: TTESS_DIMENSIONS.filter((d) => d.domain === domainNumber).map((d, i) => ({
                    ttessQuestionId: -(domainNumber * 10 + i),
                    districtId: this.assessDistrictId ?? 0,
                    ttessDomainId: -domainNumber,
                    domainNumber,
                    questionCode: d.code,
                    questionText: d.label,
                    sortOrder: i + 1,
                    isActive: true,
                })),
            };
        });
    }

    /** Active questions the form must rate (flat, in rubric order). */
    get assessActiveQuestions(): Array<{ ttessQuestionId: number; questionCode: string; questionText: string; domainNumber: number }> {
        return this.assessRubricDomains.flatMap((d) =>
            d.questions
                .filter((q) => q.isActive !== false)
                .map((q) => ({
                    ttessQuestionId: q.ttessQuestionId,
                    questionCode: q.questionCode,
                    questionText: q.questionText,
                    domainNumber: d.domainNumber,
                })),
        );
    }

    /** Rating pills: the district's DB options when loaded, else the standard scale. */
    get assessRatingOptions(): TtessRubricOption[] {
        const options = this.assessRubric?.options?.filter((o) => o.isActive !== false) ?? [];
        if (options.length) {
            return options;
        }
        return TTESS_RATING_SCALE.map((lvl, i) => ({
            ttessOptionId: -(i + 1),
            districtId: this.assessDistrictId ?? 0,
            optionLabel: lvl.label,
            pointValue: lvl.value,
            sortOrder: i + 1,
            isActive: true,
        }));
    }

    /** Maximum selectable points — used by the (average ÷ max × 100) score formula. */
    get assessMaxPoints(): number {
        const values = this.assessRatingOptions.map((o) => Number(o.pointValue)).filter((v) => Number.isFinite(v));
        return values.length ? Math.max(...values) : 5;
    }

    domainName(domain: number): string {
        return TTESS_DOMAIN_NAMES[domain] ?? `Domain ${domain}`;
    }

    /** Rating key for the backend legacy columns from a dimension code ('1.1' → 'rating1_1'). */
    ratingKey(code: string): keyof TtessNewAssessmentPayload & string {
        return `rating${code.replace('.', '_')}` as keyof TtessNewAssessmentPayload & string;
    }

    setRating(questionId: number, value: number): void {
        this.assessmentRatings[questionId] = value;
        // Once the rubric is complete, clear the "unanswered" validation state.
        if (this.allDimensionsAnswered) {
            this.assessSubmitError = null;
        }
        this.cdr.markForCheck();
    }

    get answeredCount(): number {
        return this.assessActiveQuestions.filter((q) => this.assessmentRatings[q.ttessQuestionId] != null).length;
    }

    get unansweredCodes(): string[] {
        return this.assessActiveQuestions.filter((q) => this.assessmentRatings[q.ttessQuestionId] == null).map((q) => q.questionCode);
    }

    get allDimensionsAnswered(): boolean {
        return this.unansweredCodes.length === 0;
    }

    /** Overall score preview: (average of selected points ÷ maximum points) × 100, 1 decimal. */
    get assessmentScorePreview(): number | null {
        if (!this.allDimensionsAnswered) {
            return null;
        }
        const values = this.assessActiveQuestions.map((q) => this.assessmentRatings[q.ttessQuestionId] ?? 0);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        return Math.round((avg / this.assessMaxPoints) * 1000) / 10;
    }

    /** Live band label for the score preview (same thresholds as the page legend). */
    get assessmentBandPreview(): string | null {
        const score = this.assessmentScorePreview;
        return score == null ? null : ttessBandLabel(score);
    }

    submitAssessment(): void {
        const teacher = this.assessSelectedTeacher;
        const districtId = this.assessDistrictId;
        const academicYearId = this.districtContext.selection.academicYearId;
        if (!teacher || districtId == null || academicYearId == null) {
            this.assessSubmitError = 'Select a district, campus and teacher first.';
            this.cdr.markForCheck();
            return;
        }
        if (!this.allDimensionsAnswered) {
            // Validation gate: every unanswered dimension gets the red highlight until fixed.
            this.assessSubmitAttempted = true;
            this.assessSubmitError = `Rate all ${this.assessActiveQuestions.length} T-TESS dimensions before submitting (${this.unansweredCodes.length} remaining).`;
            this.cdr.markForCheck();
            return;
        }
        // Rubric-driven ratings (questionId → points) are the authoritative input;
        // legacy rating1_1…rating4_4 columns are filled best-effort by question code
        // so older reports keep reading the fixed columns.
        const ratings = this.assessActiveQuestions.map((q) => ({
            questionId: q.ttessQuestionId,
            points: this.assessmentRatings[q.ttessQuestionId] ?? 0,
        }));
        const legacy: Partial<Record<string, number>> = {};
        for (const q of this.assessActiveQuestions) {
            if (/^[1-9]\.\d+$/.test(q.questionCode)) {
                legacy[this.ratingKey(q.questionCode)] = this.assessmentRatings[q.ttessQuestionId] ?? 0;
            }
        }
        const payload: TtessNewAssessmentPayload = {
            districtId,
            academicYearId,
            teacherId: Number(teacher.teacherId),
            observationDate: this.assessObservationDate,
            observationType: this.assessObservationType,
            evaluatorName: this.assessEvaluatorName.trim(),
            ratings,
            ...legacy,
            commentDomain1: this.assessDomainComments[1]?.trim() || null,
            commentDomain2: this.assessDomainComments[2]?.trim() || null,
            commentDomain3: this.assessDomainComments[3]?.trim() || null,
            commentDomain4: this.assessDomainComments[4]?.trim() || null,
            overallComment: this.assessOverallComment.trim() || null,
            createdBy: this.auth.getCurrentUser()?.displayName ?? undefined,
        };
        this.submittingAssessment = true;
        this.assessSubmitError = null;
        this.assessSubmitAttempted = true;
        this.cdr.markForCheck();
        this.teacherAssessment
            .createTtessAssessment(payload)
            .pipe(
                catchError((err: unknown) => {
                    const message =
                        (err as { error?: { message?: string } })?.error?.message ||
                        (err as { message?: string })?.message ||
                        'Could not save the assessment.';
                    this.assessSubmitError = message;
                    return of(null as TtessSavedAssessmentResponse | null);
                }),
                finalize(() => {
                    this.submittingAssessment = false;
                    this.cdr.markForCheck();
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe((saved) => {
                if (!saved) {
                    return;
                }
                // Success toast, then refresh table + overview/charts WITHOUT a manual reload.
                void Swal.fire({
                    toast: true,
                    position: 'top-end',
                    icon: 'success',
                    title: `Assessment saved for ${saved.teacherName}`,
                    showConfirmButton: false,
                    timer: 4000,
                    timerProgressBar: true,
                });
                this.closeAssessmentModal();
                this.requestPage(this.currentOffset);
                this.statsRequest$.next();
            });
    }

    private mapRecordToRow(r: TeacherAssessmentRecordResponse): TtessTeacherRow {
        return {
            staffFirstName: (r.teacherFirstName ?? '').trim(),
            staffLastName: (r.teacherLastName ?? '').trim(),
            subject: (r.subjects ?? '').trim(),
            gradeLevel: (r.grade ?? '').trim(),
            appraiserFirstName: (r.appraiserFirstName ?? '').trim(),
            appraiserLastName: (r.appraiserLastName ?? '').trim(),
            walkthrough1: r.walkthrough1Score ?? null,
            walkthrough2: r.walkthrough2Score ?? null,
            walkthrough3: r.walkthrough3Score ?? null,
            walkthrough4: r.observation1Score ?? r.walkthrough4Score ?? null,
            observation1: r.observation2Score ?? r.observation1Score ?? null,
            observation2: r.summativeScore ?? r.observation2Score ?? null,
            average: r.averageScore ?? null,
            growth: r.growth ?? null,
        };
    }
}

/** Arithmetic mean; null when there are no finite values (never fabricates a number). */
function mean(values: number[]): number | null {
    const finite = values.filter((v) => Number.isFinite(v));
    if (!finite.length) {
        return null;
    }
    return finite.reduce((a, b) => a + b, 0) / finite.length;
}

function round1(value: number | null): number | null {
    return value == null || !Number.isFinite(value) ? null : Math.round(value * 10) / 10;
}

/** Count teacher averages into the T-TESS bands (≤63 / 64–74 / >74). */
function countBands(scores: number[]): TtessScoreBandCounts {
    const bands: TtessScoreBandCounts = {
        needsImprovement: 0,
        progressing: 0,
        proficient: 0,
    };
    for (const s of scores) {
        if (!Number.isFinite(s)) {
            continue;
        }
        if (s < 64) {
            bands.needsImprovement++;
        } else if (s <= 74) {
            bands.progressing++;
        } else {
            bands.proficient++;
        }
    }
    return bands;
}

/** Band color for a score — same thresholds as the table row accents. */
function bandColor(score: number | null | undefined): string {
    if (score == null || !Number.isFinite(score)) {
        return '#8f9bb3';
    }
    if (score < 64) {
        return '#e75c5c';
    }
    if (score <= 74) {
        return '#e2a03f';
    }
    return '#00ab55';
}

function gradeLabel(grade: string | null | undefined): string {
    const g = (grade ?? '').trim();
    return g || 'Unassigned';
}
