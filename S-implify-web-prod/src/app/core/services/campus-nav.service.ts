import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { combineLatest, forkJoin, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { AuthService } from './auth.service';
import { DistrictContextService } from './district-context.service';
import type { Campus, CampusCategory } from '../models/simplify-api.model';

interface CampusNavGroup {
    key: string;
    name: string;
    campuses: Campus[];
}

/**
 * CampusNavService — shared source of campus navigation groups
 * (campus categories grouped with their campuses) so the horizontal
 * top navbar can render the same CAMPUSES data the sidebar uses.
 */
@Injectable({ providedIn: 'root' })
export class CampusNavService {
    readonly campusNavGroups$: Observable<CampusNavGroup[]> = combineLatest([
        this.districtContext.campusCategories$,
        this.districtContext.campuses$,
    ]).pipe(map(([categories, campuses]) => this.buildCampusNavGroups(categories, campuses)));

    constructor(
        private authService: AuthService,
        readonly districtContext: DistrictContextService,
        private router: Router,
    ) {}

    /** Loads campuses + campus categories (cheap no-op when already loaded). */
    ensureLoaded(): void {
        if (!this.authService.isLoggedIn()) {
            return;
        }
        forkJoin([
            this.districtContext.ensureDistrictCampuses(),
            this.districtContext.ensureCampusCategories(),
        ]).subscribe();
    }

    campusRouteSlug(campus: Campus): string {
        return this.districtContext.campusRouteSlug(campus);
    }

    /** Groups campuses under their campus category, scoped to the active role. */
    private buildCampusNavGroups(
        categories: CampusCategory[],
        campuses: Campus[],
    ): CampusNavGroup[] {
        const scopedCampuses = this.districtContext.filterCampusesForActiveRole(campuses);
        const scopedCategories = this.districtContext.filterCategoriesForActiveRole(
            categories,
            campuses,
        );
        if (!scopedCategories.length || !scopedCampuses.length) {
            return [];
        }
        const sortedCategories = [...scopedCategories].sort((a, b) => {
            const rankA = this.categorySortRank(a.categoryName, a.categoryCode);
            const rankB = this.categorySortRank(b.categoryName, b.categoryCode);
            if (rankA !== rankB) {
                return rankA - rankB;
            }
            return (a.categoryName ?? '').localeCompare(b.categoryName ?? '');
        });
        return sortedCategories
            .map((cat) => ({
                key: `cat-${cat.campusCategoryId}`,
                name: cat.categoryName?.trim() || cat.categoryCode || 'Campuses',
                campuses: scopedCampuses
                    .filter((c) => c.campusCategoryId === cat.campusCategoryId)
                    .sort((a, b) => a.campusName.localeCompare(b.campusName)),
            }))
            .filter((g) => g.campuses.length > 0);
    }

    /** Category order: Elementary first, then Early Childhood, High, Middle. */
    private categorySortRank(name?: string, code?: string): number {
        const label = `${name ?? ''} ${code ?? ''}`.toLowerCase();
        if (label.includes('elementary')) {
            return 0;
        }
        if (label.includes('early childhood')) {
            return 1;
        }
        if (label.includes('high')) {
            return 2;
        }
        if (label.includes('middle')) {
            return 3;
        }
        return 99;
    }
}
