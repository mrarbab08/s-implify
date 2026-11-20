import { CommonModule } from '@angular/common';
import {
    AfterViewInit,
    ChangeDetectorRef,
    Component,
    ElementRef,
    Input,
    OnChanges,
    OnDestroy,
    ViewChild,
} from '@angular/core';
import { SharedModule } from '../../../../shared/shared.module';
import type { StandardsMatrixRowVm } from './standards-matrix.models';

/** Visible student rows before vertical scroll. */
const VISIBLE_STUDENT_ROWS = 10;
const MATRIX_ROW_HEIGHT_PX = 32;
const MATRIX_HEAD_HEIGHT_PX = 36;
const CHART_TITLE_HEIGHT_PX = 28;

@Component({
    selector: 'app-standards-matrix',
    templateUrl: './standards-matrix.component.html',
    standalone: true,
    imports: [CommonModule, SharedModule],
    styles: [
        `
            .standards-matrix-table-scroll {
                overflow: auto;
            }
            .standards-matrix-table-scroll table {
                width: max-content;
                min-width: 100%;
            }
            .standards-matrix-chart-plot {
                min-height: 0;
            }
        `,
    ],
})
export class StandardsMatrixComponent implements OnChanges, AfterViewInit, OnDestroy {
    /**
     * Horizontal bars: standard names run down the left, bars extend rightward.
     * Fixed bar thickness + slot so bars never shrink; vertical scroll when many.
     */
    private static readonly BAR_GROUP_PX = 16;
    private static readonly BAR_SLOT_PX = 30;
    private static readonly BAR_CHART_PAD_PX = 40;
    private static readonly BAR_DEFAULT_CONTAINER_PX = 328;

    @Input() title = 'Standards Matrix';
    @Input() standardCodes: string[] = [];
    @Input() matrixRows: StandardsMatrixRowVm[] = [];
    @Input() classAveragePercents: number[] = [];

    standardSortColumnIndex: number | null = null;
    standardSortDir: 'neutral' | 'asc' | 'desc' = 'neutral';

    @ViewChild('tableScrollHost') tableScrollHost?: ElementRef<HTMLElement>;
    @ViewChild('classAvgChartContainer') classAvgChartContainer?: ElementRef<HTMLElement>;

    /** Right column: class average by standard — distributed colors, 0–100% on X. */
    chartOptions: any;
    useClassAvgVerticalScroll = false;
    classAvgScrollHeight = 0;

    readonly matrixPanelHeightPx =
        MATRIX_HEAD_HEIGHT_PX + VISIBLE_STUDENT_ROWS * MATRIX_ROW_HEIGHT_PX;

    chartPlotHeight = this.matrixPanelHeightPx - CHART_TITLE_HEIGHT_PX;

    private heightResizeObserver?: ResizeObserver;
    private chartResizeObserver?: ResizeObserver;
    private chartContainerWidthPx = 0;
    private lastChartLayoutKey = '';
    private chartPayload: { categories: string[]; values: number[] } | null = null;

    constructor(private cdr: ChangeDetectorRef) {}

    ngOnChanges(): void {
        this.standardSortColumnIndex = null;
        this.standardSortDir = 'neutral';
        this.lastChartLayoutKey = '';
        this.prepareChartPayload();
        this.buildChartOptions();
        queueMicrotask(() => {
            this.syncChartHeight();
            this.attachChartResizeObserver();
        });
    }

    ngAfterViewInit(): void {
        this.syncChartHeight();
        this.attachChartResizeObserver();
        const el = this.tableScrollHost?.nativeElement;
        if (el && typeof ResizeObserver !== 'undefined') {
            this.heightResizeObserver = new ResizeObserver(() => this.syncChartHeight());
            this.heightResizeObserver.observe(el);
        }
    }

    ngOnDestroy(): void {
        this.heightResizeObserver?.disconnect();
        this.chartResizeObserver?.disconnect();
    }

    /** Heat-map style cells from PDF reference. */
    cellToneClass(pct: number): string {
        if (pct >= 80) {
            return 'bg-emerald-200/90 text-emerald-950 dark:bg-emerald-900/50 dark:text-emerald-100';
        }
        if (pct >= 50) {
            return 'bg-amber-200/90 text-amber-950 dark:bg-amber-900/40 dark:text-amber-100';
        }
        return 'bg-rose-200/90 text-rose-950 dark:bg-rose-900/40 dark:text-rose-100';
    }

