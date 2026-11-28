import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, forkJoin, of, Subject as RxSubject } from 'rxjs';
import {
    catchError,
    distinctUntilChanged,
    map,
    shareReplay,
    skip,
    switchMap,
    tap,
    timeout,
    finalize,
} from 'rxjs/operators';
import { FiltersService } from './filters.service';
import { AuthService } from './auth.service';
import type {
    AcademicYear,
    ActiveRoleScope,
    Campus,
    CampusCategory,
    District,
    DistrictContextSelection,
    DistrictQuarter,
    Grade,
    GrowthFilters,
    State,
    Subject,
} from '../models/simplify-api.model';
import { EMPTY_GROWTH_FILTERS, migrateGrowthFilters, normalizeGrowthFilterCodes } from '../models/simplify-api.model';
import {
    buildGrowthFilterChips,
    removeGrowthFilterChip,
    type GrowthFilterChipId,
} from '../utils/growth-filter-chips.util';

const STORAGE_KEY = 'simplify_district_context';
const FILTERS_STORAGE_KEY = 'simplify_growth_filters';
/**
 * Persisted last-good campus nav data. Seeded into the sidebar on startup so the CAMPUSES
 * section renders instantly on every reload — independent of (possibly flaky) reference APIs.
 * Categories are district-independent; campuses are kept per district.
 */
const CAMPUS_NAV_CACHE_KEY = 'simplify_campus_nav_cache';

interface CampusNavCache {
    categories: CampusCategory[];
    campusesByDistrict: Record<string, Campus[]>;
}

/** Used when district-quarter metadata APIs fail but growth POSTs still need a valid code. */
const FALLBACK_QUARTER_CODE = 'BOY';

@Injectable({ providedIn: 'root' })
export class DistrictContextService {
    readonly selection$: Observable<DistrictContextSelection>;
    readonly growthFilters$: Observable<GrowthFilters>;
    /** Emits true once reference data bootstrap completes (success or partial failure). */
    readonly bootstrapReady$: Observable<boolean>;

    private readonly selectionSubject = new BehaviorSubject<DistrictContextSelection>({
        stateId: null,
        districtId: null,
        campusId: null,
        teacherId: null,
        academicYearId: null,
        quarterCode: null,
    });

    private readonly growthFiltersSubject = new BehaviorSubject<GrowthFilters>(
        this.readStoredGrowthFilters() ?? { ...EMPTY_GROWTH_FILTERS },
    );

    /**
     * Campus pair for the dashboard "Campus Comparison" panel ([campusAId, campusBId] or null).
     * Session-only: starts as null on every page load so the comparison window does not
     * reopen from stale localStorage after a refresh.
     */
    private readonly campusComparisonSubject = new BehaviorSubject<[number, number] | null>(null);
    readonly campusComparison$ = this.campusComparisonSubject.asObservable();

    get campusComparison(): [number, number] | null {
        return this.campusComparisonSubject.value;
    }

    setCampusComparison(pair: [number, number] | null): void {
        this.campusComparisonSubject.next(pair);
    }

    /**
     * Remember the selection in effect before a district drill-down so the main
     * dashboard (`/dashboard`) can return to it afterwards. Without this, visiting
     * an empty district left the whole dashboard scoped to it (dashes everywhere).
     */
    private static readonly HOME_SELECTION_KEY = 'simplify_home_selection';

    /** Capture the current selection once, before the first drill-down of this run. */
    stashHomeSelection(): void {
        if (this.readStoredHomeSelection()) {
            return;
        }
        /**
         * Prefer the PERSISTED context: on a fresh page load the route handler runs
         * before the bootstrap resolves, so the live selection may still be the empty
         * initial value — the persisted one is the scope the user actually had.
         */
        const s = this.readStoredContext() ?? this.selectionSubject.value;
        if (s.districtId == null) {
            return;
        }
        try {
            localStorage.setItem(DistrictContextService.HOME_SELECTION_KEY, JSON.stringify(s));
        } catch {
            /* storage unavailable — nothing to restore later */
        }
    }

    /**
     * Restore the stashed pre-drilldown selection (if any and if it differs).
     * Goes through {@link setDistrictId} so quarters/campuses reload exactly like
     * a normal district switch. Returns true when the selection was switched back.
     */
    restoreHomeSelection(): boolean {
        const home = this.readStoredHomeSelection();
        if (!home || home.districtId == null) {
            if (home) {
                this.clearHomeSelection();
            }
            return false;
        }
        this.clearHomeSelection();
        const s = this.selectionSubject.value;
        const sameDistrict = s.districtId === home.districtId;
        const sameQuarter = (s.quarterCode ?? null) === (home.quarterCode ?? null);
        if (sameDistrict && sameQuarter) {
            return false;
        }
        if (!sameDistrict) {
            this.setDistrictId(home.districtId);
            if (home.academicYearId != null && home.academicYearId !== s.academicYearId) {
                this.setAcademicYearId(home.academicYearId);
            }
        }
        /**
         * Always re-establish the quarter explicitly: {@link setDistrictId} nulls it,
         * and after an in-session drill-down into a quarter-less district no bootstrap
         * / reconcile path runs again — without this the header stays "Select Quarter".
         */
        if (home.quarterCode != null && home.quarterCode !== this.selection.quarterCode) {
            this.setQuarterCode(home.quarterCode);
        }
        return true;
    }

    private clearHomeSelection(): void {
        try {
            localStorage.removeItem(DistrictContextService.HOME_SELECTION_KEY);
        } catch {
            /* ignore */
        }
    }

