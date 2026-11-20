import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    AfterViewInit,
    ChangeDetectorRef,
    Component,
    ElementRef,
    NgZone,
    OnDestroy,
    OnInit,
    ViewChild,
} from '@angular/core';
import { forkJoin, of, Subject } from 'rxjs';
import {
    catchError,
    distinctUntilChanged,
    finalize,
    map,
    switchMap,
    takeUntil,
} from 'rxjs/operators';
import { NgxCustomModalComponent } from 'ngx-custom-modal';

import { DistrictContextService } from '../../../../core/services/district-context.service';
import { CcmrAnalyticsService } from '../../../../core/services/ccmr-analytics.service';
import { downloadCsv, printTable } from '../../../../core/utils/table-export.util';
import { SharedModule } from '../../../../shared/shared.module';
import type {
    CcmrAcademyMonthlyGradRateDto,
    CcmrAcademyMonthGradRateDto,
    CcmrAcademyRecordDto,
    CcmrAcademyStatsItemDto,
    CcmrDistrictMonthRateDto,
} from '../../../../core/models/simplify-api.model';
import { CCMR_DEFAULT_CREDIT_THRESHOLDS } from '../../../../core/models/simplify-api.model';

/** CCMR academy card + table row (live API). */
export interface CcmrAcademyVm {
    name: string;
    ccmr: string;
    grad: string;
    onTrack: string;
    likely: string;
    notLikely: string;
    students: number;
    sparklineOptions: any;
}

/** Row for Academy Records modal table. */
export interface CcmrAcademyRecordRow {
    firstName: string;
    lastName: string;
    studentId: string;
    school: string;
    credit: string;
    campus: string;
    grade: string;
    planA: string;
    planB: string;
    ccmrMet: string;
}

@Component({
    templateUrl: './ccmr-page.component.html',
    standalone: true,
    imports: [CommonModule, FormsModule, SharedModule],
    styles: [
        `
            :host ::ng-deep .ccmr-month-bar-chart .apexcharts-bar-area,
            :host ::ng-deep .ccmr-month-bar-chart .apexcharts-series path,
            :host ::ng-deep .ccmr-month-bar-chart .apexcharts-xaxis-label,
            :host ::ng-deep .ccmr-month-bar-chart .apexcharts-datalabel {
                cursor: pointer !important;
            }
        `,
    ],
})
export class CcmrPageComponent implements OnInit, AfterViewInit, OnDestroy {
        ccmrBarChart: any = null;
    useCcmrBarHorizontalScroll = false;
    ccmrBarScrollWidth = 0;
    ccmrAcademies: CcmrAcademyVm[] = [];
    ccmrLoading = false;
    ccmrError: string | null = null;
    ccmrScoreDisplay = '—';
    ccmrGradDisplay = '—';
    ccmrFocusMonth = '—';

    academyRecordsSearch = '';
    academyRecordsRows: CcmrAcademyRecordRow[] = [];
    academyRecordsLoading = false;
    academyRecordsError: string | null = null;
    selectedAcademyName = '';
    /** Month used for Academy Records modal API (may differ from dashboard focus when a bar is clicked). */
    recordsCalendarMonth = '—';

    readonly academyRecordCols: Array<{
        field: keyof CcmrAcademyRecordRow;
        title: string;
        filter: boolean;
    }> = [
        { field: 'firstName', title: 'First Name', filter: true },
        { field: 'lastName', title: 'Last Name', filter: true },
        { field: 'studentId', title: 'Student ID', filter: true },
        { field: 'school', title: 'School', filter: true },
        { field: 'credit', title: 'Credit', filter: true },
        { field: 'campus', title: 'Campus', filter: true },
        { field: 'grade', title: 'Grade', filter: true },
        { field: 'ccmrMet', title: 'CCMR Met', filter: true },
        { field: 'planA', title: 'Plan A', filter: true },
        { field: 'planB', title: 'Plan B', filter: true },
    ];

    private lastCcmrMonthlyRates: CcmrDistrictMonthRateDto[] = [];
    private lastCcmrDashboardPayload: {
        monthly: CcmrDistrictMonthRateDto[];
        academy: CcmrAcademyStatsItemDto[];
        gradTrends: CcmrAcademyMonthlyGradRateDto[];
        calendarMonth: string;
    } | null = null;

