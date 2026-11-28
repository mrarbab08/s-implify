import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { filter, finalize, take, distinctUntilChanged, map } from 'rxjs/operators';
import { Store } from '@ngrx/store';

import { NgSelectModule } from '@ng-select/ng-select';

import { DistrictContextService } from '../../core/services/district-context.service';
import { AuthService } from '../../core/services/auth.service';
import { TeachersService } from '../../core/services/teachers.service';
import type { Campus, GrowthFilters } from '../../core/models/simplify-api.model';
import { EMPTY_GROWTH_FILTERS } from '../../core/models/simplify-api.model';
import { LayoutSharedModule } from '../../shared/layout-shared.module';
import { NgxCustomModalComponent } from 'ngx-custom-modal';

/** Local working copy of growth filters; only pushed to the service when "Search" is clicked. */
type GrowthFiltersDraft = GrowthFilters;

@Component({
    selector: 'setting',
    templateUrl: './theme-customizer.component.html',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, LayoutSharedModule, NgSelectModule, NgxCustomModalComponent],
})
export class ThemeCustomizerComponent implements OnInit, OnDestroy {
    store: any;
    /** Gear + Search Filters popup only on growth dashboard / campus views. */
    showFilterGear = false;
    /** Shows a compact spinner until reference data + saved context finish loading. */
    contextToolbarLoading = true;

    @ViewChild('filtersModal')
    filtersModal?: NgxCustomModalComponent;

    /** Editable copy of dashboard "Search Filters"; applied to the service on Search. */
    filtersDraft: GrowthFiltersDraft = {
        ...EMPTY_GROWTH_FILTERS,
        grades: [],
        subjects: [],
    };

    /**
     * Selected campus for the panel's Campus dropdown (null = whole district).
     * Picked up from the current route when the panel opens; navigates on Search.
     */
    campusDraft: number | null = null;

    /** Comparison mode: the panel shows two campus pickers so the dashboard can compare. */
    comparisonMode = false;
    campusADraft: number | null = null;
    campusBDraft: number | null = null;
    comparisonError: string | null = null;

    /** Campuses for the current district, restricted to the active role's scope. */
    get campusOptions(): Campus[] {
        return this.districtContext.filterCampusesForActiveRole(this.districtContext.campuses);
    }

    /** Super Admin / District Admin — the only roles that compare whole campuses. */
    get canCompareCampuses(): boolean {
        return this.auth.isFullDistrictRole();
    }

    /** Principal / Teacher — campus is pinned to the active role, shown as fixed text. */
    get isCampusFixedForRole(): boolean {
        return this.auth.isCampusScopedRole();
    }

    /** Teacher — grade + subject are pinned to the assigned classroom. */
    get isTeacherFixedGradeSubject(): boolean {
        return this.auth.isTeacherRole();
    }

    get scopedCampus(): Campus | undefined {
        return this.districtContext.findCampusById(this.auth.scopedCampusId());
    }

    get scopedCampusLabel(): string {
        const campus = this.scopedCampus;
        if (campus) {
            return campus.campusName?.trim() || campus.campusCode;
        }
        return this.isCampusFixedForRole ? 'Your campus' : 'All Campuses (District)';
    }

    /** Assigned grade/subject of the signed-in teacher (resolved from the campus roster). */
    private teacherProfileLoading = false;
    private teacherGrade: string | null = null;
    private teacherSubject: string | null = null;
    private loadedTeacherProfileFor: number | null = null;

    get teacherGradeLabel(): string {
        if (this.teacherGrade) {
            return this.teacherGrade;
        }
        return this.teacherProfileLoading ? 'Loading…' : '—';
    }

    get teacherSubjectLabel(): string {
        if (this.teacherSubject) {
            return this.teacherSubject;
        }
        return this.teacherProfileLoading ? 'Loading…' : '—';
    }

    gradeOptions: { value: string; label: string }[] = [];
    subjectOptions: { value: string; label: string }[] = [];

    /**
     * Static option lists for filter values that don't have dedicated reference APIs.
     * Values are sent verbatim to /api/growth/* endpoints.
     */
    readonly emergentBilingualOptions = [
        { value: 'First Year of Monitoring', label: 'First Year of Monitoring' },
        { value: 'Second Year of Monitoring', label: 'Second Year of Monitoring' },
        { value: 'Currently Emergent Bilingual', label: 'Currently Emergent Bilingual' },
        {
            value: 'Other Non-Emergent Bilingual Student',
            label: 'Other Non-Emergent Bilingual Student',
        },
    ];

