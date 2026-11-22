import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { combineLatest, of } from 'rxjs';
import {
    catchError,
    debounceTime,
    distinctUntilChanged,
    finalize,
    map,
    switchMap,
    tap,
} from 'rxjs/operators';

import { AuthService } from '../../../../core/services/auth.service';
import { DistrictContextService } from '../../../../core/services/district-context.service';
import { printReport } from '../../../../core/utils/table-export.util';
import { SharedModule } from '../../../../shared/shared.module';
import type {
    ReportData,
    ReportId,
    ReportMenuSection,
    ReportStudentOption,
} from '../../models/report.models';
import { ReportsService } from '../../services/reports.service';

@Component({
    selector: 'app-reports-page',
    standalone: true,
    imports: [CommonModule, FormsModule, SharedModule],
    templateUrl: './reports-page.component.html',
})
export class ReportsPageComponent implements OnInit {
    readonly districtContext = inject(DistrictContextService);
    readonly authService = inject(AuthService);
    private readonly reports = inject(ReportsService);
    private readonly destroyRef = inject(DestroyRef);

    /** The report list hierarchy is fixed and mirrors the portal menu structure. */
    readonly reportMenu: ReportMenuSection[] = [
        {
            label: 'ASSESSMENT REPORTS',
            groups: [
                {
                    label: 'SCHOOL',
                    items: [
                        { id: 'school', label: 'School' },
                        { id: 'classroom', label: 'Classroom' },
                        { id: 'grade', label: 'Grade' },
                        { id: 'students-consolidated', label: 'Students Consolidated' },
                    ],
                },
                {
                    label: 'DISTRICT',
                    items: [
                        { id: 'district-school', label: 'School' },
                        { id: 'district-grade', label: 'Grade' },
                    ],
                },
                {
                    items: [
                        { id: 'students-assessment', label: 'Students Assessment Report' },
                        { id: 'students-report-card', label: 'Students Report Card' },
                        { id: 'students', label: 'Students Reports' },
                        { id: 'employee-assessment', label: 'Employee Assessment Report' },
                    ],
                },
            ],
        },
    ];

    selectedId: ReportId = 'school';
    report: ReportData | null = null;
    loading = false;
    error: string | null = null;
    generatedAt = '';
    selectedStudentKey: string | null = null;

    ngOnInit(): void {
        combineLatest([this.districtContext.selection$, this.districtContext.growthFilters$])
            .pipe(
                map(([selection, filters]) => ({
                    districtId: selection.districtId,
                    academicYearId: selection.academicYearId,
                    quarterCode: selection.quarterCode,
                    campusId: filters.campusId,
                    filters: JSON.stringify(filters),
                })),
                distinctUntilChanged(
                    (a, b) =>
                        a.districtId === b.districtId &&
                        a.academicYearId === b.academicYearId &&
                        a.quarterCode === b.quarterCode &&
                        a.campusId === b.campusId &&
                        a.filters === b.filters,
                ),
                debounceTime(120),
                switchMap(() => this.refresh()),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe();
    }

    get studentOptions(): ReportStudentOption[] {
        return this.report?.studentOptions ?? [];
    }

    get visibleCampuses() {
        return this.districtContext.filterCampusesForActiveRole(this.districtContext.campuses);
    }

    get selectedCampusCode(): string | null {
        return this.reports.selectedCampus()?.campusCode ?? null;
    }

    get hasRows(): boolean {
        return !!this.report?.sections.some((section) => section.rows.length > 0);
    }

    get selectionLines(): string[] {
        const s = this.districtContext.selection;
        const state = this.districtContext.states.find((x) => x.stateId === s.stateId);
        const district = this.districtContext.districts.find((x) => x.districtId === s.districtId);
        const campus = this.reports.selectedCampus();
        const year = this.districtContext.academicYears.find(
            (x) => x.academicYearId === s.academicYearId,
        );
        return [
            `State: ${state?.stateName || '—'}`,
            `District: ${district?.districtName || '—'}`,
            `Campus: ${campus?.campusName || 'All campuses'}`,
            `Academic Year: ${year?.yearLabel || '—'}`,
            `Grading Window: ${s.quarterCode || '—'}`,
        ];
    }

    selectReport(id: ReportId): void {
        if (this.selectedId === id) {
            return;
        }
        this.selectedId = id;
        this.selectedStudentKey = null;
        this.refresh().subscribe();
    }

    onCampusChange(campusCode: string | null): void {
        const campus = this.visibleCampuses.find((c) => c.campusCode === campusCode);
        this.districtContext.setGrowthFilters({
            ...this.districtContext.growthFilters,
            campusId: campus?.campusId ?? null,
        });
    }

    onStudentChange(key: string | null): void {
        this.selectedStudentKey = key;
        this.refresh().subscribe();
    }

    print(): void {
        if (!this.report || !this.hasRows) {
            return;
        }
        printReport(
            {
                title: this.report.title,
                selection: this.selectionLines,
                generatedAt: this.generatedAt,
            },
            this.report.sections.map((section) => ({
                title: section.title,
                columns: section.columns,
                rows: section.rows,
            })),
        );
    }

    private refresh() {
        this.loading = true;
        this.error = null;
        this.generatedAt = new Date().toLocaleString();
        return this.reports.loadReport(this.selectedId, this.selectedStudentKey).pipe(
            catchError(() => {
                this.error = 'Could not load report data.';
                this.report = null;
                return of<ReportData | null>(null);
            }),
            tap((data) => {
                if (data) {
                    this.report = data;
                }
            }),
            finalize(() => {
                this.loading = false;
            }),
            map(() => undefined),
        );
    }
}