    private readStoredHomeSelection(): DistrictContextSelection | null {
        try {
            const raw = localStorage.getItem(DistrictContextService.HOME_SELECTION_KEY);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw) as DistrictContextSelection;
            if (parsed && typeof parsed === 'object' && 'districtId' in parsed) {
                return parsed;
            }
        } catch {
            /* ignore malformed stored state */
        }
        return null;
    }

    states: State[] = [];
    districts: District[] = [];
    /** Full district list from bootstrap; used for client-side state filtering. */
    private allDistricts: District[] = [];
    academicYears: AcademicYear[] = [];
    districtQuarters: DistrictQuarter[] = [];
    grades: Grade[] = [];
    subjects: Subject[] = [];

    /**
     * Campus nav data is subject-backed so the sidebar can render reactively (async pipe)
     * instead of reading a mutable array through change detection. The get/set keep every
     * existing `this.campuses = ...` / `this.campusCategories = ...` assignment working.
     */
    private readonly campusesSubject = new BehaviorSubject<Campus[]>([]);
    readonly campuses$ = this.campusesSubject.asObservable();
    private readonly campusCategoriesSubject = new BehaviorSubject<CampusCategory[]>([]);
    readonly campusCategories$ = this.campusCategoriesSubject.asObservable();

    get campuses(): Campus[] {
        return this.campusesSubject.value;
    }
    set campuses(value: Campus[]) {
        this.campusesSubject.next(value);
    }

    get campusCategories(): CampusCategory[] {
        return this.campusCategoriesSubject.value;
    }
    set campusCategories(value: CampusCategory[]) {
        this.campusCategoriesSubject.next(value);
    }

    /** True after first reference bundle attempted (success or partial). */
    bootstrapLoaded = false;
    bootstrapError: string | null = null;

    /** In-flight init so layout + dashboards share one load (avoids races / empty quarters). */
    private initChain$: Observable<void> | null = null;
    private campusCategoriesChain$: Observable<void> | null = null;
    private gradesChain$: Observable<void> | null = null;
    private loadedSubjectsDistrictId: number | null = null;
    private loadedQuartersDistrictId: number | null = null;
    private loadedQuartersAcademicYearId: number | null = null;
    private readonly bootstrapReadySubject = new BehaviorSubject(false);
    /** True when the initial bootstrap loaded the full district list (no stateId filter). */
    private allDistrictsLoaded = false;
    private loadedDistrictBundleId: number | null = null;

    constructor(
        private filters: FiltersService,
        private auth: AuthService,
    ) {
        this.selection$ = this.selectionSubject.asObservable();
        this.growthFilters$ = this.growthFiltersSubject.asObservable();
        this.bootstrapReady$ = this.bootstrapReadySubject.asObservable();

        // Render the CAMPUSES section immediately from last-good data so a reload never
        // shows it empty while the reference APIs are still (re)loading or failing.
        this.seedCampusNavFromCache();

        /**
         * Reset all cached context whenever the logged-in user changes (login or logout).
         * The service is a root singleton that survives SPA login/logout, so without this a
         * previous user's (or a stale/empty) campus state would persist and `initialize()`
         * would no-op. Keyed on `userId` (not token) so switch-role — which keeps the same
         * user and is handled by `syncToActiveRole()` — does not wipe the loaded districts.
         * `skip(1)` ignores the initial replay of the current session.
         */
        this.auth.session$
            .pipe(
                map((session) => session?.userId ?? null),
                distinctUntilChanged(),
                skip(1),
            )
            .subscribe(() => this.reset());
    }

    /**
     * Clears every cached bootstrap/reference value so the next {@link initialize} starts
     * fresh. Does not touch `localStorage`, so the saved district selection is restored on
     * the next bootstrap. Called automatically on session change.
     */
    reset(): void {
        this.bootstrapLoaded = false;
        this.bootstrapError = null;
        this.initChain$ = null;
        this.campusCategoriesChain$ = null;
        this.gradesChain$ = null;
        this.loadedSubjectsDistrictId = null;
        this.loadedQuartersDistrictId = null;
        this.loadedQuartersAcademicYearId = null;
        this.loadedDistrictBundleId = null;
        this.allDistrictsLoaded = false;

        this.states = [];
        this.districts = [];
        this.allDistricts = [];
        this.academicYears = [];
        this.districtQuarters = [];
        this.grades = [];
        this.subjects = [];
        this.campuses = [];
        this.campusCategories = [];

        this.selectionSubject.next({
            stateId: null,
            districtId: null,
            campusId: null,
            teacherId: null,
            academicYearId: null,
            quarterCode: null,
        });
        this.bootstrapReadySubject.next(false);
        this.filters.invalidateCache();
        this.clearCampusNavCache();
        this.clearPersistedContext();
    }

    get selection(): DistrictContextSelection {
        return this.selectionSubject.value;
    }

    get growthFilters(): GrowthFilters {
        return this.growthFiltersSubject.value;
    }

    /** Replace dashboard search filters; persisted so reload keeps them in sync. */
    setGrowthFilters(next: GrowthFilters): void {
        const normalized: GrowthFilters = {
            campusId: next.campusId ?? null,
            grades: normalizeGrowthFilterCodes(next.grades),
            subjects: normalizeGrowthFilterCodes(next.subjects),
            specialEducation: next.specialEducation ?? null,
            economicDisadvantage: next.economicDisadvantage ?? null,
            emergentBilingual: emptyToNull(next.emergentBilingual),
            ethnicity: emptyToNull(next.ethnicity),
            testLanguage: normalizeTestLanguage(next.testLanguage),
        };
        this.growthFiltersSubject.next(normalized);
        try {
            localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(normalized));
        } catch {
            /* ignore quota */
        }
    }

    /** Clears every dashboard search filter back to "All". */
    resetGrowthFilters(): void {
        this.setGrowthFilters({
            ...EMPTY_GROWTH_FILTERS,
            grades: [],
            subjects: [],
        });
    }

    /** True when at least one optional dashboard filter is set. */
    hasActiveGrowthFilters(): boolean {
        const f = this.growthFiltersSubject.value;
        return (
            f.campusId != null ||
            f.grades.length > 0 ||
            f.subjects.length > 0 ||
            f.specialEducation != null ||
            f.economicDisadvantage != null ||
            f.emergentBilingual != null ||
            f.ethnicity != null ||
            f.testLanguage != null
        );
    }

    /** Applied search-filter chips for dashboard UI. */
    growthFilterChips(): Array<{ id: GrowthFilterChipId; label: string }> {
        return buildGrowthFilterChips(this.growthFilters, this.grades, this.subjects, this.campuses);
    }

    /** Campus override chosen in the search-filters panel (undefined = whole district). */
    filterCampus(): Campus | undefined {
        const id = this.growthFilters.campusId;
        return id == null ? undefined : this.findCampusById(id);
    }

    // ── Dashboard UI event relay (campuses popup "More filters" ⇄ Search Filters modal) ──

    /** Fired from the campuses popup "More filters" button — opens the Search Filters modal. */
    private readonly filterPanelRequestSubject = new RxSubject<void>();
    readonly filterPanelRequest$ = this.filterPanelRequestSubject.asObservable();

    requestFilterPanel(): void {
        this.filterPanelRequestSubject.next();
    }

    /** Opens the same panel directly in Campus Comparison mode (full-district roles only). */
    private readonly comparisonPanelRequestSubject = new RxSubject<void>();
    readonly comparisonPanelRequest$ = this.comparisonPanelRequestSubject.asObservable();

    requestComparisonPanel(): void {
        this.comparisonPanelRequestSubject.next();
    }

    /** Clears one applied search filter and re-fetches dashboard data. */
    clearGrowthFilterChip(id: GrowthFilterChipId): void {
        this.setGrowthFilters(removeGrowthFilterChip(this.growthFilters, id));
    }

    /**
     * Re-applies scope from login / switch-role `activeRole` after role selection or refresh.
     */
    syncToActiveRole(): Observable<void> {
        const scope = this.auth.getActiveRoleScope();
        if (!scope) {
            return of(undefined);
        }
        /** Only full-district roles may compare campuses — never carry a stale pair into a scoped role. */
        if (!this.auth.isFullDistrictRole()) {
            this.setCampusComparison(null);
        }
        this.loadedDistrictBundleId = null;
        return this.applyActiveRoleScope(scope).pipe(
            switchMap(() => this.ensureDefaultDistrictIfNeeded()),
            tap(() => this.finalizeGrowthSelectionDefaults()),
            map(() => undefined),
        );
    }

    /** Optional campus / teacher scope from the active role for scoped API calls. */
    roleScopePayload(): Partial<{
        campusId: number;
        campusCode: string;
        campusCategoryId: number;
        teacherId: number;
    }> {
        const s = this.selection;
        const role = this.auth.getActiveRoleScope();
        const campusId = s.campusId ?? role?.campusId ?? null;
        const teacherId = s.teacherId ?? role?.teacherId ?? null;
        const out: Partial<{
            campusId: number;
            campusCode: string;
            campusCategoryId: number;
            teacherId: number;
        }> = {};

        if (campusId != null) {
            out.campusId = campusId;
            const campus = this.findCampusById(campusId);
            if (campus) {
                out.campusCode = campus.campusCode;
                out.campusCategoryId = campus.campusCategoryId;
            }
        }
        if (teacherId != null) {
            out.teacherId = teacherId;
        }
        return out;
    }

    /** Campuses visible in sidebar / nav for the current role (Principal / Teacher → one campus). */
    filterCampusesForActiveRole(campuses: Campus[]): Campus[] {
        const campusId = this.auth.scopedCampusId();
        if (campusId == null) {
            return campuses;
        }
        return campuses.filter((c) => c.campusId === campusId);
    }

    /** Categories visible in sidebar / nav for the current role (Principal → one category). */
    filterCategoriesForActiveRole(
        categories: CampusCategory[],
        campuses: Campus[],
    ): CampusCategory[] {
        const scopedCampuses = this.filterCampusesForActiveRole(campuses);
        if (scopedCampuses.length === campuses.length) {
            return categories;
        }
        const categoryIds = new Set(scopedCampuses.map((c) => c.campusCategoryId));
        return categories.filter((c) => categoryIds.has(c.campusCategoryId));
    }

    findCampusById(campusId: number | null): Campus | undefined {
        if (campusId == null) {
            return undefined;
        }
        return (
            this.campuses.find((c) => c.campusId === campusId) ??
            this.cachedCampusesForDistrict(this.selection.districtId).find(
                (c) => c.campusId === campusId,
            )
        );
    }

    campusRouteSlug(campus: Campus): string {
        const label = campus.campusName?.trim() || campus.campusCode;
        return label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    principalDashboardRoute(): string[] | null {
        const campusId = this.auth.scopedCampusId();
        if (campusId == null) {
            return null;
        }
        const campus = this.findCampusById(campusId);
        if (!campus) {
            return null;
        }
        return ['/dashboard/campus', this.campusRouteSlug(campus)];
    }

    /** Teacher classroom drill-down from activeRole campus + teacher ids. */
    teacherDashboardRoute(): string[] | null {
        if (!this.auth.isTeacherRole()) {
            return null;
        }
        const scope = this.auth.getActiveRoleScope();
        const campusId = scope?.campusId ?? null;
        const teacherId = scope?.teacherId ?? null;
        if (campusId == null || teacherId == null) {
            return null;
        }
        const campus = this.findCampusById(campusId);
        if (!campus) {
            return null;
        }
        return [
            '/dashboard/campus',
            this.campusRouteSlug(campus),
            'teacher',
            String(teacherId),
        ];
    }

    /** Default landing route after login / role switch (Teacher classroom or Principal campus). */
    roleDashboardRoute(): string[] | null {
        return this.teacherDashboardRoute() ?? this.principalDashboardRoute();
    }

    /** Whether the current URL should redirect to {@link roleDashboardRoute}. */
    shouldRedirectToRoleDashboard(url: string): boolean {
        const path = url.split('?')[0];
        if (path === '/dashboard' || path === '/') {
            return this.roleDashboardRoute() != null;
        }
        if (this.auth.isTeacherRole() && /^\/dashboard\/campus\/[^/]+$/.test(path)) {
            return this.teacherDashboardRoute() != null;
        }
        return false;
    }

    /** Loads campuses if needed, then resolves the role-scoped dashboard route. */
    ensureRoleDashboardRoute(): Observable<string[] | null> {
        return this.ensureDistrictCampuses().pipe(map(() => this.roleDashboardRoute()));
    }

    /** Filter fields for POST /api/growth/* (grade/subject as string arrays). */
    growthFiltersPayload(): Partial<{
        grade: string[];
        subject: string[];
        specialEducation: boolean;
        economicDisadvantage: boolean;
        emergentBilingual: string;
        ethnicity: string;
        testLanguage: string;
    }> {
        const f = this.growthFiltersSubject.value;
        const out: Partial<{
            grade: string[];
            subject: string[];
            specialEducation: boolean;
            economicDisadvantage: boolean;
            emergentBilingual: string;
            ethnicity: string;
            testLanguage: string;
        }> = {};
        if (f.grades.length) out.grade = [...f.grades];
        if (f.subjects.length) out.subject = [...f.subjects];
        if (f.specialEducation != null) out.specialEducation = f.specialEducation;
        if (f.economicDisadvantage != null) out.economicDisadvantage = f.economicDisadvantage;
        if (f.emergentBilingual != null) out.emergentBilingual = f.emergentBilingual;
        if (f.ethnicity != null) out.ethnicity = f.ethnicity;
        if (f.testLanguage != null) out.testLanguage = f.testLanguage;
        return out;
    }

    /** @deprecated Use {@link growthFiltersPayload}. */
    growthOverallMetricsFiltersPayload() {
        return this.growthFiltersPayload();
    }

    /** True when district, year, and quarter code are chosen (API minimum for growth). */
    isGrowthContextReady(): boolean {
        const s = this.selection;
        return s.districtId != null && s.academicYearId != null && !!s.quarterCode?.trim();
    }

    /** Attendance uploads & analytics – district + academic year only (no quarter). */
    isAttendanceContextReady(): boolean {
        const s = this.selection;
        return s.districtId != null && s.academicYearId != null;
    }

    /** POST body shared by `/campus-attendance/*` analytics endpoints. */
    baseAttendancePayload(): {
        districtId: number;
        academicYearId: number;
        campusId?: number;
    } | null {
        const s = this.selection;
        if (s.districtId == null || s.academicYearId == null) {
            return null;
        }
        const scope = this.roleScopePayload();
        return {
            districtId: s.districtId,
            academicYearId: s.academicYearId,
            ...(scope.campusId != null ? { campusId: scope.campusId } : {}),
        };
    }

    /** Loads static lists + reapplies saved or user-default district context. */
    initialize(): Observable<void> {
        if (!this.auth.isLoggedIn()) {
            return of(undefined);
        }
        if (this.bootstrapLoaded) {
            return of(undefined);
        }
        if (this.initChain$) {
            return this.initChain$;
        }
        this.bootstrapError = null;
        /** One failed reference endpoint must not abort the whole chain (otherwise growth never loads). */
        this.initChain$ = forkJoin({
            states: this.safeRefList(() => this.filters.listStates(true)),
            academicYears: this.safeRefList(() => this.filters.listAcademicYears(true)),
            districts: this.safeRefList(() => this.filters.listDistricts({ activeOnly: true })),
        }).pipe(
            tap(({ states, academicYears, districts }) => {
                this.states = states;
                this.academicYears = academicYears;
                // Do NOT blank campusCategories here — they are seeded from cache and refreshed
                // by ensureCampusCategories(); clearing them would flash the sidebar empty.
                this.grades = [];
                this.districts = districts;
                this.allDistricts = districts;
                this.allDistrictsLoaded = true;
                this.subjects = [];
                this.loadedSubjectsDistrictId = null;
            }),
            switchMap(() => this.restoreOrDefaultContext()),
            switchMap(() => this.ensureDefaultDistrictIfNeeded()),
            tap(() => this.finalizeGrowthSelectionDefaults()),
            switchMap((): Observable<void> => {
                if (this.selection.districtId == null) {
                    // Categories are district-independent — load them so the sidebar can render.
                    return this.ensureCampusCategories();
                }
                // Load filter data + campus nav data up front so the sidebar CAMPUSES list
                // is populated by the time bootstrap completes, regardless of route or timing.
                return forkJoin([
                    this.ensureDistrictFilterData(),
                    this.ensureDistrictCampuses(),
                    this.ensureCampusCategories(),
                ]).pipe(map(() => undefined));
            }),
            tap(() => {
                this.bootstrapLoaded = true;
                this.bootstrapReadySubject.next(true);
            }),
            map(() => undefined),
            /**
             * Max wall-clock time for the whole bootstrap (multiple sequential HTTP calls).
             * Prevents an indefinite "Loading context…" when a request hangs.
             */
            timeout({ first: 90_000 }),
            catchError((err: unknown) => {
                const isTimeout =
                    (err as { name?: string })?.name === 'TimeoutError' ||
                    String(err).includes('Timeout');
                if (isTimeout) {
                    this.bootstrapError =
                        'Loading filters timed out. Check that the API is running and reachable.';
                } else {
                    const msg = err instanceof Error ? err.message : String(err);
                    this.bootstrapError = msg || 'Failed to load filter data';
                }
                this.bootstrapLoaded = true;
                this.bootstrapReadySubject.next(true);
                return of(undefined);
            }),
            finalize(() => {
                if (!this.bootstrapReadySubject.value) {
                    this.bootstrapReadySubject.next(true);
                }
            }),
            shareReplay({ bufferSize: 1, refCount: false }),
        ) as Observable<void>;
        return this.initChain$!;
    }

    /** Sidebar campus grouping — loaded on demand instead of bootstrap. */
    ensureCampusCategories(): Observable<void> {
        if (!this.auth.isLoggedIn()) {
            return of(undefined);
        }
        if (this.campusCategories.length) {
            return of(undefined);
        }
        if (!this.campusCategoriesChain$) {
            this.campusCategoriesChain$ = this.safeRefList(() =>
                this.filters.listCampusCategories(true),
            ).pipe(
                tap((rows) => {
                    if (rows.length) {
                        this.campusCategories = rows;
                        this.persistCampusCategories(rows);
                    } else {
                        /**
                         * Never cache an empty/failed result: drop the chain so the next trigger
                         * refetches, and keep any seeded categories so the sidebar stays populated.
                         */
                        this.campusCategoriesChain$ = null;
                    }
                }),
                map(() => undefined),
                catchError(() => {
                    this.campusCategoriesChain$ = null;
                    return of(undefined);
                }),
                shareReplay({ bufferSize: 1, refCount: false }),
            );
        }
        return this.campusCategoriesChain$;
    }

    /** Growth filter gear grade list — loaded on demand. */
    ensureGrades(): Observable<void> {
        if (this.grades.length) {
            return of(undefined);
        }
        if (!this.gradesChain$) {
            this.gradesChain$ = this.safeRefList(() => this.filters.listGrades(true)).pipe(
                tap((rows) => {
                    this.grades = rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
                }),
                map(() => undefined),
                catchError(() => {
                    this.grades = [];
                    return of(undefined);
                }),
                shareReplay({ bufferSize: 1, refCount: false }),
            );
        }
        return this.gradesChain$;
    }

    /** District subject list for growth filters / standards matrix — loaded on demand. */
    ensureSubjectsForSelection(): Observable<void> {
        const districtId = this.selection.districtId;
        if (districtId == null) {
            this.subjects = [];
            this.loadedSubjectsDistrictId = null;
            return of(undefined);
        }
        if (this.loadedSubjectsDistrictId === districtId && this.subjects.length) {
            return of(undefined);
        }
        return this.filters.listSubjects({ activeOnly: true }).pipe(
            tap((rows) => {
                this.subjects = rows;
                this.loadedSubjectsDistrictId = districtId;
            }),
            map(() => undefined),
            catchError(() => {
                this.subjects = [];
                this.loadedSubjectsDistrictId = null;
                return of(undefined);
            }),
        );
    }

    /** District campus list — loaded on demand (dashboard, standards, attendance campus filter). */
    ensureDistrictCampuses(): Observable<void> {
        const districtId = this.selection.districtId;
        if (districtId == null) {
            /**
             * Do NOT wipe campuses here. A transient null district during bootstrap (before
             * the selection resolves) would otherwise race with the bootstrap/dashboard load
             * and blank the sidebar nondeterministically. Explicit district/state changes
             * (`setDistrictId`/`setStateId`) clear campuses when the selection truly changes.
             */
            return of(undefined);
        }
        if (this.loadedDistrictBundleId === districtId && this.campuses.length > 0) {
            return of(undefined);
        }
        return this.loadDistrictBundle(districtId).pipe(
            tap(({ campuses }) => {
                if (campuses.length) {
                    // Fresh non-empty data — show it and persist it as the new last-good cache.
                    this.campuses = campuses;
                    this.loadedDistrictBundleId = districtId;
                    this.persistCampusesForDistrict(districtId, campuses);
                } else if (!this.campuses.length) {
                    // API returned empty and the sidebar is empty — fall back to cached campuses.
                    const cached = this.cachedCampusesForDistrict(districtId);
                    if (cached.length) {
                        this.campuses = cached;
                    }
                }
                // If the API returned empty but campuses are already shown, keep them (no blanking).
            }),
            map(() => undefined),
            catchError(() => {
                /**
                 * Keep the last-good campuses on a transient failure (don't blank the UI);
                 * just allow a retry on the next trigger (cache was dropped by FiltersService).
                 * If nothing is shown yet, seed from the persisted cache.
                 */
                this.loadedDistrictBundleId = null;
                if (!this.campuses.length) {
                    const cached = this.cachedCampusesForDistrict(districtId);
                    if (cached.length) {
                        this.campuses = cached;
                    }
                }
                return of(undefined);
            }),
        );
    }

    /** District quarter list for the header — loaded on demand (growth routes only). */
    ensureDistrictQuarters(): Observable<void> {
        const districtId = this.selection.districtId;
        const academicYearId = this.selection.academicYearId;
        if (districtId == null) {
            this.districtQuarters = [];
            this.loadedQuartersDistrictId = null;
            this.loadedQuartersAcademicYearId = null;
            return of(undefined);
        }
        if (
            this.loadedQuartersDistrictId === districtId &&
            this.loadedQuartersAcademicYearId === academicYearId &&
            this.districtQuarters.length
        ) {
            return of(undefined);
        }
        return this.filters
            .listDistrictQuarters({
                districtId,
                academicYearId: academicYearId ?? undefined,
                activeOnly: true,
            })
            .pipe(
            tap((rows) => {
                /**
                 * Staleness guard: the user may have switched districts while this
                 * request was in flight — never apply a response for a district
                 * other than the one currently selected.
                 */
                if (this.selection.districtId !== districtId) {
                    return;
                }
                this.districtQuarters = this.sortDistrictQuarters(rows);
                this.loadedQuartersDistrictId = districtId;
                this.loadedQuartersAcademicYearId = academicYearId;
                this.reconcileQuarterWithLoadedQuarters();
            }),
            map(() => undefined),
            catchError(() => {
                this.districtQuarters = [];
                this.loadedQuartersDistrictId = null;
                this.loadedQuartersAcademicYearId = null;
                return of(undefined);
            }),
        );
    }

    /** Quarters (header + filter panel) and subjects for the active district. */
    ensureDistrictFilterData(): Observable<void> {
        const districtId = this.selection.districtId;
        if (districtId == null) {
            return of(undefined);
        }
        return forkJoin([
            this.ensureDistrictQuarters(),
            this.ensureSubjectsForSelection(),
        ]).pipe(map(() => undefined));
    }

    setStateId(stateId: number | null): void {
        if (this.auth.hasFixedDistrictFromActiveRole()) {
            return;
        }
        const prev = this.selectionSubject.value;
        this.persistAndEmit({
            stateId,
            districtId: null,
            campusId: null,
            teacherId: null,
            academicYearId: prev.academicYearId,
            quarterCode: null,
        });
        this.districtQuarters = [];
        this.loadedQuartersDistrictId = null;
        this.loadedQuartersAcademicYearId = null;
        this.campuses = [];
        this.subjects = [];
        this.loadedSubjectsDistrictId = null;
        this.loadedDistrictBundleId = null;
        /**
         * Re-apply the same defaults the bootstrap chain applies (first district of the
         * new scope, default year + quarter, bundle reload) so stats appear immediately
         * instead of only after a manual page refresh.
         */
        this.applyDefaultsAfterScopeChange(stateId);
    }

    setDistrictId(districtId: number | null): void {
        if (this.auth.hasFixedDistrictFromActiveRole()) {
            return;
        }
        const prev = this.selectionSubject.value;
        /**
         * Keep stateId consistent with the chosen district: switching back from a
         * drill-down into another state must not leave the previous state's id behind.
         */
        const district =
            districtId != null ? this.allDistricts.find((d) => d.districtId === districtId) : null;
        this.persistAndEmit({
            ...prev,
            stateId: district?.stateId ?? prev.stateId,
            districtId,
            quarterCode: null,
        });
        if (districtId != null) {
            this.subjects = [];
            this.loadedSubjectsDistrictId = null;
            this.districtQuarters = [];
            this.loadedQuartersDistrictId = null;
            this.loadedQuartersAcademicYearId = null;
            if (this.loadedDistrictBundleId !== districtId) {
                // Seed from cache (or empty) so switching districts shows the right campuses
                // immediately; the real list refreshes via ensureDistrictCampuses().
                this.campuses = this.cachedCampusesForDistrict(districtId);
                this.loadedDistrictBundleId = null;
            }
            this.ensureDistrictFilterData().subscribe();
        } else {
            this.districtQuarters = [];
            this.campuses = [];
            this.subjects = [];
            this.loadedSubjectsDistrictId = null;
            this.loadedQuartersDistrictId = null;
            this.loadedQuartersAcademicYearId = null;
        }
    }

    setAcademicYearId(academicYearId: number | null): void {
        const prev = this.selectionSubject.value;
        const normalized =
            academicYearId == null || !Number.isFinite(Number(academicYearId))
                ? null
                : Number(academicYearId);
        this.persistAndEmit({ ...prev, academicYearId: normalized });
        if (prev.academicYearId !== normalized) {
            this.loadedQuartersAcademicYearId = null;
            if (this.selection.districtId != null) {
                this.ensureDistrictQuarters().subscribe();
            }
        }
    }

    setQuarterCode(quarterCode: string | null): void {
        const prev = this.selectionSubject.value;
        const normalized =
            quarterCode == null || String(quarterCode).trim() === ''
                ? null
                : String(quarterCode).trim();
        this.persistAndEmit({ ...prev, quarterCode: normalized });
    }

    /** Builds growth POST body fields common to dashboard filters. */
    baseGrowthPayload(): {
        districtId: number;
        academicYearId: number;
        quarterCode: string;
        campusCode?: string;
        campusCategoryId?: number;
        teacherId?: number;
    } | null {
        const s = this.selection;
        if (
            s.districtId == null ||
            s.academicYearId == null ||
            s.quarterCode == null ||
            !String(s.quarterCode).trim()
        ) {
            return null;
        }
        const scope = this.roleScopePayload();
        return {
            districtId: s.districtId,
            academicYearId: s.academicYearId,
            quarterCode: s.quarterCode.trim(),
            ...(scope.campusCode ? { campusCode: scope.campusCode } : {}),
            ...(scope.campusCategoryId != null ? { campusCategoryId: scope.campusCategoryId } : {}),
            ...(scope.teacherId != null ? { teacherId: scope.teacherId } : {}),
        };
    }

    /** POST body for `/individual-attendance/student-stats*` — campusId only when role-scoped. */
    baseIndividualAttendancePayload(): {
        districtId: number;
        academicYearId: number;
        quarterCode: string;
        campusId?: number;
    } | null {
        const s = this.selection;
        if (
            s.districtId == null ||
            s.academicYearId == null ||
            s.quarterCode == null ||
            !String(s.quarterCode).trim()
        ) {
            return null;
        }
        const scope = this.roleScopePayload();
        return {
            districtId: s.districtId,
            academicYearId: s.academicYearId,
            quarterCode: s.quarterCode.trim(),
            ...(scope.campusId != null ? { campusId: scope.campusId } : {}),
        };
    }

    private persistAndEmit(next: DistrictContextSelection): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
            /* ignore quota */
        }
        this.emitConverging(next);
    }

    /**
     * Emit the selection and converge reentrant writes.
     *
     * Subscriber callbacks can synchronously write the context again (e.g. quarter
     * reconciliation firing while a district switch is being delivered). A reentrant
     * write replaces the subject value mid-delivery, and BehaviorSubject's delivery
     * loop keeps handing the ORIGINAL value to the remaining observers — leaving some
     * subscribers (async pipes, header select) on a stale intermediate state while
     * others see the final one. Re-deliver the final value until delivery is stable.
     */
    private emitConverging(next: DistrictContextSelection): void {
        this.selectionSubject.next(next);
        for (let i = 0; i < 10 && this.selectionSubject.value !== next; i++) {
            next = this.selectionSubject.value;
            this.selectionSubject.next(next);
        }
    }

    /** District list for a state ('null' = all states): filtered in memory when possible, else fetched. */
    private loadDistrictsForState(stateId: number | null): Observable<void> {
        if (this.allDistrictsLoaded) {
            this.districts = this.filterDistrictsByState(stateId);
            return of(undefined);
        }
        return this.filters
            .listDistricts(stateId != null ? { stateId, activeOnly: true } : { activeOnly: true })
            .pipe(
                tap((rows) => {
                    this.districts = rows;
                }),
                catchError(() => {
                    this.districts = [];
                    return of(undefined);
                }),
                map(() => undefined),
            );
    }

    /**
     * After a State/District scope change, re-apply the same defaults the bootstrap chain
     * applies (first district of the new scope, default year + quarter, bundle reload) so
     * the dashboard stats appear immediately — no manual refresh needed.
     */
    private applyDefaultsAfterScopeChange(stateId: number | null): void {
        this.loadDistrictsForState(stateId)
            .pipe(
                switchMap(() => this.ensureDefaultDistrictIfNeeded()),
                switchMap(() =>
                    this.selection.districtId != null
                        ? forkJoin([this.ensureDistrictFilterData(), this.ensureDistrictCampuses()])
                        : of(undefined),
                ),
                tap(() => this.finalizeGrowthSelectionDefaults()),
            )
            .subscribe();
    }

    private reloadDistrictsForState(stateId: number | null): void {
        if (stateId == null) {
            this.districts = [];
            this.districtQuarters = [];
            this.campuses = [];
            this.subjects = [];
            return;
        }
        if (this.allDistrictsLoaded) {
            this.districts = this.filterDistrictsByState(stateId);
            return;
        }
        this.filters.listDistricts({ stateId, activeOnly: true }).subscribe({
            next: (rows) => {
                this.districts = rows;
            },
            error: () => {
                this.districts = [];
            },
        });
    }

    private filterDistrictsByState(stateId: number | null): District[] {
        if (!this.allDistrictsLoaded || !this.allDistricts.length) {
            return [...this.districts];
        }
        if (stateId == null) {
            return [...this.allDistricts];
        }
        return this.allDistricts.filter((d) => d.stateId === stateId);
    }

    private loadDistrictBundle(districtId: number): Observable<{
        campuses: Campus[];
    }> {
        /**
         * Let load errors propagate so the caller can keep the last-good campuses and retry,
         * instead of swallowing the error into an empty list that blanks the sidebar.
         */
        return this.filters
            .listCampuses({ districtId, activeOnly: true })
            .pipe(map((campuses) => ({ campuses })));
    }

    /** Keep selection.quarterCode on a valid option after quarters reload (API codes vs stored value). */
    private reconcileQuarterWithLoadedQuarters(): void {
        const quarters = this.districtQuarters;
        if (!quarters.length) {
            return;
        }
        const s = this.selectionSubject.value;
        const valid = new Set(quarters.map((q) => String(q.quarterCode).trim()));
        let next = s.quarterCode?.trim() ?? null;
        if (next && !valid.has(next)) {
            next = this.defaultQuarterCode(quarters);
        }
        if (!next) {
            next = this.defaultQuarterCode(quarters);
        }
        if (next !== s.quarterCode) {
            this.persistAndEmit({ ...s, quarterCode: next });
        }
    }

    private resolveQuarterForSelection(
        requested: string | null | undefined,
        quarters: DistrictQuarter[],
    ): string | null {
        if (!quarters.length) {
            return null;
        }
        const r = requested?.trim();
        if (r && quarters.some((q) => String(q.quarterCode).trim() === r)) {
            return r;
        }
        return this.defaultQuarterCode(quarters);
    }

    /**
     * Default header quarter: active date window, then the first quarter of the
     * year (BOY — matches the main dashboard's default), then last sorted option.
     */
    private defaultQuarterCode(quarters: DistrictQuarter[]): string | null {
        if (!quarters.length) {
            return null;
        }
        const sorted = this.sortDistrictQuarters(quarters);
        const today = this.todayIsoDate();

        const activeByDate = sorted.find(
            (q) =>
                q.startDate &&
                q.endDate &&
                today >= q.startDate.slice(0, 10) &&
                today <= q.endDate.slice(0, 10),
        );
        if (activeByDate) {
            return activeByDate.quarterCode;
        }

        return sorted[0].quarterCode;
    }

    private todayIsoDate(): string {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    private restoreOrDefaultContext(): Observable<void> {
        const roleScope = this.auth.getActiveRoleScope();
        if (roleScope?.districtId != null) {
            return this.applyActiveRoleScope(roleScope);
        }

        const stored = this.readStoredContext();
        const user = this.auth.getCurrentUser();

        if (stored?.districtId != null && stored.stateId == null) {
            return this.filters.getDistrictById(stored.districtId).pipe(
                switchMap((d) =>
                    this.applyStoredOrUserContext(
                        {
                            ...stored,
                            stateId: d.stateId,
                            districtId: d.districtId,
                        },
                        d,
                    ),
                ),
                catchError(() => of(undefined)),
            );
        }

        if (stored?.districtId != null) {
            return this.applyStoredOrUserContext(stored, null);
        }

        if (user?.districtId != null) {
            return this.filters.getDistrictById(user.districtId).pipe(
                switchMap((d) =>
                    this.applyStoredOrUserContext(
                        {
                            stateId: d.stateId,
                            districtId: d.districtId,
                            campusId: user.campusId ?? user.activeRole?.campusId ?? null,
                            teacherId: user.teacherId ?? user.activeRole?.teacherId ?? null,
                            academicYearId: null,
                            quarterCode: null,
                        },
                        d,
                    ),
                ),
                catchError(() => {
                    if (stored) {
                        return this.applyStoredOrUserContext(stored, null);
                    }
                    return of(undefined);
                }),
            );
        }

        if (stored) {
            return this.applyStoredOrUserContext(stored, null);
        }

        return of(undefined);
    }

    /** When nothing was restored, pick the first district so quarter/campus lists load (header dropdowns stay usable). */
    private ensureDefaultDistrictIfNeeded(): Observable<void> {
        if (this.selection.districtId != null) {
            return of(undefined);
        }
        const district = this.districts[0];
        if (!district) {
            return of(undefined);
        }
        const yearId =
            this.selection.academicYearId ??
            this.academicYears[0]?.academicYearId ??
            null;
        const stored = this.readStoredContext();
        const quarter =
            this.selection.quarterCode?.trim() ||
            stored?.quarterCode?.trim() ||
            FALLBACK_QUARTER_CODE;
        this.persistAndEmit({
            stateId: district.stateId,
            districtId: district.districtId,
            campusId: null,
            teacherId: null,
            academicYearId: yearId,
            quarterCode: quarter,
        });
        return of(undefined);
    }

    /**
     * After reference data is loaded, ensure year + quarter are set when possible so
     * growth dashboard requests are not blocked by a null filter() in the UI stream.
     * Merges {@link readStoredContext} when API lists failed (partial bootstrap).
     */
    private finalizeGrowthSelectionDefaults(): void {
        const s = this.selectionSubject.value;
        const stored = this.readStoredContext();

        let districtId = s.districtId ?? stored?.districtId ?? null;
        let stateId = s.stateId ?? stored?.stateId ?? null;
        let campusId = s.campusId ?? stored?.campusId ?? null;
        let teacherId = s.teacherId ?? stored?.teacherId ?? null;
        const roleScope = this.auth.getActiveRoleScope();
        if (roleScope?.districtId != null) {
            districtId = roleScope.districtId;
            stateId = roleScope.stateId ?? stateId;
            campusId = roleScope.campusId ?? campusId;
            teacherId = roleScope.teacherId ?? teacherId;
        }

        let academicYearId = s.academicYearId ?? stored?.academicYearId ?? null;
        if (academicYearId == null && this.academicYears.length > 0) {
            academicYearId = this.academicYears[0].academicYearId;
        }

        let quarterCode: string | null =
            s.quarterCode != null && String(s.quarterCode).trim() !== ''
                ? String(s.quarterCode).trim()
                : stored?.quarterCode != null && String(stored.quarterCode).trim() !== ''
                  ? String(stored.quarterCode).trim()
                  : null;

        if (districtId != null && quarterCode == null) {
            if (this.districtQuarters.length > 0) {
                quarterCode = this.resolveQuarterForSelection(null, this.districtQuarters);
            } else {
                quarterCode = FALLBACK_QUARTER_CODE;
            }
        }

        const changed =
            districtId !== s.districtId ||
            stateId !== s.stateId ||
            campusId !== s.campusId ||
            teacherId !== s.teacherId ||
            academicYearId !== s.academicYearId ||
            quarterCode !== s.quarterCode;

        if (changed) {
            this.persistAndEmit({
                stateId,
                districtId,
                campusId,
                teacherId,
                academicYearId,
                quarterCode,
            });
        }
    }

    private safeRefList<T>(load: () => Observable<T[]>): Observable<T[]> {
        return load().pipe(catchError(() => of([] as T[])));
    }

    private readStoredContext(): DistrictContextSelection | null {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as DistrictContextSelection;
            if (
                parsed &&
                typeof parsed === 'object' &&
                ('stateId' in parsed || 'districtId' in parsed)
            ) {
                return {
                    stateId: parsed.stateId ?? null,
                    districtId: parsed.districtId ?? null,
                    campusId: parsed.campusId ?? null,
                    teacherId: parsed.teacherId ?? null,
                    academicYearId: parsed.academicYearId ?? null,
                    quarterCode: parsed.quarterCode ?? null,
                };
            }
        } catch {
            /* ignore */
        }
        return null;
    }

    private readStoredGrowthFilters(): GrowthFilters | null {
        try {
            const raw = localStorage.getItem(FILTERS_STORAGE_KEY);
            if (!raw) {
                return null;
            }
            const parsed = JSON.parse(raw) as Partial<GrowthFilters> & { grade?: string | null; subject?: string | null };
            if (!parsed || typeof parsed !== 'object') {
                return null;
            }
            return migrateGrowthFilters(parsed);
        } catch {
            return null;
        }
    }

    /** Seeds the sidebar subjects from the persisted campus nav cache (startup only). */
    private seedCampusNavFromCache(): void {
        const cache = this.readCampusNavCache();
        if (cache.categories.length) {
            this.campusCategoriesSubject.next(cache.categories);
        }
        const storedDistrictId = this.readStoredContext()?.districtId ?? null;
        if (storedDistrictId != null) {
            const cached = cache.campusesByDistrict[String(storedDistrictId)];
            if (cached?.length) {
                this.campusesSubject.next(cached);
            }
        }
    }

    private readCampusNavCache(): CampusNavCache {
        try {
            const raw = localStorage.getItem(CAMPUS_NAV_CACHE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<CampusNavCache>;
                return {
                    categories: Array.isArray(parsed?.categories) ? parsed!.categories! : [],
                    campusesByDistrict:
                        parsed?.campusesByDistrict && typeof parsed.campusesByDistrict === 'object'
                            ? (parsed.campusesByDistrict as Record<string, Campus[]>)
                            : {},
                };
            }
        } catch {
            /* ignore */
        }
        return { categories: [], campusesByDistrict: {} };
    }

    private writeCampusNavCache(cache: CampusNavCache): void {
        try {
            localStorage.setItem(CAMPUS_NAV_CACHE_KEY, JSON.stringify(cache));
        } catch {
            /* ignore quota */
        }
    }

    private persistCampusCategories(categories: CampusCategory[]): void {
        if (!categories.length) {
            return;
        }
        const cache = this.readCampusNavCache();
        cache.categories = categories;
        this.writeCampusNavCache(cache);
    }

    private persistCampusesForDistrict(districtId: number, campuses: Campus[]): void {
        if (!campuses.length) {
            return;
        }
        const cache = this.readCampusNavCache();
        cache.campusesByDistrict[String(districtId)] = campuses;
        this.writeCampusNavCache(cache);
    }

    private cachedCampusesForDistrict(districtId: number | null): Campus[] {
        if (districtId == null) {
            return [];
        }
        return this.readCampusNavCache().campusesByDistrict[String(districtId)] ?? [];
    }

    private clearCampusNavCache(): void {
        try {
            localStorage.removeItem(CAMPUS_NAV_CACHE_KEY);
        } catch {
            /* ignore */
        }
    }

    private clearPersistedContext(): void {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
    }

    private applyActiveRoleScope(scope: ActiveRoleScope): Observable<void> {
        const { stateId, districtId, campusId, teacherId } = scope;
        const stored = this.readStoredContext();

        if (districtId == null) {
            const prev = this.selectionSubject.value;
            this.persistAndEmit({
                ...prev,
                stateId: stateId ?? prev.stateId,
                campusId: campusId ?? prev.campusId,
                teacherId: teacherId ?? prev.teacherId,
            });
            return of(undefined);
        }

        return this.filters.getDistrictById(districtId).pipe(
            switchMap((district) =>
                this.applyStoredOrUserContext(
                    {
                        stateId: stateId ?? district.stateId,
                        districtId: district.districtId,
                        campusId,
                        teacherId,
                        academicYearId:
                            stored?.academicYearId ??
                            this.selection.academicYearId ??
                            this.academicYears[0]?.academicYearId ??
                            null,
                        quarterCode:
                            stored?.quarterCode?.trim() ||
                            this.selection.quarterCode?.trim() ||
                            null,
                    },
                    district,
                ),
            ),
            switchMap(() => {
                if (this.selection.districtId == null) {
                    return of(undefined);
                }
                return forkJoin([
                    this.ensureDistrictFilterData(),
                    this.ensureDistrictCampuses(),
                    this.ensureCampusCategories(),
                ]).pipe(map(() => undefined));
            }),
            catchError(() =>
                this.applyStoredOrUserContext(
                    {
                        stateId,
                        districtId,
                        campusId,
                        teacherId,
                        academicYearId: stored?.academicYearId ?? this.selection.academicYearId,
                        quarterCode: stored?.quarterCode ?? this.selection.quarterCode,
                    },
                    null,
                ),
            ),
        );
    }

    private applyStoredOrUserContext(
        ctx: DistrictContextSelection,
        districtHint: District | null,
    ): Observable<void> {
        const stateId = ctx.stateId ?? districtHint?.stateId ?? null;
        const districtId = ctx.districtId ?? districtHint?.districtId ?? null;

        if (stateId == null && districtId == null) {
            return of(undefined);
        }

        const districts$ =
            this.allDistrictsLoaded && stateId != null
                ? of(this.filterDistrictsByState(stateId))
                : this.allDistrictsLoaded
                  ? of(this.filterDistrictsByState(null))
                  : this.filters
                        .listDistricts({ stateId: stateId ?? undefined, activeOnly: true })
                        .pipe(catchError(() => of<District[]>([])));

        return districts$.pipe(
            tap((districts) => {
                this.districts = districts;
            }),
            switchMap((districts) => {
                const dId = districtId ?? districts[0]?.districtId ?? null;
                if (dId == null) {
                    this.persistAndEmit({
                        stateId,
                        districtId: null,
                        campusId: ctx.campusId ?? null,
                        teacherId: ctx.teacherId ?? null,
                        academicYearId: ctx.academicYearId,
                        quarterCode: null,
                    });
                    return of(undefined);
                }

                const dist = districts.find((d) => d.districtId === dId);
                const resolvedState = stateId ?? dist?.stateId ?? null;

                const yearId =
                    ctx.academicYearId ??
                    this.academicYears[0]?.academicYearId ??
                    null;
                const quarter =
                    ctx.quarterCode?.trim() ||
                    this.readStoredContext()?.quarterCode?.trim() ||
                    FALLBACK_QUARTER_CODE;

                this.persistAndEmit({
                    stateId: resolvedState,
                    districtId: dId,
                    campusId: ctx.campusId ?? null,
                    teacherId: ctx.teacherId ?? null,
                    academicYearId: yearId,
                    quarterCode: quarter,
                });
                return of(undefined);
            }),
        );
    }

    /** Display label for quarter dropdowns (e.g. Quarter 1). */
    quarterDisplayLabel(q: DistrictQuarter): string {
        const name = q.quarterName?.trim();
        if (name) {
            return name;
        }
        const rank = this.quarterSequenceRank(q);
        if (rank < 100) {
            return `Quarter ${rank}`;
        }
        return q.quarterCode?.trim() || '—';
    }

    private sortDistrictQuarters(quarters: DistrictQuarter[]): DistrictQuarter[] {
        return [...quarters].sort((a, b) => {
            const rankA = this.quarterSequenceRank(a);
            const rankB = this.quarterSequenceRank(b);
            if (rankA !== rankB) {
                return rankA - rankB;
            }
            return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        });
    }

    private quarterSequenceRank(q: DistrictQuarter): number {
        const combined = `${q.quarterName ?? ''} ${q.quarterCode ?? ''}`.trim();
        const numMatch = combined.match(/(?:quarter\s*|^Q?\s*)(\d+)\b/i);
        if (numMatch) {
            return parseInt(numMatch[1], 10);
        }
        const code = (q.quarterCode ?? '').toUpperCase();
        const known: Record<string, number> = {
            BOY: 1,
            PA1: 2,
            PA2: 3,
            MOY: 4,
            PA3: 5,
            PA4: 6,
            PA5: 7,
            EOY: 8,
        };
        if (known[code] != null) {
            return known[code];
        }
        return (q.sortOrder ?? 999) + 100;
    }
}

function emptyToNull(v: string | null | undefined): string | null {
    if (v == null) {
        return null;
    }
    const trimmed = String(v).trim();
    return trimmed === '' ? null : trimmed;
}

/** Growth APIs expect full test language names (e.g. ENGLISH, SPANISH), not ENG/SPA codes. */
function normalizeTestLanguage(v: string | null | undefined): string | null {
    const trimmed = emptyToNull(v);
    if (trimmed == null) {
        return null;
    }
    switch (trimmed.toUpperCase()) {
        case 'ENG':
        case 'ENGLISH':
            return 'ENGLISH';
        case 'SPA':
        case 'SPANISH':
            return 'SPANISH';
        default:
            return trimmed;
    }
}
