import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, DestroyRef, ElementRef, HostListener, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { filter, finalize, take, distinctUntilChanged, map } from 'rxjs/operators';
import { combineLatest, forkJoin, Observable } from 'rxjs';
import { Store } from '@ngrx/store';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { AppInitializerService } from '../../core/services/app-initializer.service';
import { AuthService } from '../../core/services/auth.service';
import { DashboardReportService } from '../../core/services/dashboard-report.service';
import { DistrictContextService } from '../../core/services/district-context.service';
import { LayoutSharedModule } from '../../shared/layout-shared.module';
import { formatRoleLabel, roleIdFromName, ROLE_IDS } from '../../core/constants/auth-roles';
import type { Campus, CampusCategory } from '../../core/models/simplify-api.model';
import Swal from 'sweetalert2';

interface CampusNavGroup {
    key: string;
    name: string;
    campuses: Campus[];
}

/** Static menu parents and the URL prefixes that belong to them (same map as the old sidebar). */
const MENU_PARENTS: Array<{ key: string; prefixes: string[] }> = [
    { key: 'campuses', prefixes: ['/dashboard/campus', '/dashboard/campus-category'] },
    { key: 'standards', prefixes: ['/academies'] },
    { key: 'ttess', prefixes: ['/t-tess', '/students'] },
    { key: 'attendance', prefixes: ['/attendance'] },
    { key: 'user-setups', prefixes: ['/users', '/user-setups', '/data-uploads'] },
];


@Component({
    selector: 'header',
    templateUrl: './header.component.html',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, TranslateModule, LayoutSharedModule],
    host: {
        '[class.dov-nav-raised]': 'isDistrictOverviewPage',
    },
})
export class HeaderComponent implements OnInit {
    store: any;
    search = false;
    /** Desktop dropdown currently open (parent key), null when none. */
    menuOpen: string | null = null;
    /** Campus category groups expanded inside the Campuses dropdown. */
    campusGroupsOpen: string[] = [];
    /** Mobile slide-down menu visibility. */
    mobileMenuOpen = false;
    /** Mobile menu parents currently expanded. */
    mobileOpen: string[] = [];
    /** Shows a compact spinner until reference data + saved context finish loading. */
    contextToolbarLoading = true;
    /** Quarter dropdown on routes whose analytics are filtered by reporting quarter. */
    showQuarterSelector = false;
    /** True while the dashboard PDF report is being generated. */
    reportLoading = false;
    /** FB-style "Back to <parent scope>" button: null when at the top of the scope tree. */
    scopeBackLabel: string | null = null;
    scopeBackRoute: string[] = [];
    /** Breadcrumb of the current drill-down scope, e.g. "Sheldon ISD · Royalwood Elementary". */
    scopeCrumb: string | null = null;
    private readonly quarterSelectorRoutePatterns = [
        /^\/dashboard(\/|$)/,
        /^\/students(\/|$)/,
        /^\/reports(\/|$)/,
        /^\/academies\/standards-matrix$/,
        /^\/data-uploads$/,
        /^\/attendance\/individual$/,
        /^\/individual-attendance$/,
    ];
    private routerSub?: { unsubscribe(): void };
    notifications = [
        {
            id: 1,
            profile: 'user-profile.jpeg',
            message: '<strong class="text-sm mr-1">John Doe</strong>invite you to <strong>Prototyping</strong>',
            time: '45 min ago',
        },
        {
            id: 2,
            profile: 'profile-34.jpeg',
            message: '<strong class="text-sm mr-1">Adam Nolan</strong>mentioned you to <strong>UX Basics</strong>',
            time: '9h Ago',
        },
        {
            id: 3,
            profile: 'profile-16.jpeg',
            message: '<strong class="text-sm mr-1">Anna Morgan</strong>Upload a file',
            time: '9h Ago',
        },
    ];
    messages = [
        {
            id: 1,
            image: this.sanitizer.bypassSecurityTrustHtml(
                `<span class="grid place-content-center w-9 h-9 rounded-full bg-success-light dark:bg-success text-success dark:text-success-light"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg></span>`,
            ),
            title: 'Congratulations!',
            message: 'Your OS has been updated.',
            time: '1hr',
        },
        {
            id: 2,
            image: this.sanitizer.bypassSecurityTrustHtml(
                `<span class="grid place-content-center w-9 h-9 rounded-full bg-info-light dark:bg-info text-info dark:text-info-light"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg></span>`,
            ),
            title: 'Did you know?',
            message: 'You can switch between artboards.',
            time: '2hr',
        },
        {
            id: 3,
            image: this.sanitizer.bypassSecurityTrustHtml(
                `<span class="grid place-content-center w-9 h-9 rounded-full bg-danger-light dark:bg-danger text-danger dark:text-danger-light"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span>`,
            ),
            title: 'Something went wrong!',
            message: 'Send Report',
            time: '2days',
        },
        {
            id: 4,
            image: this.sanitizer.bypassSecurityTrustHtml(
                `<span class="grid place-content-center w-9 h-9 rounded-full bg-warning-light dark:bg-warning text-warning dark:text-warning-light"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></span>`,
            ),
            title: 'Warning',
            message: 'Your password strength is low.',
            time: '5days',
        },
    ];

