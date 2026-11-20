import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
    ChangeDetectorRef,
    Component,
    DestroyRef,
    NgZone,
    OnInit,
    ViewChild,
} from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError, distinctUntilChanged, finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgxCustomModalComponent } from 'ngx-custom-modal';
import { DistrictContextService } from '../../../../core/services/district-context.service';
import { AttendanceAnalyticsService } from '../../../../core/services/attendance-analytics.service';
import { downloadCsv, printTable } from '../../../../core/utils/table-export.util';
import { piaBandRowClass, normalizePiaPercent } from '../../../../core/utils/score-band-row-class.util';
import type {
    IndividualAttendanceRecordItemDto,
    IndividualCampusAttendanceStatsDto,
    IndividualStudentAttendanceStatsDto,
} from '../../../../core/models/simplify-api.model';
import { SharedModule } from '../../../../shared/shared.module';

export type AttendanceTier = 'green' | 'yellow' | 'red';

export interface RankedCampusIndividualStats extends IndividualCampusAttendanceStatsDto {
    rank: number;
    tier: AttendanceTier;
}

/** Row for the Student Records modal table. */
export interface IndividualAttendanceRecordRow {
    localId: string;
    firstName: string;
    lastName: string;
    totalDaysMembership: string;
    totalDaysAbsent: string;
    totalPia: string;
}

/** Inclusive TotalPIA bounds per band (matches backend: yellow 90–95). */
const PIA_BAND_BOUNDS: Record<AttendanceTier, { piaMin?: number; piaMax?: number }> = {
    red: { piaMax: 90 },
    yellow: { piaMin: 90, piaMax: 95 },
    green: { piaMin: 95 },
};

const BAND_LABELS: Record<AttendanceTier, string> = {
    red: 'Red (<90%)',
    yellow: 'Yellow (90–95%)',
    green: 'Green (>95%)',
};

type DonutBandIndex = 0 | 1 | 2;

const DONUT_BAND_SHORT_LABELS = ['Red', 'Yellow', 'Green'] as const;

@Component({
    selector: 'app-individual-attendance-page',
    templateUrl: './individual-attendance-page.component.html',
    standalone: true,
    imports: [CommonModule, FormsModule, SharedModule],
})
export class IndividualAttendancePageComponent implements OnInit {
    readonly topTableLimit = 5;

    loading = false;
    loadError: string | null = null;

    districtStats: IndividualStudentAttendanceStatsDto | null = null;
    rankedCampuses: RankedCampusIndividualStats[] = [];
    donutCharts: Array<{
        title: string;
        prefix: string;
        campusCode: string;
        campusName: string;
        redPct: number;
        yellowPct: number;
        greenPct: number;
        selectedBandIndex: DonutBandIndex;
        chartOptions: any;
    }> = [];

    @ViewChild('studentRecordsModal')
    studentRecordsModal?: NgxCustomModalComponent;

    recordsSearch = '';
    recordsRows: IndividualAttendanceRecordRow[] = [];
    recordsLoading = false;
    selectedRecordsCampusLabel = '';
    selectedRecordsBandLabel = '';

    readonly recordCols: Array<{
        field: keyof IndividualAttendanceRecordRow;
        title: string;
        filter: boolean;
    }> = [
        { field: 'localId', title: 'Local ID', filter: true },
        { field: 'firstName', title: 'First Name', filter: true },
        { field: 'lastName', title: 'Last Name', filter: true },
        { field: 'totalDaysMembership', title: 'Days Membership', filter: true },
        { field: 'totalDaysAbsent', title: 'Days Absent', filter: true },
        { field: 'totalPia', title: 'Total PIA', filter: true },
    ];

    readonly tierColors: Record<AttendanceTier, { main: string; track: string }> = {
        green: { main: '#00ab55', track: '#ebedf2' },
        yellow: { main: '#e2a03f', track: '#ebedf2' },
        red: { main: '#e7515a', track: '#ebedf2' },
    };

    constructor(
        readonly districtContext: DistrictContextService,
        private readonly attendanceApi: AttendanceAnalyticsService,
        private readonly destroyRef: DestroyRef,
        private readonly cdr: ChangeDetectorRef,
        private readonly ngZone: NgZone,
    ) {}

