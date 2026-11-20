import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    AfterViewInit,
    ChangeDetectorRef,
    Component,
    DestroyRef,
    ElementRef,
    NgZone,
    OnDestroy,
    OnInit,
    ViewChild,
} from '@angular/core';
import { Store } from '@ngrx/store';
import { forkJoin, of } from 'rxjs';
import { catchError, distinctUntilChanged, finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgxCustomModalComponent } from 'ngx-custom-modal';
import { DistrictContextService } from '../../../../core/services/district-context.service';
import { AttendanceAnalyticsService } from '../../../../core/services/attendance-analytics.service';
import { downloadCsv, printTable } from '../../../../core/utils/table-export.util';
import type {
    CampusAttendanceRecordDto,
    CampusWiseAttendanceStatDto,
    DistrictAttendanceSummaryDto,
    LowestAdaCampusSnapshotDto,
    MonthlyAttendanceStatDto,
} from '../../../../core/models/simplify-api.model';
import { SharedModule } from '../../../../shared/shared.module';

/** Row for Attendance Records modal table. */
export interface CampusAttendanceRecordRow {
    campusName: string;
    date: string;
    day: string;
    campusAdaPct: string;
    enrollment: string;
    studentAbsents: string;
    estimatedMissed: string;
}

/** Sparkline height for stacked category ADA cards (beside Lowest ADA). */
const CATEGORY_SPARKLINE_HEIGHT_PX = 88;

@Component({
    selector: 'app-attendance-summary-page',
    templateUrl: './attendance-summary-page.component.html',
    standalone: true,
    imports: [CommonModule, FormsModule, SharedModule],
})
export class AttendanceSummaryPageComponent implements OnInit, AfterViewInit, OnDestroy {
    /**
     * Same layout model as campus-category (growth overview): fixed pair width +
     * fixed slot; full-width chart with empty pads so bars sit in the center.
     * Dual y-axes need a larger edge pad than the single-axis campus chart.
     */
    private static readonly BAR_GROUP_PX = 64;
    private static readonly BAR_SLOT_PX = 110;
    private static readonly BAR_CHART_PAD_PX = 160;
    private static readonly BAR_DEFAULT_CONTAINER_PX = 1100;

    @ViewChild('monthlyAdaChartContainer')
    monthlyAdaChartContainer?: ElementRef<HTMLElement>;

    @ViewChild('attendanceRecordsModal')
    attendanceRecordsModal?: NgxCustomModalComponent;

    attendanceRecordsSearch = '';
    attendanceRecordsRows: CampusAttendanceRecordRow[] = [];
    attendanceRecordsLoading = false;
    selectedCampusLabel = '';

    readonly attendanceRecordCols: Array<{
        field: keyof CampusAttendanceRecordRow;
        title: string;
        filter: boolean;
    }> = [
        { field: 'campusName', title: 'Campus Name', filter: true },
        { field: 'date', title: 'Date', filter: true },
        { field: 'day', title: 'Day', filter: true },
        { field: 'campusAdaPct', title: 'Campus ADA%', filter: true },
        { field: 'enrollment', title: 'Enrollment', filter: true },
        { field: 'studentAbsents', title: 'Student Absents', filter: true },
        { field: 'estimatedMissed', title: 'Estimated $ Missed', filter: true },
    ];

    private monthlyAdaResizeObserver?: ResizeObserver;
    private monthlyAdaContainerWidthPx = 0;
    private lastMonthlyAdaLayoutKey = '';
    isLoading = true;
    store: any;

    attendanceLoading = false;
    attendanceError: string | null = null;

    summary: DistrictAttendanceSummaryDto | null = null;
    monthlyStats: MonthlyAttendanceStatDto[] = [];
    campusWise: CampusWiseAttendanceStatDto[] = [];
    categoryAdaMap: Record<string, number[]> | null = null;

    lowestAdaSnapshots: LowestAdaCampusSnapshotDto[] = [];
    lowestAdaLoading = false;

    readonly lowAdaMonthNames = [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December',
    ];

    selectedLowAdaMonth = new Date().toLocaleString('en-US', { month: 'long' });
    selectedLowAdaCampusCode = '';
    /** Populated on demand when the lowest-ADA campus filter is opened. */
    campusFilterOptions: { campusId: number; campusCode: string; campusName: string }[] = [];
    campusFilterLoading = false;