    get sortedMatrixRows(): StandardsMatrixRowVm[] {
        if (this.standardSortDir === 'neutral' || this.standardSortColumnIndex == null) {
            return this.matrixRows;
        }
        const columnIndex = this.standardSortColumnIndex;
        return [...this.matrixRows].sort((a, b) => {
            const left = a.standardPercents[columnIndex] ?? 0;
            const right = b.standardPercents[columnIndex] ?? 0;
            return this.standardSortDir === 'asc' ? left - right : right - left;
        });
    }

    toggleStandardSort(columnIndex: number): void {
        if (this.standardSortColumnIndex === columnIndex) {
            this.standardSortDir =
                this.standardSortDir === 'neutral'
                    ? 'asc'
                    : this.standardSortDir === 'asc'
                      ? 'desc'
                      : 'neutral';
            if (this.standardSortDir === 'neutral') {
                this.standardSortColumnIndex = null;
            }
        } else {
            this.standardSortColumnIndex = columnIndex;
            this.standardSortDir = 'asc';
        }
    }

    standardColumnAriaSort(columnIndex: number): 'none' | 'ascending' | 'descending' {
        if (this.standardSortColumnIndex !== columnIndex || this.standardSortDir === 'neutral') {
            return 'none';
        }
        return this.standardSortDir === 'asc' ? 'ascending' : 'descending';
    }

    private syncChartHeight(): void {
        const tableEl = this.tableScrollHost?.nativeElement;
        if (!tableEl) {
            return;
        }
        const next = Math.max(tableEl.clientHeight - CHART_TITLE_HEIGHT_PX, 180);
        if (next !== this.chartPlotHeight) {
            this.chartPlotHeight = next;
            this.lastChartLayoutKey = '';
            this.buildChartOptions();
            this.cdr.markForCheck();
        }
    }

    private prepareChartPayload(): void {
        if (!this.classAveragePercents.length) {
            this.chartPayload = null;
            return;
        }
        const n = this.classAveragePercents.length;
        this.chartPayload = {
            categories: this.standardCodes.slice(0, n),
            values: this.classAveragePercents.map((p) =>
                Math.min(100, Math.max(0, Number(p) || 0)),
            ),
        };
    }

    /**
     * Height-driven layout for horizontal bars: fixed bar thickness + vertical slot.
     * Fits inside the panel height (centered) or grows taller and scrolls vertically.
     */
    private buildClassAvgLayout(
        n: number,
        availableHeightPx: number,
    ): {
        chartHeight: number;
        barHeightPct: number;
        useScroll: boolean;
        scrollHeight: number;
        topPad: number;
        bottomPad: number;
    } {
        const pad = StandardsMatrixComponent.BAR_CHART_PAD_PX;
        const slot = StandardsMatrixComponent.BAR_SLOT_PX;
        const groupPx = StandardsMatrixComponent.BAR_GROUP_PX;
        const container =
            availableHeightPx > 0
                ? availableHeightPx
                : StandardsMatrixComponent.BAR_DEFAULT_CONTAINER_PX;

        const naturalHeight = pad + Math.max(n, 1) * slot;

        if (naturalHeight > container) {
            return {
                chartHeight: naturalHeight,
                barHeightPct: Math.round((groupPx * 100) / slot),
                useScroll: true,
                scrollHeight: naturalHeight,
                topPad: 0,
                bottomPad: 0,
            };
        }

        const fitSlots = Math.max(n, Math.floor(Math.max(container - pad, slot) / slot));
        const extra = Math.max(0, fitSlots - n);
        const topPad = Math.floor(extra / 2);
        const bottomPad = extra - topPad;
        const totalSlots = Math.max(n + topPad + bottomPad, 1);
        const actualSlot = Math.max(container - pad, slot) / totalSlots;
        const barHeightPct = Math.max(
            8,
            Math.min(90, Math.round((groupPx * 100) / actualSlot)),
        );

        return {
            chartHeight: container,
            barHeightPct,
            useScroll: false,
            scrollHeight: 0,
            topPad,
            bottomPad,
        };
    }