    constructor(
        public translate: TranslateService,
        public storeData: Store<any>,
        public router: Router,
        private appSetting: AppInitializerService,
        private sanitizer: DomSanitizer,
        public authService: AuthService,
        readonly districtContext: DistrictContextService,
        private dashboardReport: DashboardReportService,
        private destroyRef: DestroyRef,
        private cdr: ChangeDetectorRef,
        private host: ElementRef<HTMLElement>,
    ) {
        this.initStore();
    }

    /** Campuses dropdown data — same groups/sorting the left sidebar used. */
    readonly campusNavGroups$: Observable<CampusNavGroup[]> = combineLatest([
        this.districtContext.campusCategories$,
        this.districtContext.campuses$,
    ]).pipe(map(([categories, campuses]) => this.buildCampusNavGroups(categories, campuses)));

    /** Closes any open dropdown when the user clicks outside the bar. */
    @HostListener('document:click', ['$event'])
    onDocumentClick(event: MouseEvent): void {
        const target = event.target as Node | null;
        if (target && this.host.nativeElement.contains(target)) {
            return;
        }
        this.closeAllMenus();
    }

    @HostListener('document:keydown.escape')
    onEscape(): void {
        this.closeAllMenus();
    }

    async initStore() {
        this.storeData
            .select((d: any) => d.index)
            .subscribe((d: any) => {
                this.store = d;
            });
    }