    readonly ethnicityOptions = [
        { value: 'Asian', label: 'Asian' },
        { value: 'American Indian/Alaskan Native', label: 'American Indian/Alaskan Native' },
        { value: 'Hispanic', label: 'Hispanic' },
        { value: 'Two or More Races', label: 'Two or More Races' },
        { value: 'Black/African American', label: 'Black/African American' },
        { value: 'Native Hawaiian/Pacific Islander', label: 'Native Hawaiian/Pacific Islander' },
        { value: 'White', label: 'White' },
    ];

    readonly testLanguageOptions = [
        { value: 'ENGLISH', label: 'English' },
        { value: 'SPANISH', label: 'Spanish' },
    ];

    readonly tristateBoolOptions: { value: boolean | null; label: string }[] = [
        { value: true, label: 'Yes' },
        { value: false, label: 'No' },
    ];

    private contextSub?: Subscription;
    private routerSub?: Subscription;
    private panelRequestSub?: Subscription;
    private comparisonRequestSub?: Subscription;

    /** Routes where growth search filters apply (district overview + campus drill-down). */
    private readonly filterGearRoutePatterns = [/^\/dashboard(\/|$)/];

    constructor(
        public storeData: Store<any>,
        public router: Router,
        readonly districtContext: DistrictContextService,
        readonly auth: AuthService,
        private teachersService: TeachersService,
        private cdr: ChangeDetectorRef,
    ) {
        this.initStore();
    }

    async initStore() {
        this.storeData
            .select((d: any) => d.index)
            .subscribe((d: any) => {
                this.store = d;
            });
    }

    ngOnInit(): void {
        this.updateFilterGearVisibility(this.router.url);
        this.routerSub = this.router.events
            .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
            .subscribe((e) => this.updateFilterGearVisibility(e.urlAfterRedirects));

        this.watchBootstrapReady();
        this.watchFilterPanelRequests();
        this.watchComparisonPanelRequests();

        /** Keep the local draft in sync if filters are changed elsewhere (e.g. Reset, restore). */
        this.contextSub = this.districtContext.growthFilters$.subscribe((f) => {
            if (!this.showCustomizerOpen) {
                this.syncFiltersDraft(f);
            }
            this.cdr.markForCheck();
        });

        this.contextSub.add(
            this.districtContext.selection$
                .pipe(
                    map((s) => s.districtId ?? null),
                    distinctUntilChanged(),
                )
                .subscribe(() => this.loadFilterReferenceData()),
        );
    }

    /** Grades, subjects and campuses for the filter gear panel. */
    private loadFilterReferenceData(): void {
        if (!this.showFilterGear || this.districtContext.selection.districtId == null) {
            return;
        }
        forkJoin([
            this.districtContext.ensureGrades(),
            this.districtContext.ensureDistrictFilterData(),
            this.districtContext.ensureDistrictCampuses(),
        ]).subscribe(() => {
            this.refreshFilterOptions();
            this.loadTeacherProfile();
            this.cdr.markForCheck();
        });
    }

    /** Resolve the active teacher's assigned grade + subject for the fixed filter fields. */
    private loadTeacherProfile(): void {
        if (!this.auth.isTeacherRole()) {
            this.teacherGrade = null;
            this.teacherSubject = null;
            this.loadedTeacherProfileFor = null;
            return;
        }
        const scope = this.auth.getActiveRoleScope();
        if (scope?.districtId == null || scope.campusId == null || scope.teacherId == null) {
            return;
        }
        if (this.loadedTeacherProfileFor === scope.teacherId) {
            return;
        }
        const campus = this.districtContext.findCampusById(scope.campusId);
        if (!campus) {
            return; // campuses still loading — retried once reference data lands
        }
        this.loadedTeacherProfileFor = scope.teacherId;
        this.teacherProfileLoading = true;
        this.teachersService
            .listTeachersByCampus(scope.districtId, campus.campusCode)
            .pipe(
                take(1),
                finalize(() => {
                    this.teacherProfileLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    const teacher = rows.find((row) => Number(row.teacherId) === scope.teacherId);
                    this.teacherGrade = teacher?.grade?.trim() || null;
                    this.teacherSubject = teacher?.subject?.trim() || null;
                },
                error: () => {
                    this.loadedTeacherProfileFor = null;
                    this.teacherGrade = null;
                    this.teacherSubject = null;
                },
            });
    }

