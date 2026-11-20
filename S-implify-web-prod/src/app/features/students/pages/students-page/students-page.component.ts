import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { DistrictContextService } from '../../../../core/services/district-context.service';
import { scoreBandRowClass } from '../../../../core/utils/score-band-row-class.util';
import { SharedModule } from '../../../../shared/shared.module';
import type { StudentRow } from '../../models/student-table.model';
import {
    StudentsTableService,
    type StudentFilterChipId,
    type StudentListFilters,
} from '../../services/students-table.service';

/**
 * Students list backed by GET /api/student-growth-records.
 */
@Component({
    selector: 'app-students',
    standalone: true,
    imports: [CommonModule, FormsModule, SharedModule],
    templateUrl: './students-page.component.html',
})
export class StudentsPageComponent implements OnInit {
    protected readonly table = inject(StudentsTableService);
    readonly districtContext = inject(DistrictContextService);
    private readonly destroyRef = inject(DestroyRef);

    demographicFiltersExpanded = false;

    /** Row accent by component score band (≤63 red, 64–74 yellow, >74 green). */
    readonly componentScoreRowClass = (row: StudentRow): string => scoreBandRowClass(row.quarterScore);

    ngOnInit(): void {
        this.table.bindLifecycle(this.destroyRef);
        if (this.hasDemographicFilterValues(this.table.appliedFilters())) {
            this.demographicFiltersExpanded = true;
        }
    }

    get demographicFiltersOpen(): boolean {
        return this.demographicFiltersExpanded;
    }

    get appliedDemographicFilterCount(): number {
        const f = this.table.appliedFilters();
        let count = 0;
        if (f.specialEducation != null) count++;
        if (f.economicDisadvantage != null) count++;
        if (f.emergentBilingual) count++;
        if (f.testLanguage) count++;
        if (f.ethnicity) count++;
        return count;
    }

    toggleDemographicFilters(): void {
        this.demographicFiltersExpanded = !this.demographicFiltersExpanded;
    }

    onCampusDraftChange(campusCode: string | null): void {
        this.table.onCampusDraftChange(campusCode, this.destroyRef);
    }

    onGradeDraftChange(gradeCode: string | null): void {
        this.table.onGradeDraftChange(gradeCode, this.destroyRef);
    }

    onSubjectDraftChange(subjectCode: string | null): void {
        this.table.onSubjectDraftChange(subjectCode, this.destroyRef);
    }

    applyFilters(): void {
        this.table.applyFilters(this.destroyRef);
    }

    clearFilters(): void {
        this.table.clearFilters(this.destroyRef);
    }

    get visibleCampuses() {
        return this.districtContext.filterCampusesForActiveRole(this.districtContext.campuses);
    }

    get campusFilterLocked(): boolean {
        return this.visibleCampuses.length <= 1 && this.visibleCampuses.length > 0;
    }

    removeFilterChip(id: StudentFilterChipId): void {
        this.table.removeFilterChip(id, this.destroyRef);
    }

    private hasDemographicFilterValues(filters: StudentListFilters): boolean {
        return (
            filters.specialEducation != null ||
            filters.economicDisadvantage != null ||
            filters.emergentBilingual != null ||
            filters.testLanguage != null ||
            filters.ethnicity != null
        );
    }
}