    private static readonly CCMR_GRAD_FALLBACK_MAX_MONTHS = 3;
    private static readonly CCMR_MONTH_ORDER = [
        'August',
        'September',
        'October',
        'November',
        'December',
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
    ];

    /** CCMR monthly bar chart — same sizing as Attendance Monthly ADA. */
    private static readonly CCMR_BAR_GROUP_PX = 47;
    private static readonly CCMR_BAR_MIN_SLOT_PX = 108;
    private static readonly CCMR_BAR_COLUMN_MAX_PCT = 44;
    private static readonly CCMR_BAR_COLUMN_MIN_PCT = 13;
    private static readonly CCMR_BAR_CHART_PAD_PX = 80;
    private static readonly CCMR_BAR_DEFAULT_CONTAINER_PX = 900;

    private ccmrBarChartPayload: {
        categories: string[];
        ccmrData: number[];
        gradData: number[];
    } | null = null;
    private ccmrBarResizeObserver?: ResizeObserver;
    private ccmrBarContainerWidthPx = 0;
    private lastCcmrBarLayoutKey = '';

    @ViewChild('ccmrBarChartContainer')
    ccmrBarChartContainer?: ElementRef<HTMLElement>;

    @ViewChild('academyRecordsModal')
    academyRecordsModal?: NgxCustomModalComponent;

    private readonly destroy$ = new Subject<void>();

    constructor(
        public readonly districtContext: DistrictContextService,
        private ccmrAnalytics: CcmrAnalyticsService,
        private cdr: ChangeDetectorRef,
        private ngZone: NgZone,
    ) {}

    ngOnInit(): void {
        this.districtContext
            .initialize()
            .pipe(
                takeUntil(this.destroy$),
                switchMap(() =>
                    this.districtContext.selection$.pipe(
                        distinctUntilChanged(
                            (a, b) =>
                                a.districtId === b.districtId &&
                                a.academicYearId === b.academicYearId,
                        ),
                    ),
                ),
                switchMap(() => this.loadCcmrDashboard()),
            )
            .subscribe(() => {
                this.cdr.markForCheck();
            });
    }

    ngAfterViewInit(): void {
        this.attachCcmrBarResizeObserver();
    }

    ngOnDestroy(): void {
        this.ccmrBarResizeObserver?.disconnect();
        this.destroy$.next();
        this.destroy$.complete();
    }
    trackCcmrAcademy(_index: number, ac: CcmrAcademyVm): string {
        return ac.name;
    }

    get canExportAcademyRecords(): boolean {
        return this.academyRecordsRows.length > 0 && !this.academyRecordsLoading;
    }

    /** Row accent by CCMR Met (No = red, Yes = green). */
    readonly ccmrMetRowClass = (row: CcmrAcademyRecordRow): string => {
        const met = row.ccmrMet?.trim().toLowerCase();
        if (met === 'yes' || met === 'y' || met === 'true') {
            return 'score-row-success';
        }
        if (met === 'no' || met === 'n' || met === 'false') {
            return 'score-row-danger';
        }
        return '';
    };

    openAcademyRecords(ac: CcmrAcademyVm): void {
        this.selectedAcademyName = ac.name;
        this.recordsCalendarMonth =
            this.lastCcmrDashboardPayload?.calendarMonth?.trim() ||
            this.ccmrFocusMonth?.trim() ||
            '—';
        this.academyRecordsSearch = '';
        this.academyRecordsRows = [];
        this.academyRecordsError = null;
        this.academyRecordsModal?.open();
        this.loadAcademyRecords(ac.name, this.recordsCalendarMonth);
    }

    /** Bar chart month click → records for that calendarMonth (no academyCode). */
    openMonthRecords(calendarMonth: string): void {
        const month = this.normalizeCalendarMonth(calendarMonth) || calendarMonth.trim();
        if (!month || month === '—') {
            return;
        }

        this.selectedAcademyName = 'All academies';
        this.recordsCalendarMonth = month;
        this.academyRecordsSearch = '';
        this.academyRecordsRows = [];
        this.academyRecordsError = null;
        this.academyRecordsModal?.open();
        this.loadAcademyRecords(undefined, month);
    }

    exportAcademyRecords(format: 'csv' | 'print'): void {
        if (!this.canExportAcademyRecords) {
            return;
        }
        const month = this.recordsCalendarMonth || this.ccmrFocusMonth;
        const title = `Academy Records — ${this.selectedAcademyName} (${month})`;
        if (format === 'csv') {
            downloadCsv(
                `ccmr-academy-${this.selectedAcademyName}-${month}`.replace(/\s+/g, '-'),
                this.academyRecordCols,
                this.academyRecordsRows,
            );
            return;
        }
        printTable(title, this.academyRecordCols, this.academyRecordsRows);
    }

