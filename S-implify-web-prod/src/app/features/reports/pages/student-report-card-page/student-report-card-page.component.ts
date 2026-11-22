import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { combineLatest } from 'rxjs';
import { distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';

import { DistrictContextService } from '../../../../core/services/district-context.service';
import { SharedModule } from '../../../../shared/shared.module';
import type { StudentReportCardData } from '../../models/student-report-card.models';
import { StudentReportCardService } from '../../services/student-report-card.service';

@Component({
    selector: 'app-student-report-card-page',
    standalone: true,
    imports: [CommonModule, RouterModule, SharedModule],
    templateUrl: './student-report-card-page.component.html',
    styles: [
        `
            :host { display: block; }
            .report-canvas {
                max-width: 980px;
                margin: 0 auto;
                padding: 12px;
                background: #f4f6f9;
                font-family: Poppins, system-ui, sans-serif;
                color: #3d4466;
            }
            .header-band {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 24px;
                background: #111a33;
                border-radius: 10px;
                padding: 12px 26px;
                color: #fff;
            }
            .header-logo { height: 46px; width: auto; display: block; }
            .header-copy h1 {
                font-family: Comfortaa, system-ui, sans-serif;
                font-size: 21px;
                font-weight: 400 !important;
                color: #fff;
                text-align: right;
                margin: 0;
            }
            .header-copy p { color: #b9c4e0; font-size: 11px; text-align: right; margin: 2px 0 0; }
            .student-strip { display: flex; align-items: center; gap: 12px; padding: 10px 6px; }
            .student-initials {
                background: #111a33;
                color: #fff;
                border-radius: 999px;
                width: 34px;
                height: 34px;
                display: grid;
                place-content: center;
                font-size: 11px;
                flex: none;
            }
            .student-line { color: #111a33; font-size: 13px; }
            .student-detail { color: #5a6080; font-size: 10px; }
            .summary-bar {
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                background: #111a33;
                border-radius: 10px;
                color: #fff;
                overflow: hidden;
            }
            .summary-cell { padding: 12px 14px; border-right: 1px solid rgba(255, 255, 255, 0.14); min-height: 74px; }
            .summary-cell:last-child { border-right: 0; }
            .summary-label { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #aebbe0; margin: 0 0 5px; }
            .summary-value { font-size: 26px !important; font-weight: 800 !important; color: #fff; line-height: 1.1; margin: 0; }
            .summary-band { font-size: 9px; color: #35c4ae; margin: 2px 0 0; }
            .change-up { color: #35c4ae !important; }
            .change-down { color: #f0a6a6 !important; }
            .growth-word { font-size: 14px; line-height: 1.2; color: #fff; margin: 0; }
            .summary-note { font-size: 9px; text-transform: uppercase; margin: 3px 0 0; letter-spacing: .04em; }
            .status-ok { color: #35c4ae !important; }
            .status-warn { color: #e7a84b !important; }
            .status-bad { color: #f08a8f !important; }
            .white-card {
                background: #fff;
                border: 1px solid #e4e7f2;
                border-radius: 12px;
                padding: 16px 20px;
                margin-top: 12px;
            }
            .comfortaa { font-family: Comfortaa, system-ui, sans-serif; font-weight: 400 !important; }
            .section-title { font-size: 14px; color: #111a33; margin: 0 0 10px; }
            .results-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
            .results-grid > div:first-child { border-right: 1px solid #eef0f6; padding-right: 20px; }
            .std-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; }
            .std-row { display: grid; grid-template-columns: 42px 1fr 34px; align-items: center; gap: 6px; font-size: 10px; }
            .bar-track { height: 7px; background: #eef0f6; border-radius: 999px; overflow: hidden; }
            .bar-fill { height: 7px; border-radius: 999px; }
            .bar-mastered { background: #8153fc; }
            .bar-developing { background: #3d91f5; }
            .bar-reteach { background: #e05252; }
            .legend-mastered { background: #8153fc; }
            .legend-developing { background: #3d91f5; }
            .legend-reteach { background: #e05252; }
            .signatures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 26px; padding: 14px 4px 4px; font-size: 10px; color: #5a6080; }
            .signatures > div > div { border-top: 1px solid #111a33; padding-top: 6px; }

            @media print {
                :host { display: block; font-size: 10px; }
                @page { size: A4 portrait; margin: 8mm; }
                .screen-only { display: none !important; }
                .report-canvas { padding: 0; background: #fff; max-width: none; }
                .header-band, .summary-bar, .bar-fill { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .header-band { padding: 8px 16px; }
                .header-logo { height: 34px; }
                .header-copy h1 { font-size: 16px; }
                .header-copy p { font-size: 9px; }
                .student-strip { padding: 6px 4px; }
                .summary-cell { padding: 8px 10px; min-height: 58px; }
                .summary-value { font-size: 19px !important; }
                .growth-word { font-size: 11px; }
                .white-card { padding: 10px 14px; margin-top: 8px; }
                .section-title { font-size: 11px; margin-bottom: 6px; }
                .results-grid { gap: 12px; }
                .std-row { font-size: 9px; }
                svg.h-32 { height: 52px !important; }
                .avoid-break { break-inside: avoid; page-break-inside: avoid; }
                .min-h-\\[6\\.5rem\\] { min-height: 48px !important; }
                .signatures { padding-top: 8px; }
            }
        `,
    ],
})
export class StudentReportCardPageComponent implements OnInit {
    private readonly route = inject(ActivatedRoute);
    private readonly ctx = inject(DistrictContextService);
    private readonly service = inject(StudentReportCardService);
    private readonly destroyRef = inject(DestroyRef);

    card: StudentReportCardData | null = null;
    loading = false;

    ngOnInit(): void {
        combineLatest([
            this.route.queryParamMap.pipe(
                map((params) => params.get('student') ?? ''),
                distinctUntilChanged(),
            ),
            this.ctx.selection$.pipe(
                map((s) => `${s.districtId}|${s.campusId}|${s.academicYearId}|${s.quarterCode}`),
                distinctUntilChanged(),
            ),
        ])
            .pipe(
                tap(() => {
                    this.loading = true;
                    this.card = null;
                }),
                switchMap(([studentKey]) =>
                    studentKey ? this.service.load(studentKey) : Promise.resolve(null),
                ),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe({
                next: (card) => {
                    this.card = card;
                    this.loading = false;
                },
                error: () => {
                    this.card = null;
                    this.loading = false;
                },
            });
    }

    /** SVG polyline points, built only from saved benchmark scores. */
    get trendPoints(): string {
        const trend = this.card?.trend ?? [];
        if (!trend.length) {
            return '';
        }
        const max = Math.max(100, ...trend.map((p) => p.score));
        const min = Math.min(0, ...trend.map((p) => p.score));
        const range = Math.max(1, max - min);
        return trend
            .map((point, index) => {
                const x = trend.length === 1 ? 50 : (index / (trend.length - 1)) * 100;
                const y = 38 - ((point.score - min) / range) * 32;
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');
    }

    get trendDots(): Array<{ x: number; y: number; score: number }> {
        const trend = this.card?.trend ?? [];
        const min = Math.min(0, ...trend.map((p) => p.score));
        const range = Math.max(1, 100 - min);
        return trend.map((point, index) => ({
            x: trend.length === 1 ? 50 : (index / (trend.length - 1)) * 100,
            y: 38 - ((point.score - min) / range) * 32,
            score: point.score,
        }));
    }

    get attendanceStatusClass(): string {
        const status = (this.card?.attendance?.status || '').toLowerCase();
        if (status.includes('track') || status.includes('on target')) return 'status-ok';
        if (status.includes('risk') || status.includes('danger')) return 'status-bad';
        return 'status-warn';
    }

    get attendanceOffset(): number {
        const pct = this.card?.attendance?.pct;
        if (pct == null || !Number.isFinite(pct)) {
            return 264;
        }
        return 264 * (1 - Math.min(100, Math.max(0, pct)) / 100);
    }

    print(): void {
        window.print();
    }
}