    private attachChartResizeObserver(): void {
        const el = this.classAvgChartContainer?.nativeElement;
        if (!el || !this.chartPayload) {
            return;
        }

        this.chartResizeObserver?.disconnect();
        this.chartResizeObserver = new ResizeObserver((entries) => {
            const w = Math.round(entries[0]?.contentRect.width ?? 0);
            if (w > 0 && Math.abs(w - this.chartContainerWidthPx) >= 8) {
                this.chartContainerWidthPx = w;
                this.buildChartOptions();
            }
        });
        this.chartResizeObserver.observe(el);

        const applyWidth = (w: number) => {
            if (w > 0 && w !== this.chartContainerWidthPx) {
                this.chartContainerWidthPx = w;
                this.buildChartOptions();
            }
        };
        applyWidth(Math.round(el.getBoundingClientRect().width));
        requestAnimationFrame(() => {
            applyWidth(Math.round(el.getBoundingClientRect().width));
        });
    }

    private buildChartOptions(): void {
        const payload = this.chartPayload;
        if (!payload?.categories.length) {
            this.chartOptions = undefined;
            this.useClassAvgVerticalScroll = false;
            this.classAvgScrollHeight = 0;
            return;
        }

        const n = payload.categories.length;
        const layout = this.buildClassAvgLayout(n, this.chartPlotHeight);
        const layoutKey = `${this.chartContainerWidthPx}|${n}|${this.chartPlotHeight}|${layout.useScroll}|${layout.topPad}|${layout.bottomPad}|${layout.barHeightPct}`;
        if (layoutKey === this.lastChartLayoutKey && this.chartOptions) {
            return;
        }
        this.lastChartLayoutKey = layoutKey;
        this.useClassAvgVerticalScroll = layout.useScroll;
        this.classAvgScrollHeight = layout.scrollHeight;

        const blankCats = (count: number) => Array.from({ length: count }, () => '');
        const blankVals = (count: number) =>
            Array.from({ length: count }, () => null as number | null);
        // Horizontal bars render the first category at the bottom, so pad top→end.
        const categories = [
            ...blankCats(layout.bottomPad),
            ...payload.categories,
            ...blankCats(layout.topPad),
        ];
        const values: Array<number | null> = [
            ...blankVals(layout.bottomPad),
            ...payload.values,
            ...blankVals(layout.topPad),
        ];

        this.chartOptions = {
            chart: {
                parentHeightOffset: 0,
                type: 'bar',
                toolbar: { show: false },
                height: layout.chartHeight,
                width: '100%',
            },
            dataLabels: { enabled: false },
            plotOptions: {
                bar: {
                    horizontal: true,
                    barHeight: `${layout.barHeightPct}%`,
                    distributed: true,
                    borderRadius: 4,
                },
            },
            colors: [
                '#5C7CFA',
                '#F76707',
                '#FA5252',
                '#FAB005',
                '#E8590C',
                '#94D82D',
                '#51CF66',
                '#20C997',
                '#339AF0',
                '#845EF7',
                '#FF6B6B',
            ],
            stroke: { show: false },
            grid: {
                borderColor: '#e2e8f0',
                strokeDashArray: 3,
                padding: { left: 4, right: 8, top: 0, bottom: 0 },
            },
            series: [{ name: 'Avg', data: values }],
            xaxis: {
                categories,
                min: 0,
                max: 100,
                tickAmount: 5,
                axisBorder: { show: true },
                axisTicks: { show: true },
                labels: {
                    formatter: (value: string | number) => {
                        const num = Number(value);
                        return Number.isFinite(num) ? `${Math.round(num)}%` : '';
                    },
                    style: { fontSize: '9px', colors: '#64748b' },
                },
            },
            yaxis: {
                labels: {
                    formatter: (value: string | number) => {
                        const label = value == null ? '' : String(value);
                        return label || '';
                    },
                    style: { colors: '#64748b', fontSize: '10px' },
                },
            },
            legend: { show: false },
            tooltip: {
                y: {
                    formatter: (val: number) =>
                        val == null || !Number.isFinite(Number(val))
                            ? ''
                            : `${Math.round(Number(val))}%`,
                },
            },
        };
        this.cdr.markForCheck();
    }
}