    adaSparklineOptions: any;
    monthlyAdaOptions: any;
    campusMissedChart: any = null;
    /** Ranked campus rows backing the $Missed chart (click index → campus). */
    campusMissedChartRows: CampusWiseAttendanceStatDto[] = [];
    useMonthlyAdaHorizontalScroll = false;
    monthlyAdaScrollWidth = 0;
    categorySparkSlots: Array<{
        key: string;
        title: string;
        latestAdaDisplay: string;
        sparklineOptions: any;
    }> = [];

    private monthlyAdaChartPayload: {
        categories: string[];
        pctSeries: number[];
        dollarSeries: number[];
        maxDollar: number;
    } | null = null;

    constructor(
        public storeData: Store<any>,
        readonly districtContext: DistrictContextService,
        private attendanceApi: AttendanceAnalyticsService,
        private destroyRef: DestroyRef,
        private cdr: ChangeDetectorRef,
        private ngZone: NgZone,
    ) {
        this.initStore();
    }

    ngAfterViewInit(): void {
        this.attachMonthlyAdaResizeObserver();
    }

    ngOnDestroy(): void {
        this.monthlyAdaResizeObserver?.disconnect();
    }

    ngOnInit(): void {
        this.districtContext.selection$
            .pipe(
                distinctUntilChanged(
                    (a, b) =>
                        a.districtId === b.districtId && a.academicYearId === b.academicYearId,
                ),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe(() => {
                queueMicrotask(() => {
                    if (this.districtContext.isAttendanceContextReady()) {
                        this.preloadRoleCampusContext(() => {
                            this.refreshAttendanceAnalytics();
                            this.refreshLowestAda();
                        });
                    } else {
                        this.resetData();
                        this.initChartsFromData();
                    }
                    this.cdr.markForCheck();
                });
            });

        queueMicrotask(() => {
            if (this.districtContext.isAttendanceContextReady()) {
                this.preloadRoleCampusContext(() => {
                    this.refreshAttendanceAnalytics();
                    this.refreshLowestAda();
                });
            } else {
                this.isLoading = false;
                this.initChartsFromData();
            }
            this.cdr.markForCheck();
        });
    }

    get estimatedMissedAnnual(): number {
        return this.monthlyStats.reduce((sum, m) => sum + (m.estimatedMissedFinance ?? 0), 0);
    }

    get districtAdaPctDisplay(): string {
        const v = this.summary?.averageAdaPct;
        return v != null ? `${Number(v).toFixed(1)}%` : '—';
    }

    get districtAdaPctNum(): number {
        const v = this.summary?.averageAdaPct;
        return v != null ? Math.min(100, Math.max(0, Number(v))) : 0;
    }

    onLowAdaFilterChange(): void {
        if (this.districtContext.isAttendanceContextReady()) {
            this.refreshLowestAda();
        }
    }

    /** Lazy-load GET /campuses only when the user opens the campus filter. */
    loadCampusFilterOptions(): void {
        if (this.campusFilterOptions.length || this.campusFilterLoading) {
            return;
        }
        this.campusFilterLoading = true;
        this.districtContext.ensureDistrictCampuses().subscribe(() => {
            this.applyRoleCampusDefaults();
            this.campusFilterOptions = this.districtContext
                .filterCampusesForActiveRole(this.districtContext.campuses)
                .map((c) => ({
                    campusId: c.campusId,
                    campusCode: c.campusCode,
                    campusName: c.campusName,
                }));
            this.campusFilterLoading = false;
            this.cdr.markForCheck();
        });
    }

    get campusFilterLocked(): boolean {
        return this.districtContext.roleScopePayload().campusId != null;
    }

    get canExportAttendanceRecords(): boolean {
        return this.attendanceRecordsRows.length > 0 && !this.attendanceRecordsLoading;
    }

    openAttendanceRecords(campus: CampusWiseAttendanceStatDto): void {
        const label = campus.campusName?.trim() || '—';
        this.selectedCampusLabel = label;
        this.attendanceRecordsSearch = '';
        this.attendanceRecordsRows = [];
        this.attendanceRecordsModal?.open();
        this.districtContext.ensureDistrictCampuses().subscribe(() => {
            this.loadAttendanceRecords(label);
        });
    }

    exportAttendanceRecords(format: 'csv' | 'print'): void {
        if (!this.canExportAttendanceRecords) {
            return;
        }
        const title = `Attendance Records — ${this.selectedCampusLabel}`;
        if (format === 'csv') {
            downloadCsv(
                `attendance-records-${this.selectedCampusLabel}`.replace(/\s+/g, '-'),
                this.attendanceRecordCols,
                this.attendanceRecordsRows,
            );
            return;
        }
        printTable(title, this.attendanceRecordCols, this.attendanceRecordsRows);
    }

    private loadAttendanceRecords(campusLabel: string): void {
        const base = this.districtContext.baseAttendancePayload();
        if (!base || !campusLabel.trim()) {
            return;
        }
        const campusCode = this.resolveCampusCode(campusLabel);
        this.attendanceRecordsLoading = true;
        this.cdr.markForCheck();
        this.attendanceApi
            .getCampusAttendanceRecords({
                districtId: base.districtId,
                academicYearId: base.academicYearId,
                campusCode,
            })
            .pipe(
                catchError(() => of([] as CampusAttendanceRecordDto[])),
                finalize(() => {
                    this.attendanceRecordsLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe((records) => {
                this.attendanceRecordsRows = records.map((r) => this.mapAttendanceRecordToRow(r, campusLabel));
                this.cdr.markForCheck();
            });
    }

    private resolveCampusCode(campusLabel: string): string {
        const label = campusLabel.trim();
        const campuses = this.districtContext.campuses;
        const byCode = campuses.find((c) => c.campusCode?.toLowerCase() === label.toLowerCase());
        if (byCode) {
            return byCode.campusCode;
        }
        const byName = campuses.find(
            (c) =>
                c.campusName?.toLowerCase() === label.toLowerCase() ||
                c.campusName?.toLowerCase().includes(label.toLowerCase()),
        );
        return byName?.campusCode ?? label;
    }

    private mapAttendanceRecordToRow(
        r: CampusAttendanceRecordDto,
        fallbackCampus: string,
    ): CampusAttendanceRecordRow {
        const ada = r.campusAdaPct;
        const enrollment = r.enrollment;
        const absents = r.studentAbsents;
        const missed = r.estimatedMissed;
        return {
            campusName: (r.campusName ?? r.campusCode ?? fallbackCampus).trim() || '—',
            date: this.formatAttendanceDate(r.attendanceDate),
            day: (r.dayOfWeek ?? this.weekdayFromDate(r.attendanceDate) ?? '—').trim() || '—',
            campusAdaPct:
                ada != null && Number.isFinite(Number(ada))
                    ? `${Math.round(Number(ada) * 100) / 100}`
                    : '—',
            enrollment:
                enrollment != null && Number.isFinite(Number(enrollment)) ? String(enrollment) : '—',
            studentAbsents:
                absents != null && Number.isFinite(Number(absents)) ? String(absents) : '—',
            estimatedMissed:
                missed != null && Number.isFinite(Number(missed))
                    ? String(Math.round(Number(missed)))
                    : '—',
        };
    }

    private formatAttendanceDate(value?: string): string {
        if (!value?.trim()) {
            return '—';
        }
        const raw = value.trim();
        if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) {
            return raw;
        }
        const parsed = new Date(`${raw}T12:00:00`);
        if (Number.isNaN(parsed.getTime())) {
            return raw;
        }
        const mm = String(parsed.getMonth() + 1).padStart(2, '0');
        const dd = String(parsed.getDate()).padStart(2, '0');
        const yyyy = parsed.getFullYear();
        return `${mm}/${dd}/${yyyy}`;
    }

    private weekdayFromDate(value?: string): string | undefined {
        if (!value?.trim()) {
            return undefined;
        }
        const parsed = new Date(`${value.trim()}T12:00:00`);
        if (Number.isNaN(parsed.getTime())) {
            return undefined;
        }
        return parsed.toLocaleDateString('en-US', { weekday: 'long' });
    }

    private resetData(): void {
        this.summary = null;
        this.monthlyStats = [];
        this.campusWise = [];
        this.campusMissedChart = null;
        this.campusMissedChartRows = [];
        this.categoryAdaMap = null;
        this.lowestAdaSnapshots = [];
        this.campusFilterOptions = [];
        this.campusFilterLoading = false;
        this.attendanceError = null;
        this.monthlyAdaChartPayload = null;
        this.lastMonthlyAdaLayoutKey = '';
        this.useMonthlyAdaHorizontalScroll = false;
        this.monthlyAdaScrollWidth = 0;
    }

    private preloadRoleCampusContext(onReady: () => void): void {
        const scopedId = this.districtContext.roleScopePayload().campusId;
        if (scopedId == null) {
            onReady();
            return;
        }
        this.districtContext.ensureDistrictCampuses().subscribe(() => {
            this.applyRoleCampusDefaults();
            onReady();
        });
    }

    /** Pre-select campus filters when the active role is scoped to one campus (Principal / Teacher). */
    private applyRoleCampusDefaults(): void {
        const scope = this.districtContext.roleScopePayload();
        if (scope.campusId == null) {
            return;
        }
        const campus = this.districtContext.findCampusById(scope.campusId);
        if (campus?.campusCode) {
            this.selectedLowAdaCampusCode = campus.campusCode;
        }
        if (!this.campusFilterOptions.length) {
            this.campusFilterOptions = this.districtContext
                .filterCampusesForActiveRole(this.districtContext.campuses)
                .map((c) => ({
                    campusId: c.campusId,
                    campusCode: c.campusCode,
                    campusName: c.campusName,
                }));
        }
    }

    private refreshAttendanceAnalytics(): void {
        const base = this.districtContext.baseAttendancePayload();
        if (!base) {
            return;
        }
        this.applyRoleCampusDefaults();
        this.attendanceLoading = true;
        this.attendanceError = null;

        forkJoin({
            monthly: this.attendanceApi.postMonthlyStats(base),
            summary: this.attendanceApi.postDistrictAdaSummary(base),
            campusWise: this.attendanceApi.postCampusWiseStats(base),
            categoryAda: this.attendanceApi.postCampusCategoryMonthlyAda(base),
        }).subscribe({
            next: ({ monthly, summary, campusWise, categoryAda }) => {
                queueMicrotask(() => {
                    this.monthlyStats = monthly;
                    this.summary = summary;
                    this.campusWise = campusWise;
                    this.categoryAdaMap = categoryAda;
                    this.attendanceLoading = false;
                    this.isLoading = false;
                    this.initChartsFromData();
                    this.cdr.markForCheck();
                });
            },
            error: (err: Error) => {
                queueMicrotask(() => {
                    this.attendanceError = err.message ?? 'Attendance metrics failed to load';
                    this.attendanceLoading = false;
                    this.isLoading = false;
                    this.initChartsFromData();
                    this.cdr.markForCheck();
                });
            },
        });
    }

    private refreshLowestAda(): void {
        const base = this.districtContext.baseAttendancePayload();
        if (!base || !this.selectedLowAdaMonth?.trim()) {
            return;
        }
        this.applyRoleCampusDefaults();
        this.lowestAdaLoading = true;
        this.cdr.markForCheck();
        const body = {
            ...base,
            month: this.selectedLowAdaMonth.trim(),
            campusCode: this.selectedLowAdaCampusCode?.trim() || undefined,
        };
        this.attendanceApi.postLowestAdaThreeDays(body).subscribe({
            next: (rows) => {
                this.lowestAdaSnapshots = rows;
                this.lowestAdaLoading = false;
                this.cdr.markForCheck();
            },
            error: () => {
                this.lowestAdaSnapshots = [];
                this.lowestAdaLoading = false;
                this.cdr.markForCheck();
            },
        });
    }

    initStore() {
        this.storeData.select((d) => d.index).subscribe((d) => {
            const hasChangeTheme = this.store?.theme !== d?.theme;
            const hasChangeLayout = this.store?.layout !== d?.layout;
            const hasChangeMenu = this.store?.menu !== d?.menu;
            const hasChangeSidebar = this.store?.sidebar !== d?.sidebar;

            this.store = d;

            if (
                hasChangeTheme ||
                hasChangeLayout ||
                hasChangeMenu ||
                hasChangeSidebar ||
                !this.adaSparklineOptions
            ) {
                if (this.isLoading || hasChangeTheme) {
                    this.initChartsFromData();
                } else {
                    setTimeout(() => this.initChartsFromData(), 300);
                }
            }
        });
    }

    initChartsFromData(): void {
        const isDark =
            this.store?.theme === 'dark' || this.store?.isDarkMode ? true : false;

        const adaSeries =
            this.summary?.allAda?.length && this.summary.allAda.some((n) => n != null)
                ? this.summary.allAda.map((n) => Number(n))
                : [90, 91, 90, 92, 91, 90, 92];

        this.adaSparklineOptions = {
            chart: {
                type: 'line',
                height: 100,
                sparkline: { enabled: true },
                parentHeightOffset: 0,
            },
            stroke: {
                curve: 'smooth',
                width: 2,
            },
            colors: ['#00ab55'],
            series: [{ name: 'ADA', data: adaSeries }],
            tooltip: {
                fixed: { enabled: false },
                x: { show: false },
                y: {
                    formatter: (val: number) =>
                        val != null && Number.isFinite(Number(val))
                            ? `${Number(val).toFixed(2)}%`
                            : '—',
                    title: {
                        formatter: function () {
                            return '';
                        },
                    },
                },
                marker: { show: false },
            },
        };

        const categories =
            this.monthlyStats.length > 0
                ? this.monthlyStats.map((m) => m.month ?? '—')
                : ['—'];
        const pctSeries =
            this.monthlyStats.length > 0
                ? this.monthlyStats.map((m) =>
                      m.averageAdaPct != null ? Number(m.averageAdaPct) : 0,
                  )
                : [0];
        const dollarSeries =
            this.monthlyStats.length > 0
                ? this.monthlyStats.map((m) =>
                      m.estimatedMissedFinance != null ? Number(m.estimatedMissedFinance) : 0,
                  )
                : [0];

        const maxDollar = Math.max(...dollarSeries, 1);

        this.monthlyAdaChartPayload = {
            categories,
            pctSeries,
            dollarSeries,
            maxDollar,
        };
        this.renderMonthlyAdaChart(isDark);
        queueMicrotask(() => this.attachMonthlyAdaResizeObserver());
        this.buildCampusMissedChart();

        const map = this.categoryAdaMap ?? {};
        const keys = Object.keys(map).sort(
            (a, b) => this.categorySortRank(a) - this.categorySortRank(b) || a.localeCompare(b),
        );
        const fallbackLabels = ['Elementary School', 'Middle School', 'High School'];
        const palette = ['#2A9D8F', '#e7515a', '#00ab55'];
        const monthLabels = this.categorySparkMonthLabels(
            keys.reduce((max, k) => Math.max(max, map[k]?.length ?? 0), 0) || 8,
        );

        this.categorySparkSlots = [0, 1, 2].map((i) => {
            const key = keys[i];
            const raw = key && map[key]?.length ? map[key]! : [0];
            const data = this.normalizeCategoryAdaSeries(raw);
            const label = key ? this.formatCategoryTitle(key) : fallbackLabels[i];
            const latest = data.length ? data[data.length - 1] : null;
            const slotMonthLabels = monthLabels.slice(0, data.length);
            return {
                key: key ?? `fallback-${i}`,
                title: label,
                latestAdaDisplay: this.formatAdaPercent(latest),
                sparklineOptions: {
                    chart: {
                        type: 'area',
                        height: CATEGORY_SPARKLINE_HEIGHT_PX,
                        sparkline: { enabled: true },
                        parentHeightOffset: 0,
                    },
                    colors: [palette[i]],
                    stroke: { curve: 'smooth', width: 2 },
                    fill: {
                        type: 'gradient',
                        gradient: {
                            shadeIntensity: 1,
                            inverseColors: false,
                            opacityFrom: 0.45,
                            opacityTo: 0.05,
                            stops: [20, 100],
                        },
                    },
                    series: [{ name: label, data }],
                    tooltip: {
                        theme: isDark ? 'dark' : 'light',
                        x: {
                            formatter: (_val: number, opts?: { dataPointIndex?: number }) =>
                                slotMonthLabels[opts?.dataPointIndex ?? 0] ?? '',
                        },
                        y: {
                            formatter: (val: number) => this.formatAdaPercent(val),
                        },
                    },
                },
            };
        });
    }

    /** Month labels for category spark tooltips (matches monthly-stats order). */
    private categorySparkMonthLabels(dataLength: number): string[] {
        const fromStats =
            this.monthlyStats.length > 0
                ? this.monthlyStats.map((m) => m.month?.trim() || '—')
                : [...this.lowAdaMonthNames];
        if (dataLength <= fromStats.length) {
            return fromStats.slice(0, dataLength);
        }
        const out = [...fromStats];
        while (out.length < dataLength) {
            out.push(this.lowAdaMonthNames[out.length] ?? `Month ${out.length + 1}`);
        }
        return out;
    }

    /** API may return 0–1 ratios or 0–100 percentages; normalize to chart-friendly %. */
    private normalizeCategoryAdaSeries(values: number[]): number[] {
        if (!values.length) {
            return [0];
        }
        const nums = values.map((v) => (Number.isFinite(Number(v)) ? Number(v) : 0));
        const max = Math.max(...nums.map((n) => Math.abs(n)));
        const scale = max > 0 && max <= 1.5 ? 100 : 1;
        return nums.map((n) => Math.round(n * scale * 10) / 10);
    }

    private formatAdaPercent(val: number | null | undefined): string {
        if (val == null || !Number.isFinite(Number(val))) {
            return '—';
        }
        const n = Number(val);
        if (Math.abs(n) < 0.05) {
            return '0%';
        }
        return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
    }

    /**
     * Matches campus-category chart layout: full-width plot, empty category pads
     * center the real months, fixed bar-pair width inside each slot.
     */
    private buildGroupedBarLayout(
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
        const pad = AttendanceSummaryPageComponent.BAR_CHART_PAD_PX;
        const slot = AttendanceSummaryPageComponent.BAR_SLOT_PX;
        const groupPx = AttendanceSummaryPageComponent.BAR_GROUP_PX;
        const container =
            containerWidthPx > 0
                ? containerWidthPx
                : AttendanceSummaryPageComponent.BAR_DEFAULT_CONTAINER_PX;

        const naturalWidth = pad + Math.max(n, 1) * slot;

        if (naturalWidth > container) {
            return {
                chartWidth: naturalWidth,
                columnWidthPct: Math.round((groupPx * 100) / slot),
                useScroll: true,
                scrollWidth: naturalWidth,
                leftPad: 0,
                rightPad: 0,
            };
        }

        const fitSlots = Math.max(n, Math.floor(Math.max(container - pad, slot) / slot));
        const extra = Math.max(0, fitSlots - n);
        const leftPad = Math.floor(extra / 2);
        const rightPad = extra - leftPad;
        // Keep pair width ~BAR_GROUP_PX even when leftover px widens slots slightly.
        const totalSlots = Math.max(n + leftPad + rightPad, 1);
        const actualSlot = Math.max(container - pad, slot) / totalSlots;
        const columnWidthPct = Math.max(
            8,
            Math.min(95, Math.round((groupPx * 100) / actualSlot)),
        );

        return {
            chartWidth: '100%',
            columnWidthPct,
            useScroll: false,
            scrollWidth: 0,
            leftPad,
            rightPad,
        };
    }

    private attachMonthlyAdaResizeObserver(): void {
        const el = this.monthlyAdaChartContainer?.nativeElement;
        if (!el || !this.monthlyAdaChartPayload) {
            return;
        }

        this.monthlyAdaResizeObserver?.disconnect();
        this.monthlyAdaResizeObserver = new ResizeObserver((entries) => {
            const w = Math.round(entries[0]?.contentRect.width ?? 0);
            if (w > 0 && Math.abs(w - this.monthlyAdaContainerWidthPx) >= 8) {
                this.monthlyAdaContainerWidthPx = w;
                this.renderMonthlyAdaChart();
            }
        });
        this.monthlyAdaResizeObserver.observe(el);

        const applyWidth = (w: number) => {
            if (w > 0 && w !== this.monthlyAdaContainerWidthPx) {
                this.monthlyAdaContainerWidthPx = w;
                this.renderMonthlyAdaChart();
            }
        };
        applyWidth(Math.round(el.getBoundingClientRect().width));
        // Remeasure after layout — first paint can report 0 / stale width.
        requestAnimationFrame(() => {
            applyWidth(Math.round(el.getBoundingClientRect().width));
        });
    }

    private renderMonthlyAdaChart(isDark?: boolean): void {
        const payload = this.monthlyAdaChartPayload;
        if (!payload) {
            return;
        }

        const dark =
            isDark ??
            (this.store?.theme === 'dark' || this.store?.isDarkMode ? true : false);
        const n = payload.categories.length;
        const layout = this.buildGroupedBarLayout(n, this.monthlyAdaContainerWidthPx);
        const layoutKey = `${this.monthlyAdaContainerWidthPx}|${n}|${layout.useScroll}|${layout.leftPad}|${layout.rightPad}|${layout.columnWidthPct}`;
        if (layoutKey === this.lastMonthlyAdaLayoutKey && this.monthlyAdaOptions) {
            return;
        }
        this.lastMonthlyAdaLayoutKey = layoutKey;
        this.useMonthlyAdaHorizontalScroll = layout.useScroll;
        this.monthlyAdaScrollWidth = layout.scrollWidth;

        const blankCats = (count: number) => Array.from({ length: count }, () => '');
        const blankVals = (count: number) =>
            Array.from({ length: count }, () => null as number | null);
        const categories = [
            ...blankCats(layout.leftPad),
            ...payload.categories,
            ...blankCats(layout.rightPad),
        ];
        const pctSeries: Array<number | null> = [
            ...blankVals(layout.leftPad),
            ...payload.pctSeries,
            ...blankVals(layout.rightPad),
        ];
        const dollarSeries: Array<number | null> = [
            ...blankVals(layout.leftPad),
            ...payload.dollarSeries,
            ...blankVals(layout.rightPad),
        ];

        this.monthlyAdaOptions = {
            chart: {
                height: 350,
                type: 'bar',
                toolbar: { show: false },
                width: layout.chartWidth,
                parentHeightOffset: 0,
                offsetX: 0,
                offsetY: 0,
            },
            colors: ['#285c92', '#86aee0'],
            dataLabels: {
                enabled: true,
                enabledOnSeries: [0, 1],
                style: {
                    colors: ['#000', '#000'],
                },
                formatter: function (val: number, opt: { seriesIndex: number }) {
                    if (val == null || !Number.isFinite(Number(val))) {
                        return '';
                    }
                    if (opt.seriesIndex === 0) {
                        return `${Number(val).toFixed(2)}%`;
                    }
                    return '$' + Math.round(val).toLocaleString();
                },
                offsetY: -20,
            },
            stroke: {
                show: false,
            },
            series: [
                { name: 'Attendance %', data: pctSeries },
                { name: '$ Missed', data: dollarSeries },
            ],
            xaxis: {
                categories,
                axisBorder: { show: true, color: '#e0e6ed' },
                axisTicks: { show: true, color: '#e0e6ed' },
                labels: {
                    rotate: 0,
                    rotateAlways: false,
                    hideOverlappingLabels: false,
                    trim: false,
                    formatter: (val: string) => val || '',
                },
            },
            yaxis: [
                {
                    min: 0,
                    max: 100,
                    tickAmount: 10,
                    labels: {
                        formatter: function (val: number) {
                            return val.toFixed(0) + '%';
                        },
                    },
                },
                {
                    opposite: true,
                    min: 0,
                    max: payload.maxDollar,
                    tickAmount: 10,
                    labels: {
                        formatter: function (val: number) {
                            return '$' + Math.round(val).toLocaleString();
                        },
                    },
                },
            ],
            legend: {
                show: true,
                position: 'bottom',
                horizontalAlign: 'center',
            },
            plotOptions: {
                bar: {
                    horizontal: false,
                    columnWidth: `${layout.columnWidthPct}%`,
                    dataLabels: {
                        position: 'top',
                    },
                },
            },
            grid: {
                borderColor: dark ? '#191e3a' : '#e0e6ed',
                padding: {
                    top: 12,
                    right: 12,
                    bottom: 4,
                    left: 12,
                },
            },
            tooltip: {
                theme: dark ? 'dark' : 'light',
                shared: true,
                intersect: false,
                y: {
                    formatter: (val: number, opts?: { seriesIndex?: number }) => {
                        if (val == null || !Number.isFinite(Number(val))) {
                            return '—';
                        }
                        if (opts?.seriesIndex === 1) {
                            return `$${Math.round(Number(val)).toLocaleString()}`;
                        }
                        return `${Number(val).toFixed(2)}%`;
                    },
                },
            },
        };
        this.cdr.markForCheck();
    }

    private formatCategoryTitle(compactKey: string): string {
        const raw = compactKey.replace(/_/g, ' ').trim();
        const folded = raw.replace(/\s/g, '').toLowerCase();
        const known: { match: string; label: string }[] = [
            { match: 'earlychildhoodacademy', label: 'Early Childhood Academy' },
            { match: 'earlychildhood', label: 'Early Childhood' },
            { match: 'elementaryschool', label: 'Elementary School' },
            { match: 'elementary', label: 'Elementary School' },
            { match: 'highschool', label: 'High School' },
            { match: 'middleschool', label: 'Middle School' },
        ];
        for (const entry of known) {
            if (folded.includes(entry.match)) {
                return entry.label;
            }
        }
        return raw.replace(/([a-z])([A-Z])/g, '$1 $2');
    }

    private categorySortRank(name: string): number {
        const folded = name.replace(/_/g, '').toLowerCase();
        if (folded.includes('earlychildhood')) {
            return 0;
        }
        if (folded.includes('elementary')) {
            return 1;
        }
        if (folded.includes('highschool') || (folded.includes('high') && !folded.includes('childhood'))) {
            return 2;
        }
        if (folded.includes('middle')) {
            return 3;
        }
        return 99;
    }

    lowestAdaBarWidth(pct: number | undefined): number {
        if (pct == null || Number.isNaN(+pct)) {
            return 15;
        }
        return Math.min(100, Math.max(8, Number(pct)));
    }

    /** Three distinct colors for the Lowest ADA rows (cycles if more than 3). */
    lowestAdaBarColor(index: number): string {
        const colors = ['#e7515a', '#e2a03f', '#2A9D8F'];
        return colors[((index % colors.length) + colors.length) % colors.length];
    }

    private buildCampusMissedChart(): void {
        const ranked = [...this.campusWise]
            .filter((c) => (c.campusName ?? '').trim().length > 0)
            .sort(
                (a, b) =>
                    Number(b.estimatedMissedFinance ?? 0) - Number(a.estimatedMissedFinance ?? 0),
            );

        this.campusMissedChartRows = ranked;
        if (!ranked.length) {
            this.campusMissedChart = null;
            return;
        }

        const categories = ranked.map((c) => c.campusName?.trim() || '—');
        const values = ranked.map((c) => Number(c.estimatedMissedFinance ?? 0));
        const colors = ranked.map((c) => this.campusAdaBandColor(c.averageAdaPct));
        const height = Math.max(220, ranked.length * 42 + 48);
        const component = this;

        this.campusMissedChart = {
            chart: {
                type: 'bar',
                height,
                toolbar: { show: false },
                parentHeightOffset: 0,
                fontFamily: 'Comfortaa, sans-serif',
                events: {
                    click: (
                        _event: MouseEvent,
                        _chartContext: unknown,
                        config: { dataPointIndex?: number },
                    ) => {
                        const idx = config?.dataPointIndex ?? -1;
                        if (idx < 0) {
                            return;
                        }
                        component.ngZone.run(() => component.openCampusMissedFromChart(idx));
                    },
                },
            },
            plotOptions: {
                bar: {
                    horizontal: true,
                    distributed: true,
                    barHeight: '62%',
                    borderRadius: 4,
                    dataLabels: { position: 'top' },
                },
            },
            colors,
            dataLabels: {
                enabled: true,
                textAnchor: 'start',
                offsetX: 6,
                formatter: (val: number) => this.formatMissedDollars(val),
                style: {
                    fontSize: '11px',
                    fontWeight: 600,
                    colors: ['#0e1726'],
                },
            },
            stroke: { width: 0 },
            series: [{ name: '$ Missed', data: values }],
            xaxis: {
                categories,
                labels: {
                    formatter: (val: string | number) => this.formatMissedDollars(Number(val)),
                    style: { fontSize: '11px' },
                },
            },
            yaxis: {
                labels: {
                    maxWidth: 160,
                    style: { fontSize: '11px', fontWeight: 600 },
                },
            },
            grid: {
                borderColor: '#e2e8f0',
                strokeDashArray: 3,
                xaxis: { lines: { show: true } },
                yaxis: { lines: { show: false } },
                padding: { top: 0, right: 28, bottom: 0, left: 8 },
            },
            legend: { show: false },
            tooltip: {
                y: {
                    formatter: (val: number, opts?: { dataPointIndex?: number }) => {
                        const row = ranked[opts?.dataPointIndex ?? -1];
                        const ada =
                            row?.averageAdaPct != null && Number.isFinite(Number(row.averageAdaPct))
                                ? `${Number(row.averageAdaPct).toFixed(1)}% ADA`
                                : 'ADA —';
                        const absent =
                            row?.numberStudentAbsent != null
                                ? `${row.numberStudentAbsent} absent`
                                : 'absent —';
                        return `${this.formatMissedDollars(val)} · ${ada} · ${absent}`;
                    },
                },
            },
        };
    }

    private openCampusMissedFromChart(dataPointIndex: number): void {
        const campus = this.campusMissedChartRows[dataPointIndex];
        if (!campus) {
            return;
        }
        this.openAttendanceRecords(campus);
    }

    private campusAdaBandColor(adaPct: number | null | undefined): string {
        const n = adaPct == null ? NaN : Number(adaPct);
        if (!Number.isFinite(n)) {
            return '#64748b';
        }
        if (n >= 95) {
            return '#00ab55';
        }
        if (n >= 90) {
            return '#e2a03f';
        }
        return '#e7515a';
    }

    private formatMissedDollars(val: number): string {
        if (val == null || !Number.isFinite(Number(val))) {
            return '—';
        }
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
        }).format(Number(val));
    }
}