    /**
     * Scoped roles cannot widen their scope: the campus stays pinned, and a teacher's
     * fixed grade/subject never leak in from a previously saved admin filter.
     */
    private applyRoleScopeToDraft(): void {
        if (!this.isCampusFixedForRole) {
            return;
        }
        this.campusDraft = this.auth.scopedCampusId();
        this.filtersDraft = { ...this.filtersDraft, campusId: null };
        if (this.isTeacherFixedGradeSubject) {
            this.filtersDraft.grades = [];
            this.filtersDraft.subjects = [];
        }
    }

    private syncFiltersDraft(f: GrowthFilters): void {
        this.filtersDraft = {
            ...f,
            grades: [...f.grades],
            subjects: [...f.subjects],
        };
    }

    private refreshFilterOptions(): void {
        this.gradeOptions = this.districtContext.grades.map((g) => ({
            value: g.gradeCode,
            label: g.gradeName || g.gradeCode,
        }));
        this.subjectOptions = this.districtContext.subjects.map((s) => ({
            value: s.subjectCode,
            label: s.subjectName || s.subjectCode,
        }));
    }

    ngOnDestroy(): void {
        this.contextSub?.unsubscribe();
        this.routerSub?.unsubscribe();
        this.panelRequestSub?.unsubscribe();
        this.comparisonRequestSub?.unsubscribe();
    }

    /** Campus profile uses the inline Filters panel, so its floating gear is hidden there. */
    get showFilterFab(): boolean {
        const path = this.router.url.split('?')[0].split('#')[0];
        return !/^\/dashboard\/campus\/[^/]+\/?$/.test(path);
    }

    private updateFilterGearVisibility(url: string): void {
        const path = url.split('?')[0].split('#')[0];
        if (/^\/dashboard\/campus\/[^/]+\/?$/.test(path)) {
            this.closeFiltersModal();
        }
        const visible = this.filterGearRoutePatterns.some((pattern) => pattern.test(path));
        if (this.showFilterGear === visible) {
            if (visible) {
                this.loadFilterReferenceData();
            }
            return;
        }
        this.showFilterGear = visible;
        if (!visible) {
            this.closeFiltersModal();
        } else {
            this.loadFilterReferenceData();
        }
        this.cdr.markForCheck();
    }

    /** Gear FAB click → open/close the Search Filters popup. */
    toggleCustomizer(): void {
        if (this.showCustomizerOpen) {
            this.closeFiltersModal();
            return;
        }
        this.comparisonMode = false;
        this.syncFiltersDraft(this.districtContext.growthFilters);
        this.campusDraft =
            this.currentRouteCampusId() ?? this.filtersDraft.campusId ?? null;
        this.applyRoleScopeToDraft();
        this.loadTeacherProfile();
        this.refreshFilterOptions();
        this.showCustomizerOpen = true;
        this.filtersModal?.open();
        this.cdr.markForCheck();
    }

    private closeFiltersModal(): void {
        this.showCustomizerOpen = false;
        this.filtersModal?.close();
        this.cdr.markForCheck();
    }

    /** "Campus Comparison" → reopen this same filters panel in comparison mode (extra campus-pair field). */
    openCampusComparison(): void {
        if (!this.canCompareCampuses) {
            return;
        }
        this.comparisonMode = true;
        this.comparisonError = null;
        this.syncFiltersDraft(this.districtContext.growthFilters);
        this.campusDraft = this.currentRouteCampusId() ?? this.filtersDraft.campusId ?? null;
        this.applyRoleScopeToDraft();
        this.loadTeacherProfile();
        const current = this.districtContext.campusComparison;
        this.campusADraft = current?.[0] ?? null;
        this.campusBDraft = current?.[1] ?? null;
        this.refreshFilterOptions();
        this.showCustomizerOpen = true;
        this.filtersModal?.open();
        this.cdr.markForCheck();
    }

    /** Modal closed by × button, Escape or outside click — keep our open-flag in sync. */
    onFiltersModalClosed(): void {
        this.showCustomizerOpen = false;
        this.comparisonMode = false;
        this.comparisonError = null;
        this.cdr.markForCheck();
    }

    /** True while the Search Filters popup is open (modal component owns its own backdrop). */
    private showCustomizerOpen = false;

    /** Opens the Search Filters popup on request from the campuses popup ("More filters"). */
    private watchFilterPanelRequests(): void {
        this.panelRequestSub = this.districtContext.filterPanelRequest$.subscribe(() => {
            if (!this.showCustomizerOpen) {
                this.toggleCustomizer();
            }
        });
    }

    /** Campus profile's inline panel delegates Campus Comparison to this existing modal. */
    private watchComparisonPanelRequests(): void {
        this.comparisonRequestSub = this.districtContext.comparisonPanelRequest$.subscribe(() => {
            this.openCampusComparison();
        });
    }