    ngOnInit() {
        this.watchBootstrapReady();
        this.updateQuarterSelectorVisibility(this.router.url);
        this.updateScopeIndicator(this.router.url);
        this.routerSub = this.router.events.subscribe((event) => {
            if (event instanceof NavigationEnd) {
                this.closeAllMenus();
                this.updateQuarterSelectorVisibility(event.urlAfterRedirects);
                this.updateScopeIndicator(event.urlAfterRedirects);
            }
        });
        this.districtContext.selection$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => {
                this.loadQuartersIfNeeded();
                this.updateScopeIndicator(this.router.url);
            });
        // Campus reference data lands asynchronously - recompute the crumb
        // when the campus list becomes available.
        this.districtContext.campuses$
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.updateScopeIndicator(this.router.url));
        // Campuses dropdown: load groups on bootstrap and whenever the district changes.
        this.districtContext.selection$
            .pipe(
                map((selection) => selection.districtId),
                distinctUntilChanged(),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe(() => this.loadCampusNav());
        this.loadCampusNav();
    }

    /** Generates the dashboard PDF report for the current selection. */
    async generateReport(): Promise<void> {
        if (this.reportLoading) {
            return;
        }
        this.reportLoading = true;
        this.cdr.markForCheck();
        try {
            await this.dashboardReport.generateCurrentReport();
            await Swal.fire({
                icon: 'success',
                title: 'Report downloaded',
                text: 'Dashboard report PDF saved.',
                timer: 2200,
                showConfirmButton: false,
            });
        } catch (err: any) {
            console.error('Dashboard report generation failed', err);
            await Swal.fire({
                icon: 'error',
                title: 'Report failed',
                text: err?.message || 'Could not generate the dashboard report.',
            });
        } finally {
            this.reportLoading = false;
            this.cdr.markForCheck();
        }
    }

    private loadQuartersIfNeeded(): void {
        if (!this.showQuarterSelector || this.districtContext.selection.districtId == null) {
            return;
        }
        this.districtContext.ensureDistrictQuarters().subscribe(() => this.cdr.markForCheck());
    }

    private updateQuarterSelectorVisibility(url: string): void {
        const path = url.split('?')[0].split('#')[0];
        const visible =
            !this.isDistrictOverviewPage &&
            this.quarterSelectorRoutePatterns.some((pattern) => pattern.test(path));
        this.showQuarterSelector = visible;
        this.loadQuartersIfNeeded();
        this.cdr.markForCheck();
    }

    // ── Top navigation menu (replaces the old left sidebar) ────────────────────

    /** Current path without query string / fragment. */
    private currentUrl(): string {
        return this.router.url.split('?')[0].split('#')[0] || '/';
    }

    /** True when the current route belongs to the given menu parent. */
    isParentActive(key: string): boolean {
        const url = this.currentUrl();
        const parent = MENU_PARENTS.find((p) => p.key === key);
        return !!parent && parent.prefixes.some((prefix) => url === prefix || url.startsWith(prefix + '/'));
    }

    isMenuOpen(key: string): boolean {
        return this.menuOpen === key;
    }

    /** Desktop: open/close one dropdown panel at a time. */
    toggleMenu(key: string): void {
        this.menuOpen = this.menuOpen === key ? null : key;
        this.campusGroupsOpen = [];
    }

    isCampusGroupOpen(key: string): boolean {
        return this.campusGroupsOpen.includes(key);
    }

    /** Expand/collapse a campus level inside the Campuses dropdown (desktop + mobile). */
    toggleCampusGroup(key: string): void {
        if (this.campusGroupsOpen.includes(key)) {
            this.campusGroupsOpen = this.campusGroupsOpen.filter((k) => k !== key);
        } else {
            this.campusGroupsOpen = [...this.campusGroupsOpen, key];
        }
    }

    toggleMobileMenu(): void {
        this.mobileMenuOpen = !this.mobileMenuOpen;
        this.menuOpen = null;
        this.campusGroupsOpen = [];
    }

    isMobileGroupOpen(key: string): boolean {
        return this.mobileOpen.includes(key);
    }

    toggleMobileGroup(key: string): void {
        if (this.mobileOpen.includes(key)) {
            this.mobileOpen = this.mobileOpen.filter((k) => k !== key);
        } else {
            this.mobileOpen = [...this.mobileOpen, key];
        }
    }

    /** Navigated from a menu link — close every open panel. */
    onNavClick(): void {
        this.closeAllMenus();
    }

    closeAllMenus(): void {
        this.menuOpen = null;
        this.campusGroupsOpen = [];
        this.mobileMenuOpen = false;
        this.mobileOpen = [];
        this.cdr.markForCheck();
    }

    /** Loads campuses + categories for the Campuses dropdown (cheap no-op when already loaded). */
    private loadCampusNav(): void {
        if (!this.authService.isLoggedIn()) {
            return;
        }
        forkJoin([
            this.districtContext.ensureDistrictCampuses(),
            this.districtContext.ensureCampusCategories(),
        ]).subscribe(() => this.cdr.markForCheck());
    }

    /** Groups campuses under their category for the Campuses dropdown. */
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

    /** Menu category order: Elementary, Middle, then High. */
    private categorySortRank(name?: string, code?: string): number {
        const label = `${name ?? ''} ${code ?? ''}`.toLowerCase();
        if (label.includes('elementary')) {
            return 0;
        }
        if (label.includes('early childhood')) {
            return 1;
        }
        if (label.includes('middle')) {
            return 2;
        }
        if (label.includes('high')) {
            return 3;
        }
        return 99;
    }

    /** Distinct icon per campus level (Elementary / Middle / High). */
    campusGroupIcon(name: string): 'book' | 'trending' | 'award' {
        const n = (name || '').toLowerCase();
        if (n.indexOf('elementary') > -1) {
            return 'book';
        }
        if (n.indexOf('middle') > -1) {
            return 'trending';
        }
        if (n.indexOf('high') > -1) {
            return 'award';
        }
        return 'book';
    }

    campusRouteSlug(campus: Campus): string {
        return this.districtContext.campusRouteSlug(campus);
    }

    removeNotification(value: number) {
        this.notifications = this.notifications.filter((d) => d.id !== value);
    }

    removeMessage(value: number) {
        this.messages = this.messages.filter((d) => d.id !== value);
    }

    changeLanguage(item: any) {
        this.translate.use(item.code);
        this.appSetting.toggleLanguage(item);
        if (this.store.locale?.toLowerCase() === 'ae') {
            this.storeData.dispatch({ type: 'toggleRTL', payload: 'rtl' });
        } else {
            this.storeData.dispatch({ type: 'toggleRTL', payload: 'ltr' });
        }
        window.location.reload();
    }

    signOut(): void {
        this.authService.logout();
        void this.router.navigateByUrl('/auth/login');
    }

    /** Logged-in user from auth storage / JWT. */
    get currentUser() {
        return this.authService.getCurrentUser();
    }

    get userDisplayName(): string {
        const u = this.currentUser;
        if (!u) {
            return 'User';
        }
        const name = u.displayName?.trim();
        if (name) {
            return name;
        }
        const local = u.email?.split('@')[0]?.trim();
        return local || 'User';
    }

    get userEmail(): string {
        return this.currentUser?.email ?? '';
    }

    get activeRoleLabel(): string {
        const role = this.authService.getActiveRole();
        return role ? formatRoleLabel(role) : this.currentUser?.roleName ?? '';
    }

    get showRoleSwitcher(): boolean {
        return this.authService.hasMultipleRoles();
    }

    /** District Overview replaces the two-row navbar with a single merged row. */
    get isDistrictOverviewPage(): boolean {
        const path = this.currentUrl();
        if (path !== '/dashboard') {
            return false;
        }
        const role = this.authService.getActiveRole();
        if (!role) {
            return false;
        }
        return (roleIdFromName(role.roleName) ?? role.roleId) === ROLE_IDS.DistrictAdmin;
    }

    goToRoleSelection(): void {
        this.router.navigate(['/auth/select-role']);
    }

    /** First letter of the user's first name (or email local-part). */
    get userInitial(): string {
        const firstName = this.userDisplayName.split(/\s+/)[0] ?? '';
        const letter = firstName[0] ?? this.userEmail[0] ?? '?';
        return letter.toUpperCase();
    }

    private watchBootstrapReady(): void {
        if (this.districtContext.bootstrapLoaded) {
            this.contextToolbarLoading = false;
            this.loadQuartersIfNeeded();
            this.updateScopeIndicator(this.router.url);
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
                this.loadQuartersIfNeeded();
                this.updateScopeIndicator(this.router.url);
                this.cdr.markForCheck();
            });
    }

    /**
     * FB-style scope indicator: on drill-down routes show a "Back to <parent>"
     * button plus a breadcrumb of the current scope. Null everywhere else.
     */
    private updateScopeIndicator(url: string): void {
        const path = url.split('?')[0].split('#')[0];
        const currentDistrictName = this.districtNameById(
            this.districtContext.selection.districtId,
        );

        // Classroom drill-down: /dashboard/campus/:id/teacher/:teacherId
        let m = path.match(/^\/dashboard\/campus\/([^/]+)\/teacher\/([^/]+)$/);
        if (m) {
            const campus = this.campusFromRouteParam(m[1]);
            this.scopeBackRoute = ['/dashboard/campus', m[1]];
            this.scopeBackLabel = 'Back to School';
            this.scopeCrumb =
                [currentDistrictName, campus?.campusName || null]
                    .filter(Boolean)
                    .join(' · ') || null;
            this.cdr.markForCheck();
            return;
        }

        // Campus drill-down: /dashboard/campus/:id
        m = path.match(/^\/dashboard\/campus\/([^/]+)$/);
        if (m) {
            const campus = this.campusFromRouteParam(m[1]);
            const scopedCampusId = this.authService.scopedCampusId();
            const isOwnCampus =
                !!this.authService.isCampusScopedRole() &&
                scopedCampusId != null &&
                campus?.campusId === scopedCampusId;
            this.scopeCrumb =
                [currentDistrictName, campus?.campusName || null]
                    .filter(Boolean)
                    .join(' · ') || null;
            if (isOwnCampus) {
                // Principal on their own campus - already their home scope.
                this.scopeBackLabel = null;
            } else {
                this.scopeBackRoute = ['/dashboard'];
                this.scopeBackLabel = 'Back to District';
            }
            this.cdr.markForCheck();
            return;
        }

        // Campus category: /dashboard/campus-category/:categoryId
        m = path.match(/^\/dashboard\/campus-category\/([^/]+)$/);
        if (m) {
            const catId = Number(m[1]);
            const cat = this.districtContext.campusCategories.find(
                (c) => c.campusCategoryId === catId,
            );
            this.scopeBackRoute = ['/dashboard'];
            this.scopeBackLabel = 'Back to District';
            this.scopeCrumb =
                [currentDistrictName, cat?.categoryName || null]
                    .filter(Boolean)
                    .join(' · ') || null;
            this.cdr.markForCheck();
            return;
        }

        // Specific district dashboard: /dashboard/district/:districtId
        m = path.match(/^\/dashboard\/district\/([^/]+)$/);
        if (m) {
            this.scopeBackRoute = ['/dashboard'];
            this.scopeBackLabel = 'Back to Admin';
            this.scopeCrumb = this.districtNameById(Number(m[1])) || currentDistrictName;
            this.cdr.markForCheck();
            return;
        }

        this.scopeBackLabel = null;
        this.scopeCrumb = null;
        this.cdr.markForCheck();
    }

    /** Resolves a campus list entry from the route param (campusCode or name slug). */
    private campusFromRouteParam(routeId: string) {
        const list = this.districtContext.campuses || [];
        if (!list.length) {
            return null;
        }
        const id = routeId.toLowerCase();
        const byCode = list.find((c) => c.campusCode.toLowerCase() === id);
        if (byCode) {
            return byCode;
        }
        const dashed = id.replace(/-/g, ' ');
        return (
            list.find(
                (c) =>
                    c.campusName.toLowerCase() === dashed ||
                    c.campusName.toLowerCase().replace(/[^a-z0-9]+/g, '-') === id,
            ) || null
        );
    }

    private districtNameById(districtId: number | null): string | null {
        if (districtId == null) {
            return null;
        }
        return (
            this.districtContext.districts?.find((d) => d.districtId === districtId)
                ?.districtName || null
        );
    }
}