    private loadAcademyRecords(academyCode: string | undefined, calendarMonth: string): void {
        const base = this.districtContext.baseAttendancePayload();
        if (!base) {
            this.academyRecordsError = 'District context is required.';
            return;
        }
        const month = calendarMonth?.trim();
        if (!month || month === '—') {
            this.academyRecordsError = 'No calendar month selected.';
            return;
        }

        this.academyRecordsLoading = true;
        this.academyRecordsError = null;
        const code = academyCode?.trim();
        this.ccmrAnalytics
            .getAcademyRecords({
                districtId: base.districtId,
                academicYearId: base.academicYearId,
                calendarMonth: month,
                ...(code ? { academyCode: code } : {}),
            })
            .pipe(
                takeUntil(this.destroy$),
                catchError((err) => {
                    const msg =
                        err?.error?.message ||
                        err?.message ||
                        `Could not load academy records for ${month}.`;
                    this.academyRecordsError = String(msg);
                    return of([] as CcmrAcademyRecordDto[]);
                }),
                finalize(() => {
                    this.academyRecordsLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe((records) => {
                this.academyRecordsRows = records.map((r) => this.mapAcademyRecordToRow(r, code));
                this.cdr.markForCheck();
            });
    }

    private mapAcademyRecordToRow(
        r: CcmrAcademyRecordDto,
        academyCode?: string,
    ): CcmrAcademyRecordRow {
        const met = r.ccmrMet;
        let ccmrMet = '—';
        if (met === true || met === 'true' || met === 'Y' || met === 'Yes') {
            ccmrMet = 'Yes';
        } else if (met === false || met === 'false' || met === 'N' || met === 'No') {
            ccmrMet = 'No';
        } else if (met != null && String(met).trim() !== '') {
            ccmrMet = String(met);
        }
        return {
            firstName: (r.firstName ?? '—').trim() || '—',
            lastName: (r.lastName ?? '—').trim() || '—',
            studentId: (r.studentId ?? '—').trim() || '—',
            school:
                (r.school ?? academyCode ?? this.selectedAcademyName).trim() || '—',
            credit: r.credit != null && Number.isFinite(Number(r.credit)) ? String(r.credit) : '—',
            campus: (r.campus ?? '—').trim() || '—',
            grade: (r.grade ?? '—').trim() || '—',
            planA: (r.planA ?? '—').trim() || '—',
            planB: (r.planB ?? '—').trim() || '—',
            ccmrMet,
        };
    }

    private loadCcmrDashboard() {
        if (!this.districtContext.isAttendanceContextReady()) {
            this.resetCcmrDashboard();
            return of(undefined);
        }

        const base = this.districtContext.baseAttendancePayload()!;
        const thresholds = CCMR_DEFAULT_CREDIT_THRESHOLDS;
        const thresholdBody = this.ccmrAnalytics.buildThresholdPayload(
            base.districtId,
            base.academicYearId,
            thresholds,
        );

        this.ccmrLoading = true;
        this.ccmrError = null;

        return this.ccmrAnalytics
            .postDistrictMonthlyRates({
                districtId: base.districtId,
                academicYearId: base.academicYearId,
                notLikelyCredits: thresholds.notLikelyCredits,
            })
            .pipe(
                switchMap((monthly) => {
                    const calendarMonth = this.pickLatestCcmrMonth(monthly);
                    return forkJoin({
                        monthly: of(monthly),
                        academy: this.ccmrAnalytics.postAcademyStats({
                            ...thresholdBody,
                            calendarMonth,
                        }),
                        gradTrends: this.resolveGradTrends(thresholdBody, monthly),
                        calendarMonth: of(calendarMonth),
                    });
                }),
                catchError(() => {
                    this.ccmrError = 'Could not load CCMR metrics.';
                    this.resetCcmrDashboard();
                    return of(null);
                }),
                finalize(() => {
                    this.ccmrLoading = false;
                }),
                map((result) => {
                    if (result) {
                        this.applyCcmrDashboard(result);
                    }
                }),
            );
    }

    private resetCcmrDashboard(): void {
        this.ccmrAcademies = [];
        this.ccmrBarChart = null;
        this.ccmrBarChartPayload = null;
        this.lastCcmrBarLayoutKey = '';
        this.useCcmrBarHorizontalScroll = false;
        this.ccmrBarScrollWidth = 0;
        this.ccmrScoreDisplay = '—';
        this.ccmrGradDisplay = '—';
        this.ccmrFocusMonth = '—';
        this.recordsCalendarMonth = '—';
        this.lastCcmrMonthlyRates = [];
        this.lastCcmrDashboardPayload = null;
    }

    private applyCcmrDashboard(data: {
        monthly: CcmrDistrictMonthRateDto[];
        academy: CcmrAcademyStatsItemDto[];
        gradTrends: CcmrAcademyMonthlyGradRateDto[];
        calendarMonth: string;
    }): void {
        this.lastCcmrDashboardPayload = data;
        this.lastCcmrMonthlyRates = data.monthly;
        this.ccmrFocusMonth = data.calendarMonth;

        const focusRow = data.monthly.find((m) => m.month === data.calendarMonth);
        this.ccmrScoreDisplay = this.formatCcmrPct(focusRow?.ccmrRate);
        this.ccmrGradDisplay = this.formatCcmrPct(focusRow?.gradeRate);

        const merged = this.mergeCcmrAcademyRows(data.academy, data.gradTrends);

        this.ccmrAcademies = merged.map(({ name, stat, months }) => ({
            name,
            ccmr: this.formatCcmrPctValue(stat?.ccmr),
            grad: this.formatCcmrPctValue(stat?.gradRate),
            onTrack: this.formatCcmrPctValue(stat?.onTrack),
            likely: this.formatCcmrPctValue(stat?.likely),
            notLikely: this.formatCcmrPctValue(stat?.notLikely),
            students: stat?.totalStudent ?? 0,
            sparklineOptions: this.buildAcademySparkline(
                this.resolveAcademyGradMonths(
                    name,
                    months,
                    data.gradTrends,
                    data.monthly,
                    stat,
                    data.calendarMonth,
                ),
            ),
        }));

        this.buildCcmrBarChart(data.monthly);
    }

    private normalizeCcmrSchoolKey(school?: string | null): string {
        return (school ?? '').trim().toUpperCase();
    }

    private buildGradTrendLookup(
        gradTrends: CcmrAcademyMonthlyGradRateDto[],
    ): Map<string, CcmrAcademyMonthGradRateDto[]> {
        const map = new Map<string, CcmrAcademyMonthGradRateDto[]>();
        for (const entry of gradTrends) {
            const key = this.normalizeCcmrSchoolKey(entry.school);
            if (key) {
                map.set(key, entry.months ?? []);
            }
        }
        return map;
    }

    private mergeCcmrAcademyRows(
        academy: CcmrAcademyStatsItemDto[],
        gradTrends: CcmrAcademyMonthlyGradRateDto[],
    ): Array<{
        name: string;
        stat?: CcmrAcademyStatsItemDto;
        months: CcmrAcademyMonthGradRateDto[];
    }> {
        const statsByKey = new Map<string, CcmrAcademyStatsItemDto>();
        for (const row of academy) {
            const key = this.normalizeCcmrSchoolKey(row.school);
            if (key) {
                statsByKey.set(key, row);
            }
        }

        const gradByKey = this.buildGradTrendLookup(gradTrends);
        const orderedKeys: string[] = [];
        const seen = new Set<string>();

        for (const row of academy) {
            const key = this.normalizeCcmrSchoolKey(row.school);
            if (key && !seen.has(key)) {
                seen.add(key);
                orderedKeys.push(key);
            }
        }
        for (const entry of gradTrends) {
            const key = this.normalizeCcmrSchoolKey(entry.school);
            if (key && !seen.has(key)) {
                seen.add(key);
                orderedKeys.push(key);
            }
        }

        return orderedKeys.map((key) => {
            const stat = statsByKey.get(key);
            const gradEntry = gradTrends.find(
                (g) => this.normalizeCcmrSchoolKey(g.school) === key,
            );
            return {
                name: stat?.school ?? gradEntry?.school ?? key,
                stat,
                months: gradByKey.get(key) ?? [],
            };
        });
    }

    private normalizeCalendarMonth(month?: string | null): string {
        if (!month) {
            return '';
        }
        const trimmed = month.trim();
        const match = CcmrPageComponent.CCMR_MONTH_ORDER.find(
            (m) => m.toLowerCase() === trimmed.toLowerCase(),
        );
        return match ?? trimmed;
    }

    private buildCcmrBarChart(monthly: CcmrDistrictMonthRateDto[]): void {
        const sorted = [...monthly].sort(
            (a, b) => this.ccmrMonthSortRank(a.month) - this.ccmrMonthSortRank(b.month),
        );
        this.ccmrBarChartPayload = {
            categories: sorted.map((m) => m.month ?? '—'),
            ccmrData: sorted.map((m) => Number(m.ccmrRate ?? 0)),
            gradData: sorted.map((m) => Number(m.gradeRate ?? 0)),
        };
        queueMicrotask(() => {
            this.attachCcmrBarResizeObserver();
            this.renderCcmrBarChart();
            this.cdr.markForCheck();
        });
    }

    private buildCcmrGroupedBarLayout(
        n: number,
        containerWidthPx: number,
    ): {
        chartWidth: number | '100%';
        columnWidthPct: number;
        useScroll: boolean;
        scrollWidth: number;
    } {
        const pad = CcmrPageComponent.CCMR_BAR_CHART_PAD_PX;
        const maxPct = CcmrPageComponent.CCMR_BAR_COLUMN_MAX_PCT;
        const groupPx = CcmrPageComponent.CCMR_BAR_GROUP_PX;
        const minSlot = CcmrPageComponent.CCMR_BAR_MIN_SLOT_PX;
        const container =
            containerWidthPx > 0
                ? containerWidthPx
                : CcmrPageComponent.CCMR_BAR_DEFAULT_CONTAINER_PX;

        const plotWidth = Math.max(400, container - pad);
        const fluidSlot = plotWidth / n;
        const naturalPct = (groupPx * 100) / fluidSlot;

        if (naturalPct <= maxPct) {
            return {
                chartWidth: '100%',
                columnWidthPct: Math.max(
                    CcmrPageComponent.CCMR_BAR_COLUMN_MIN_PCT,
                    Math.round(naturalPct),
                ),
                useScroll: false,
                scrollWidth: 0,
            };
        }

        const scrollWidth = Math.max(720, pad + n * minSlot);
        return {
            chartWidth: scrollWidth,
            columnWidthPct: maxPct,
            useScroll: true,
            scrollWidth,
        };
    }

    private attachCcmrBarResizeObserver(): void {
        const el = this.ccmrBarChartContainer?.nativeElement;
        if (!el || !this.ccmrBarChartPayload) {
            return;
        }

        this.ccmrBarResizeObserver?.disconnect();
        this.ccmrBarResizeObserver = new ResizeObserver((entries) => {
            const w = Math.round(entries[0]?.contentRect.width ?? 0);
            if (w > 0 && Math.abs(w - this.ccmrBarContainerWidthPx) >= 16) {
                this.ccmrBarContainerWidthPx = w;
                this.renderCcmrBarChart();
            }
        });
        this.ccmrBarResizeObserver.observe(el);

        const initialW = Math.round(el.getBoundingClientRect().width);
        if (initialW > 0 && initialW !== this.ccmrBarContainerWidthPx) {
            this.ccmrBarContainerWidthPx = initialW;
            this.renderCcmrBarChart();
        }
    }

    private renderCcmrBarChart(): void {
        const payload = this.ccmrBarChartPayload;
        if (!payload) {
            return;
        }

        const n = payload.categories.length || 1;
        const layout = this.buildCcmrGroupedBarLayout(n, this.ccmrBarContainerWidthPx);
        const layoutKey = `${this.ccmrBarContainerWidthPx}|${n}|${layout.useScroll}|${layout.columnWidthPct}`;
        if (layoutKey === this.lastCcmrBarLayoutKey && this.ccmrBarChart) {
            return;
        }
        this.lastCcmrBarLayoutKey = layoutKey;
        this.useCcmrBarHorizontalScroll = layout.useScroll;
        this.ccmrBarScrollWidth = layout.scrollWidth;

        this.ccmrBarChart = {
            chart: {
                parentHeightOffset: 0,
                type: 'bar',
                toolbar: { show: false },
                height: 350,
                width: layout.chartWidth,
                events: {
                    dataPointSelection: (
                        _event: unknown,
                        _chartContext: unknown,
                        config: { dataPointIndex?: number },
                    ) => {
                        const idx = config?.dataPointIndex ?? -1;
                        const month = payload.categories[idx];
                        if (!month) {
                            return;
                        }
                        this.ngZone.run(() => this.openMonthRecords(String(month)));
                    },
                },
            },
            colors: ['#004b80', '#56a7d6'],
            dataLabels: {
                enabled: true,
                formatter: (val: number) => `${Number(val).toFixed(1)}%`,
                offsetY: -20,
                style: { fontSize: '10px', colors: ['#304758'] },
            },
            plotOptions: {
                bar: {
                    horizontal: false,
                    columnWidth: `${layout.columnWidthPct}%`,
                    dataLabels: { position: 'top' },
                },
            },
            stroke: { show: true, width: 2, colors: ['transparent'] },
            series: [
                { name: 'CCMR Rate', data: payload.ccmrData },
                { name: 'Graduation Rate', data: payload.gradData },
            ],
            xaxis: {
                categories: payload.categories,
                axisBorder: { show: true },
                axisTicks: { show: true },
            },
            yaxis: {
                labels: {
                    formatter: (value: number) => Number(value).toFixed(2),
                },
            },
            legend: { position: 'bottom', horizontalAlign: 'center' },
            tooltip: {
                x: {
                    show: true,
                    formatter: (val: string) => val,
                },
                y: {
                    formatter: (val: number) => `${Number(val).toFixed(2)}%`,
                },
            },
        };
    }

    private resolveGradTrends(
        thresholdBody: ReturnType<CcmrAnalyticsService['buildThresholdPayload']>,
        monthly: CcmrDistrictMonthRateDto[],
    ) {
        return this.ccmrAnalytics.postAcademyGradRateByMonth(thresholdBody).pipe(
            catchError(() => of([] as CcmrAcademyMonthlyGradRateDto[])),
            switchMap((trends) => {
                if (this.hasUsableGradTrends(trends)) {
                    return of(trends);
                }

                const monthNames = this.collectCcmrMonthNames(monthly, trends);
                if (monthNames.length < 2) {
                    return of(trends);
                }

                const fallbackMonths = monthNames.slice(
                    -CcmrPageComponent.CCMR_GRAD_FALLBACK_MAX_MONTHS,
                );

                return forkJoin(
                    fallbackMonths.map((calendarMonth) =>
                        this.ccmrAnalytics
                            .postAcademyStats({ ...thresholdBody, calendarMonth })
                            .pipe(
                                map((stats) => ({ month: calendarMonth, stats })),
                                catchError(() =>
                                    of({
                                        month: calendarMonth,
                                        stats: [] as CcmrAcademyStatsItemDto[],
                                    }),
                                ),
                            ),
                    ),
                ).pipe(
                    map((snapshots) =>
                        this.mergeGradTrendSources(
                            trends,
                            this.buildGradTrendsFromMonthlyAcademyStats(snapshots),
                        ),
                    ),
                );
            }),
        );
    }

    /** Month tabs from district rates plus any month already present in grad-by-month. */
    private collectCcmrMonthNames(
        monthly: CcmrDistrictMonthRateDto[],
        trends: CcmrAcademyMonthlyGradRateDto[],
    ): string[] {
        const names = new Set<string>();
        for (const name of this.sortedDistrictMonthNames(monthly)) {
            names.add(name);
        }
        for (const entry of trends) {
            for (const m of entry.months ?? []) {
                const label =
                    this.normalizeCalendarMonth(m.calendarMonth) ||
                    String(m.calendarMonth ?? '').trim();
                if (label) {
                    names.add(label);
                }
            }
        }
        return [...names].sort(
            (a, b) => this.ccmrMonthSortRank(a) - this.ccmrMonthSortRank(b),
        );
    }

    private mergeGradTrendSources(
        primary: CcmrAcademyMonthlyGradRateDto[],
        secondary: CcmrAcademyMonthlyGradRateDto[],
    ): CcmrAcademyMonthlyGradRateDto[] {
        const schoolKeys = new Set<string>();
        for (const entry of [...primary, ...secondary]) {
            const key = this.normalizeCcmrSchoolKey(entry.school);
            if (key) {
                schoolKeys.add(key);
            }
        }

        return [...schoolKeys].map((key) => {
            const fromPrimary = primary.find(
                (e) => this.normalizeCcmrSchoolKey(e.school) === key,
            );
            const fromSecondary = secondary.find(
                (e) => this.normalizeCcmrSchoolKey(e.school) === key,
            );
            const months = this.dedupeGradMonthsByCalendar([
                ...(fromPrimary?.months ?? []),
                ...(fromSecondary?.months ?? []),
            ]);
            return {
                school: fromPrimary?.school ?? fromSecondary?.school ?? key,
                months,
            };
        });
    }

    private sortedDistrictMonthNames(monthly: CcmrDistrictMonthRateDto[]): string[] {
        return [...monthly]
            .sort(
                (a, b) => this.ccmrMonthSortRank(a.month) - this.ccmrMonthSortRank(b.month),
            )
            .map((m) => m.month?.trim() ?? '')
            .filter((m) => m.length > 0);
    }

    private hasUsableGradTrends(trends: CcmrAcademyMonthlyGradRateDto[]): boolean {
        return trends.some((entry) => {
            const months = this.dedupeGradMonthsByCalendar(entry.months ?? []);
            return months.length >= 2 && this.gradRatesHaveVariation(months);
        });
    }

    private buildGradTrendsFromMonthlyAcademyStats(
        snapshots: Array<{ month: string; stats: CcmrAcademyStatsItemDto[] }>,
    ): CcmrAcademyMonthlyGradRateDto[] {
        const bySchool = new Map<string, CcmrAcademyMonthGradRateDto[]>();

        for (const { month, stats } of snapshots) {
            const calendarMonth = this.normalizeCalendarMonth(month) || month;
            for (const row of stats) {
                const school = row.school?.trim();
                if (!school || row.gradRate == null || !Number.isFinite(Number(row.gradRate))) {
                    continue;
                }
                const bucket = bySchool.get(school) ?? [];
                bucket.push({ calendarMonth, gradRate: Number(row.gradRate) });
                bySchool.set(school, bucket);
            }
        }

        return [...bySchool.entries()].map(([school, months]) => ({ school, months }));
    }

    private resolveAcademyGradMonths(
        schoolName: string,
        mergedMonths: CcmrAcademyMonthGradRateDto[],
        gradTrends: CcmrAcademyMonthlyGradRateDto[],
        districtMonthly: CcmrDistrictMonthRateDto[],
        stat?: CcmrAcademyStatsItemDto,
        focusMonth?: string,
    ): CcmrAcademyMonthGradRateDto[] {
        const key = this.normalizeCcmrSchoolKey(schoolName);
        const direct = gradTrends.find((g) => this.normalizeCcmrSchoolKey(g.school) === key);
        const fuzzy = gradTrends.find((g) => {
            const gKey = this.normalizeCcmrSchoolKey(g.school);
            return gKey.includes(key) || key.includes(gKey);
        });

        const candidates = [
            this.dedupeGradMonthsByCalendar(mergedMonths),
            this.dedupeGradMonthsByCalendar(direct?.months ?? []),
            this.dedupeGradMonthsByCalendar(fuzzy?.months ?? []),
            this.buildDistrictGradFallbackMonths(districtMonthly),
        ];

        for (const series of candidates) {
            if (series.length) {
                return series;
            }
        }

        if (stat?.gradRate != null && Number.isFinite(Number(stat.gradRate))) {
            const month =
                this.normalizeCalendarMonth(focusMonth) ||
                String(focusMonth ?? '').trim() ||
                'Current';
            return [{ calendarMonth: month, gradRate: Number(stat.gradRate) }];
        }

        return [];
    }

    /** District monthly gradeRate — used only when an academy has no multi-month series. */
    private buildDistrictGradFallbackMonths(
        districtMonthly: CcmrDistrictMonthRateDto[],
    ): CcmrAcademyMonthGradRateDto[] {
        const rows: CcmrAcademyMonthGradRateDto[] = [];
        for (const row of [...districtMonthly].sort(
            (a, b) => this.ccmrMonthSortRank(a.month) - this.ccmrMonthSortRank(b.month),
        )) {
            const calendarMonth = this.normalizeCalendarMonth(row.month) || row.month;
            if (!calendarMonth || row.gradeRate == null || !Number.isFinite(Number(row.gradeRate))) {
                continue;
            }
            rows.push({ calendarMonth, gradRate: Number(row.gradeRate) });
        }
        return rows;
    }

    private dedupeGradMonthsByCalendar(
        months: CcmrAcademyMonthGradRateDto[],
    ): CcmrAcademyMonthGradRateDto[] {
        const byMonth = new Map<string, CcmrAcademyMonthGradRateDto>();
        for (const entry of months) {
            const label =
                this.normalizeCalendarMonth(entry.calendarMonth) ||
                String(entry.calendarMonth ?? '').trim();
            if (!label || entry.gradRate == null || !Number.isFinite(Number(entry.gradRate))) {
                continue;
            }
            byMonth.set(label, { calendarMonth: label, gradRate: Number(entry.gradRate) });
        }
        return [...byMonth.values()].sort(
            (a, b) =>
                this.ccmrMonthSortRank(a.calendarMonth) - this.ccmrMonthSortRank(b.calendarMonth),
        );
    }

    private gradRatesHaveVariation(months: CcmrAcademyMonthGradRateDto[]): boolean {
        const values = this.normalizeGradRateValues(
            months.map((m) => Number(m.gradRate)).filter((v) => Number.isFinite(v)),
        );
        if (values.length < 2) {
            return false;
        }
        const min = Math.min(...values);
        const max = Math.max(...values);
        return max - min > 0.001;
    }

    /** API may return 0–1 fractions while cards show 0–100 percentages. */
    private normalizeGradRateValues(values: number[]): number[] {
        if (!values.length) {
            return values;
        }
        const max = Math.max(...values);
        if (max > 0 && max <= 1) {
            return values.map((v) => v * 100);
        }
        return values;
    }

    private buildAcademySparkline(
        months: CcmrAcademyMonthGradRateDto[],
    ): any {
        const sorted = this.dedupeGradMonthsByCalendar(months);
        const points = sorted
            .map((m) => ({
                month:
                    this.normalizeCalendarMonth(m.calendarMonth) ||
                    m.calendarMonth?.trim() ||
                    '—',
                value: Number(m.gradRate),
            }))
            .filter((p) => Number.isFinite(p.value));

        let monthLabels = points.map((p) => p.month);
        let data = this.normalizeGradRateValues(points.map((p) => p.value));

        if (!data.length) {
            return null;
        }

        if (data.length === 1) {
            data = [data[0], data[0]];
            monthLabels = [monthLabels[0], monthLabels[0]];
        }

        return {
            chart: {
                height: 48,
                type: 'line',
                sparkline: { enabled: true },
                parentHeightOffset: 0,
                toolbar: { show: false },
                animations: { enabled: false },
            },
            stroke: {
                curve: 'straight',
                width: 2,
            },
            markers: {
                size: 0,
                hover: { size: 5, sizeOffset: 1 },
            },
            colors: ['#00ab55'],
            grid: {
                padding: { top: 4, bottom: 4, left: 0, right: 0 },
            },
            xaxis: {
                categories: monthLabels,
                labels: { show: false },
                axisBorder: { show: false },
                axisTicks: { show: false },
            },
            tooltip: {
                enabled: true,
                theme: 'dark',
                intersect: false,
                shared: false,
                x: {
                    show: true,
                    formatter: (_val: number, opts?: { dataPointIndex?: number }) =>
                        monthLabels[opts?.dataPointIndex ?? 0] ?? '',
                },
                y: {
                    title: { formatter: () => 'GRAD Rate' },
                    formatter: (val: number) => `${Number(val).toFixed(2)}%`,
                },
                marker: { show: true },
            },
            series: [{ name: 'GRAD Rate', data }],
        };
    }

    private formatCcmrPct(n: number | null | undefined): string {
        if (n == null || !Number.isFinite(Number(n))) {
            return '—';
        }
        return `${Number(n).toFixed(1)}%`;
    }

    private formatCcmrPctValue(n: number | null | undefined): string {
        if (n == null || !Number.isFinite(Number(n))) {
            return '—';
        }
        return Number(n).toFixed(1);
    }

    private pickLatestCcmrMonth(rows: CcmrDistrictMonthRateDto[]): string {
        if (!rows.length) {
            return new Date().toLocaleString('en-US', { month: 'long' });
        }
        const sorted = [...rows].sort(
            (a, b) => this.ccmrMonthSortRank(a.month) - this.ccmrMonthSortRank(b.month),
        );
        return sorted[sorted.length - 1].month ?? '—';
    }

    private ccmrMonthSortRank(name?: string): number {
        const i = CcmrPageComponent.CCMR_MONTH_ORDER.indexOf(name ?? '');
        return i >= 0 ? i : 999;
    }

}