    ngOnInit(): void {
        this.districtContext.selection$
            .pipe(
                distinctUntilChanged(
                    (a, b) =>
                        a.districtId === b.districtId &&
                        a.academicYearId === b.academicYearId &&
                        a.quarterCode === b.quarterCode,
                ),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe(() => {
                queueMicrotask(() => {
                    if (this.districtContext.isGrowthContextReady()) {
                        this.refresh();
                    } else {
                        this.clear();
                    }
                    this.cdr.markForCheck();
                });
            });
    }

    get topCampuses(): RankedCampusIndividualStats[] {
        return this.rankedCampuses.slice(0, this.topTableLimit);
    }

    get donutCampuses(): RankedCampusIndividualStats[] {
        return this.rankedCampuses;
    }

    /** District-level band percentages from POST /individual-attendance/student-stats. */
    get districtBandPct(): { green: number; yellow: number; red: number } {
        return {
            green: this.districtStats?.studentsScoreGreen ?? 0,
            yellow: this.districtStats?.studentsScoreYellow ?? 0,
            red: this.districtStats?.studentsScoreRed ?? 0,
        };
    }

    get tierCounts(): { green: number; yellow: number; red: number } {
        return {
            green: this.rankedCampuses.filter((c) => c.tier === 'green').length,
            yellow: this.rankedCampuses.filter((c) => c.tier === 'yellow').length,
            red: this.rankedCampuses.filter((c) => c.tier === 'red').length,
        };
    }

    roundPct(p: number): string {
        if (p == null || Number.isNaN(p)) {
            return '0%';
        }
        return `${Math.round(p)}%`;
    }

    formatBandPct(value: number | null | undefined): string {
        if (value == null || !Number.isFinite(Number(value))) {
            return '—';
        }
        return `${Number(value).toFixed(1)}%`;
    }

    get totalStudentsDisplay(): string {
        const v = this.districtStats?.totalNumberOfStudents;
        return v != null ? Number(v).toLocaleString() : '—';
    }

    get districtGreenDisplay(): string {
        return this.formatBandPct(this.districtStats?.studentsScoreGreen);
    }

    get districtRedDisplay(): string {
        return this.formatBandPct(this.districtStats?.studentsScoreRed);
    }

    get districtYellowDisplay(): string {
        return this.formatBandPct(this.districtStats?.studentsScoreYellow);
    }

    campusLabel(c: IndividualCampusAttendanceStatsDto): string {
        return (c.campusName ?? c.campusCode ?? '—').trim() || '—';
    }

    campusIcon(c: IndividualCampusAttendanceStatsDto): string {
        const name = this.campusLabel(c);
        if (name.length <= 4) {
            return name.toUpperCase();
        }
        const parts = name.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
        }
        return name.slice(0, 3).toUpperCase();
    }

    campusAvatarShellClass(tier: AttendanceTier): string {
        const shell =
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-bold shadow-md ring-2 ring-slate-300/80 dark:ring-slate-600';
        switch (tier) {
            case 'green':
                return `${shell} bg-emerald-600 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white`;
            case 'yellow':
                return `${shell} bg-amber-500 bg-gradient-to-br from-amber-400 to-amber-600 text-amber-950 dark:text-white`;
            case 'red':
                return `${shell} bg-red-600 bg-gradient-to-br from-red-500 to-rose-600 text-white`;
            default:
                return `${shell} bg-slate-600 text-white`;
        }
    }

    studentsDisplay(c: IndividualCampusAttendanceStatsDto): string {
        const v = c.totalNumberOfStudents;
        return v != null ? Number(v).toLocaleString() : '—';
    }

    get canExportRecords(): boolean {
        return this.recordsRows.length > 0 && !this.recordsLoading;
    }

    /** Row accent by Total PIA (≤89% red, 90–95% yellow, >95% green). */
    readonly totalPiaRowClass = (row: IndividualAttendanceRecordRow): string => {
        const raw = row.totalPia?.replace('%', '').trim();
        if (!raw || raw === '—') {
            return '';
        }
        const pia = Number(raw);
        return piaBandRowClass(Number.isFinite(pia) ? pia : null);
    };

    /** Opens the Student Records modal for one campus (all PIA bands). */
    openCampusAllRecords(
        campusCode: string | null | undefined,
        campusName: string,
    ): void {
        const code = (campusCode ?? '').trim();
        if (!code) {
            return;
        }
        this.selectedRecordsCampusLabel = (campusName ?? '').trim() || code;
        this.selectedRecordsBandLabel = 'All students';
        this.recordsSearch = '';
        this.recordsRows = [];
        this.studentRecordsModal?.open();
        this.loadRecords(code, null);
    }