    /** Push the local draft to the service so dashboards re-fetch with the new filters. */
    applyFilters(): void {
        if (this.comparisonMode && this.canCompareCampuses) {
            this.applyCampusComparison();
            return;
        }
        const onCampusRoute = this.currentRouteCampusId() != null;
        const teacherScope = this.isTeacherFixedGradeSubject;
        this.districtContext.setGrowthFilters({
            ...this.filtersDraft,
            /**
             * On the district overview the campus choice filters the stats in place
             * (stored on the filters). On a campus drill-down the route already pins
             * the campus, so picking another one navigates instead. Scoped roles are
             * always pinned by their role, never by the stored filter.
             */
            campusId: this.isCampusFixedForRole || onCampusRoute ? null : this.campusDraft,
            grades: teacherScope ? [] : [...this.filtersDraft.grades],
            subjects: teacherScope ? [] : [...this.filtersDraft.subjects],
        });
        if (onCampusRoute) {
            this.applyCampusSelection();
        }
        this.closeFiltersModal();
    }

    /** Validate + push the picked campus pair; the dashboard renders the comparison panel. */
    private applyCampusComparison(): void {
        if (this.campusADraft == null || this.campusBDraft == null) {
            this.comparisonError = 'Pick two campuses to compare.';
            this.cdr.markForCheck();
            return;
        }
        if (this.campusADraft === this.campusBDraft) {
            this.comparisonError = 'Choose two different campuses.';
            this.cdr.markForCheck();
            return;
        }
        this.comparisonError = null;
        this.districtContext.setGrowthFilters({
            ...this.filtersDraft,
            campusId: null,
            grades: [...this.filtersDraft.grades],
            subjects: [...this.filtersDraft.subjects],
        });
        this.districtContext.setCampusComparison([this.campusADraft, this.campusBDraft]);
        if (this.currentRouteCampusId() != null) {
            void this.router.navigate(['/dashboard']);
        }
        this.closeFiltersModal();
    }

    /** Clear local draft + clear saved filters on the service in one go. */
    resetFilters(): void {
        this.filtersDraft = {
            ...EMPTY_GROWTH_FILTERS,
            grades: [],
            subjects: [],
        };
        this.campusDraft = null;
        if (this.comparisonMode) {
            this.campusADraft = null;
            this.campusBDraft = null;
            this.comparisonError = null;
        }
        if (this.isCampusFixedForRole) {
            this.campusDraft = this.auth.scopedCampusId();
        }
        this.districtContext.resetGrowthFilters();
    }

    /**
     * Navigate to the selected campus dashboard (or back to the district overview when
     * null). Skips navigation when the route already shows that campus — the growth
     * filters applied above already trigger a reload with the new stats.
     */
    private applyCampusSelection(): void {
        /** A scoped role can never navigate to another campus. */
        if (this.isCampusFixedForRole) {
            return;
        }
        if ((this.currentRouteCampusId() ?? null) === (this.campusDraft ?? null)) {
            return;
        }
        if (this.campusDraft == null) {
            void this.router.navigate(['/dashboard']);
            return;
        }
        const campus = this.campusOptions.find((c) => c.campusId === this.campusDraft);
        if (campus) {
            void this.router.navigate(['/dashboard/campus', this.districtContext.campusRouteSlug(campus)]);
        }
    }

    /**
     * Campus id shown by the current route (`/dashboard/campus/<slug-or-code>`),
     * matched against the loaded campus list the same way the dashboard resolves it.
     */
    private currentRouteCampusId(): number | null {
        const path = this.router.url.split('?')[0].split('#')[0];
        const match = path.match(/^\/dashboard\/campus\/([^/]+)/);
        if (!match) {
            return null;
        }
        const id = match[1].toLowerCase();
        const campus = this.campusOptions.find(
            (c) =>
                this.districtContext.campusRouteSlug(c) === id ||
                (c.campusCode || '').toLowerCase() === id,
        );
        return campus?.campusId ?? null;
    }

    private watchBootstrapReady(): void {
        if (this.districtContext.bootstrapLoaded) {
            this.contextToolbarLoading = false;
            this.loadFilterReferenceData();
            return;
        }
        this.contextToolbarLoading = true;
        this.districtContext.bootstrapReady$
            .pipe(
                filter((ready) => ready),
                take(1),
                finalize(() => {
                    this.contextToolbarLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe(() => {
                this.loadFilterReferenceData();
                this.cdr.markForCheck();
            });
    }

    /** Used by the theme store demo button — a plain full reload. */
    reloadRoute(): void {
        window.location.reload();
    }
}