    /** Opens the Student Records modal for one campus filtered by a PIA band. */
    openCampusBandRecords(
        campusCode: string | null | undefined,
        campusName: string,
        tier: AttendanceTier,
    ): void {
        const code = (campusCode ?? '').trim();
        if (!code) {
            return;
        }
        this.selectedRecordsCampusLabel = (campusName ?? '').trim() || code;
        this.selectedRecordsBandLabel = BAND_LABELS[tier];
        this.recordsSearch = '';
        this.recordsRows = [];
        this.studentRecordsModal?.open();
        this.loadRecords(code, tier);
    }

    exportRecords(format: 'csv' | 'print'): void {
        if (!this.canExportRecords) {
            return;
        }
        const title = `Student Records — ${this.selectedRecordsCampusLabel} (${this.selectedRecordsBandLabel})`;
        if (format === 'csv') {
            downloadCsv(
                `individual-attendance-${this.selectedRecordsCampusLabel}-${this.selectedRecordsBandLabel}`.replace(
                    /[\s()]+/g,
                    '-',
                ),
                this.recordCols,
                this.recordsRows,
            );
            return;
        }
        printTable(title, this.recordCols, this.recordsRows);
    }

    private loadRecords(campusCode: string, tier: AttendanceTier | null): void {
        const base = this.districtContext.baseGrowthPayload();
        if (!base) {
            return;
        }
        const bounds = tier != null ? PIA_BAND_BOUNDS[tier] : null;
        this.recordsLoading = true;
        this.cdr.markForCheck();
        this.attendanceApi
            .getIndividualAttendanceRecords({
                districtId: base.districtId,
                academicYearId: base.academicYearId,
                quarterCode: base.quarterCode,
                campusCode,
                ...(bounds?.piaMin != null ? { piaMin: bounds.piaMin } : {}),
                ...(bounds?.piaMax != null ? { piaMax: bounds.piaMax } : {}),
            })
            .pipe(
                catchError(() => of([] as IndividualAttendanceRecordItemDto[])),
                finalize(() => {
                    this.recordsLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe((records) => {
                this.recordsRows = records.map((r) => this.mapRecordToRow(r));
                this.cdr.markForCheck();
            });
    }

    private mapRecordToRow(r: IndividualAttendanceRecordItemDto): IndividualAttendanceRecordRow {
        const num = (v: number | undefined): string =>
            v != null && Number.isFinite(Number(v)) ? String(v) : '—';
        const piaRaw =
            r.totalPia != null && Number.isFinite(Number(r.totalPia)) ? Number(r.totalPia) : null;
        const pia =
            piaRaw != null
                ? `${Math.round(normalizePiaPercent(piaRaw) * 100) / 100}`
                : '—';
        return {
            localId: (r.localId ?? '—').trim() || '—',
            firstName: (r.firstName ?? '—').trim() || '—',
            lastName: (r.lastName ?? '—').trim() || '—',
            totalDaysMembership: num(r.totalDaysMembership),
            totalDaysAbsent: num(r.totalDaysAbsent),
            totalPia: pia,
        };
    }

    private refresh(): void {
        const base = this.districtContext.baseIndividualAttendancePayload();
        if (!base) {
            return;
        }
        this.loading = true;
        this.loadError = null;

        forkJoin({
            districtStats: this.attendanceApi.postIndividualStudentStats(base),
            campusStats: this.attendanceApi.postIndividualStudentStatsByCampus(base),
        })
            .pipe(
                finalize(() => {
                    this.loading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: ({ districtStats, campusStats }) => {
                    this.districtStats = districtStats;
                    this.rankedCampuses = this.rankByGreenBand(campusStats ?? []);
                    this.rebuildDonuts();
                    this.cdr.markForCheck();
                },
                error: (err: Error) => {
                    this.loadError = err?.message ?? 'Individual attendance data failed to load';
                    this.clear();
                    this.cdr.markForCheck();
                },
            });
    }

    private clear(): void {
        this.districtStats = null;
        this.rankedCampuses = [];
        this.donutCharts = [];
        this.loadError = null;
    }

    /** Best green band first; fewer red students as tie-breaker. */
    private rankByGreenBand(rows: IndividualCampusAttendanceStatsDto[]): RankedCampusIndividualStats[] {
        const sorted = [...rows].sort((a, b) => {
            const greenA = a.studentsScoreGreen ?? 0;
            const greenB = b.studentsScoreGreen ?? 0;
            if (greenB !== greenA) {
                return greenB - greenA;
            }
            return (a.studentsScoreRed ?? 0) - (b.studentsScoreRed ?? 0);
        });
        return sorted.map((row, i) => ({
            ...row,
            rank: i + 1,
            tier: this.dominantTier(row),
        }));
    }

    /** Dominant student band drives avatar / badge color. */
    private dominantTier(row: IndividualCampusAttendanceStatsDto): AttendanceTier {
        const red = row.studentsScoreRed ?? 0;
        const yellow = row.studentsScoreYellow ?? 0;
        const green = row.studentsScoreGreen ?? 0;
        if (green >= yellow && green >= red) {
            return 'green';
        }
        if (yellow >= red) {
            return 'yellow';
        }
        return 'red';
    }

    /** Updates the donut center label/value when a band slice is clicked. */
    onDonutBandSelect(campusCode: string, bandIndex: number): void {
        if (bandIndex < 0 || bandIndex > 2) {
            return;
        }
        const chart = this.donutCharts.find((c) => c.campusCode === campusCode);
        if (!chart || chart.selectedBandIndex === bandIndex) {
            return;
        }
        chart.selectedBandIndex = bandIndex as DonutBandIndex;
        chart.chartOptions = this.buildDonutChartOptions(chart);
        this.cdr.markForCheck();
    }

    private rebuildDonuts(): void {
        this.donutCharts = this.donutCampuses.map((school) => {
            const red = Math.max(0, Number(school.studentsScoreRed ?? 0));
            const yellow = Math.max(0, Number(school.studentsScoreYellow ?? 0));
            const green = Math.max(0, Number(school.studentsScoreGreen ?? 0));
            const chartData = {
                title: this.campusLabel(school),
                prefix: this.campusIcon(school),
                campusCode: (school.campusCode ?? '').trim(),
                campusName: this.campusLabel(school),
                redPct: red,
                yellowPct: yellow,
                greenPct: green,
                selectedBandIndex: 2 as DonutBandIndex,
                chartOptions: null as any,
            };
            chartData.chartOptions = this.buildDonutChartOptions(chartData);
            return chartData;
        });
    }

    private buildDonutChartOptions(chartData: {
        campusCode: string;
        redPct: number;
        yellowPct: number;
        greenPct: number;
        selectedBandIndex: DonutBandIndex;
    }): any {
        const palette = this.tierColors;
        const pcts = [chartData.redPct, chartData.yellowPct, chartData.greenPct];
        const bandColors = [palette.red.main, palette.yellow.main, palette.green.main];
        const idx = chartData.selectedBandIndex;
        const selectedPct = pcts[idx] ?? 0;
        const selectedLabel = DONUT_BAND_SHORT_LABELS[idx] ?? 'Green';
        const selectedColor = bandColors[idx] ?? palette.green.main;
        const total = chartData.redPct + chartData.yellowPct + chartData.greenPct;
        const series = total > 0 ? pcts : [0, 0, 1];
        const campusCode = chartData.campusCode;

        return {
            chart: {
                type: 'donut',
                height: 250,
                fontFamily: 'Comfortaa, sans-serif',
                events: {
                    dataPointSelection: (
                        _event: unknown,
                        _chartContext: unknown,
                        config: { dataPointIndex: number },
                    ) => {
                        this.ngZone.run(() => {
                            this.onDonutBandSelect(campusCode, config.dataPointIndex);
                        });
                    },
                },
            },
            dataLabels: { enabled: false },
            stroke: {
                show: true,
                width: 4,
                colors: ['transparent'],
            },
            colors: bandColors,
            legend: { show: false },
            plotOptions: {
                pie: {
                    donut: {
                        size: '75%',
                        background: 'transparent',
                        labels: {
                            show: true,
                            name: { show: false },
                            value: {
                                show: true,
                                fontSize: '22px',
                                color: selectedColor,
                                offsetY: 8,
                                formatter: () => `${selectedPct.toFixed(1)}%`,
                            },
                            total: {
                                show: true,
                                showAlways: true,
                                label: selectedLabel,
                                fontSize: '14px',
                                color: '#3b3f5c',
                                formatter: () => `${selectedPct.toFixed(1)}%`,
                            },
                        },
                    },
                },
            },
            series,
            labels: ['Red (<90%)', 'Yellow (90–95%)', 'Green (>95%)'],
        };
    }
}
