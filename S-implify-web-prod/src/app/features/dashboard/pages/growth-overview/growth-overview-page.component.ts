import { CommonModule } from '@angular/common';
import {
    AfterViewInit,
    ChangeDetectorRef,
    Component,
    ElementRef,
    OnDestroy,
    OnInit,
    ViewChild,
} from '@angular/core';
import { RouterModule } from '@angular/router';
import { Store } from '@ngrx/store';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Subscription, combineLatest, forkJoin, merge, of, Subject, type Observable } from 'rxjs';
import {
    catchError,
    distinctUntilChanged,
    finalize,
    map,
    switchMap,
    takeUntil,
    timeout,
} from 'rxjs/operators';

import { ProgressRingComponent } from './progress-ring.component';
import { DistrictContextService } from '../../../../core/services/district-context.service';
import { AuthService } from '../../../../core/services/auth.service';
import { ROLE_IDS, roleIdFromName } from '../../../../core/constants/auth-roles';

import { ApiService } from '../../../../core/services/api.service';
import { SharedModule } from '../../../../shared/shared.module';
import { GrowthAnalyticsService } from '../../../../core/services/growth-analytics.service';
import { StudentGrowthRecordsService } from '../../../../core/services/student-growth-records.service';
import { TeachersService } from '../../../../core/services/teachers.service';
import { AttendanceAnalyticsService } from '../../../../core/services/attendance-analytics.service';
import { CcmrAnalyticsService } from '../../../../core/services/ccmr-analytics.service';
import { DashboardAnalyticsService } from '../../../../core/services/dashboard-analytics.service';
import type {
    Campus,
    CampusCategory,
    CampusCategoryGrowthMetricsResponse,
    CampusGrowthMetricsRequest,
    CampusGrowthMetricsResponse,
    CcmrAcademyStatsItemDto,
    CcmrDistrictMonthRateDto,
    DistrictAttendanceSummaryDto,
    MonthlyAttendanceStatDto,
    DistrictOverallPercentagesResponse,
    DistrictQuarter,
    GrowthFilters,
    GrowthOverallMetricsRequest,
    GrowthOverallMetricsResponse,
    GrowthOverallGradeByCategory,
    StudentGrowthRecordResponse,
    StudentGrowthRecordsByTeacherRequest,
    TeacherGrowthMetricsResponse,
    TeacherStudentGrowthMetricsResponse,
    TopClassroomsRequest,
    TopStudentsRequest,
    TopTeacherItemDto,
    TopTeachersRequest,
} from '../../../../core/models/simplify-api.model';
import { areGrowthFiltersEqual, CCMR_DEFAULT_CREDIT_THRESHOLDS } from '../../../../core/models/simplify-api.model';
import { StudentMobilityService } from '../../../../core/services/student-mobility.service';
import { downloadCsv, printTable, type TableExportColumn } from '../../../../core/utils/table-export.util';
import { scoreBandRowClass } from '../../../../core/utils/score-band-row-class.util';
import { NgxCustomModalComponent } from 'ngx-custom-modal';
import { STUDENT_BASE_COLUMNS } from '../../../students/data/student-table.mock';
import type { StudentColumnDef, StudentRow } from '../../../students/models/student-table.model';
import { mapStudentGrowthRecordToRow } from '../../../students/utils/student-growth-record.mapper';
import { buildQuarterDiffColumnDefs } from '../../../students/utils/student-quarter-progression.util';

/** Top teachers on campus-category drill-down (merged campus-teacher-metrics). */
export interface CategoryTeacherLeaderVm {
    teacherId: number;
    name: string;
    subjectLabel: string;
    componentScore: number;
    growth: number;
}

/** Top growth leaders — POST /api/growth/top-classrooms. */
export interface CategoryGrowthLeaderVm {
    campusName: string;
    instructorName: string;
    gradeLabel?: string;
    growth: number;
}

/** Top classrooms on a single-campus drill-down (teacher growth rows). */
export interface CampusClassroomLeaderVm {
    instructorName: string;
    gradeLabel: string;
    growth: number;
}

/** Top students on a single-campus drill-down (POST /growth/top-students). */
export interface CampusStudentLeaderVm {
    studentName: string;
    grade?: string;
    componentScore: number | null;
    growth: number | null;
}

/** District home — POST /api/teachers/top. */
export interface DistrictTopTeacherVm {
    rank?: number;
    name: string;
    subjectLabel: string;
    summativeScore: number | null;
}

/** District home — POST /api/growth/top-classrooms. */
export interface DistrictTopClassroomVm {
    instructorName: string;
    gradeLabel: string;
    growth: number | null;
}

/** Student row for teacher classroom drill-down chart (aggregated per student). */
export interface TeacherStudentLeaderVm {
    studentName: string;
    componentScore: number;
    growth: number;
}

/** District home — campus row sorted by growth (POST /growth/campus-metrics). */
export interface DistrictCampusGrowthRankVm {
    campusName: string;
    growth: number | null;
    /** Component score (real, from the same campus-metrics payload). */
    score: number | null;
}

/** District Admin KPI row — one classroom (teacher) with its own calculated metrics. */
interface DistrictAdminClassroomRow {
    id: string;
    name: string;
    campus: string;
    campusCode: string;
    grade: string;
    cs: number | null;
    csGrade: string | null;
    growth: number | null;
    growthGrade: string | null;
}

/** District Admin popup row — campuses and classrooms share one table shape. */
interface DistrictAdminListRow {
    id: string;
    name: string;
    campus?: string;
    campusCode?: string;
    code?: string;
    cs: number | null;
    csGrade: string | null;
    growth: number | null;
    growthGrade: string | null;
}

/** District Admin students popup row. */
interface DistrictAdminStudentRow {
    key: string;
    name: string;
    campusCode: string;
    campus: string;
    grade: string;
    classroom: string;
}

/** One school-level tab in the Aurora v2 campus-level header. */
export interface CampusLevelTabVm {
    campusCategoryId: number;
    label: string;
    count: number;
}

/** One real data-quality alert shown by the campus-level header bell. */
export interface CampusLevelAlertVm {
    id: string;
    title: string;
    detail: string;
    slug: string | null;
}

/** A user's saved campus-level view (year + window + level + filters). */
export interface SavedCampusLevelView {
    id: string;
    districtId: number;
    academicYearId: number | null;
    quarterCode: string | null;
    campusCategoryId: number;
    filters: GrowthFilters;
    savedAt: string;
}

/** Aurora v2 District Overview — one campus joined from campus-metrics + reference data. */
export interface DistrictOverviewCampusVm {
    campusId: number | null;
    campusCode: string;
    campusName: string;
    shortCode: string;
    slug: string;
    levelCode: string;
    levelLabel: string;
    cs: number | null;
    growth: number | null;
}

/** Aurora v2 District Overview — one level card (real category + overall-metrics grades). */
export interface DistrictOverviewLevelVm {
    campusCategoryId: number;
    code: string;
    label: string;
    campusCount: number;
    cs: number | null;
    csGrade: string | null;
    growth: number | null;
    growthGrade: string | null;
    link: string;
}

/** Aurora v2 District Overview — one rule-derived "Needs your attention" card. */
export interface DistrictOverviewAlertVm {
    id: string;
    category: string;
    title: string;
    detail: string;
    metrics: string[];
    actionLabel: string;
    actionLink: string;
}

/** Aurora v2 District Overview — saved view (year + window + search filters). */
export interface DistrictOverviewSavedView {
    id: string;
    districtId: number;
    academicYearId: number | null;
    quarterCode: string | null;
    filters: GrowthFilters;
    savedAt: string;
}

/** Aurora v2 District Overview — scatter point in the campus performance map. */
export interface DistrictOverviewScatterPointVm {
    key: string;
    label: string;
    name: string;
    levelCode: string;
    cs: number;
    growth: number;
    x: number;
    y: number;
    color: string;
    slug: string;
    quadrantKey: string;
}

/** District home — academy row sorted by CCMR (POST /ccmr/academy-stats). */
export interface CcmrAcademyRankVm {
    school: string;
    ccmrPct: number | null;
    gradPct: number | null;
}

/** View model for “Schools summary” category rows. */
export interface SchoolsCategorySummaryRowVm {
    campusCategoryId: number;
    label: string;
    /** Component score (0–100) — null when the period has no data. */
    componentPct: number | null;
    /** Growth score (0–100) — null when the period has no data. */
    growthPct: number | null;
}

@Component({
    templateUrl: './growth-overview-page.component.html',
    standalone: true,
    imports: [CommonModule, RouterModule, SharedModule, ProgressRingComponent],
})
export class GrowthOverviewPageComponent implements OnInit, AfterViewInit, OnDestroy {
    store: any;
    /** Set only from POST /growth/campus-metrics (no demo chart in initCharts). */
    campusesOverviewChart: any = null;
    isLoading = true;
    campusId: string | null = null;
    /** Set when route is `/dashboard/campus/:id/teacher/:teacherId`. */
    teacherRouteId: number | null = null;
    teacherName = 'Classroom';
    /** Set when route is `/dashboard/campus-category/:categoryId` (Schools summary drill-down). */
    campusCategoryRouteId: number | null = null;
    /** Set when route is `/dashboard/district/:districtId` (super-admin district dashboard). */
    districtRouteId: number | null = null;
    campusName: string = 'Campus Dashboard';

    /**
     * True when the route targets a district the user's active role is not scoped to.
     * District-pinned roles (District Admin, Principal, Teacher) cannot switch districts —
     * show an explicit notice instead of silently rendering the pinned district's stats.
     */
    get districtScopeBlocked(): boolean {
        if (this.districtRouteId == null || !this.auth.hasFixedDistrictFromActiveRole()) {
            return false;
        }
        return this.auth.getActiveRoleScope()?.districtId !== this.districtRouteId;
    }

    /** Display name of the district the active role is pinned to. */
    get pinnedDistrictName(): string {
        const id = this.auth.getActiveRoleScope()?.districtId;
        return this.districtContext.districts.find((d) => d.districtId === id)?.districtName || 'your district';
    }

    /** KPI values from POST /growth/overall-metrics only (placeholders until loaded). */
    mockComponentScore: string = '—';
    mockGrowth: string = '—';
    mockApp: string = '—';
    mockMeet: string = '—';
    mockMaster: string = '—';
    mockAttendancePct: string = '—';
    /** Top-level letter grades from overall-metrics (often null). */
    overallCsGrade: string | null = null;
    overallGrowthGrade: string | null = null;
    /** Category-wise letter grades from overall-metrics `gradesByCategory`. */
    gradesByCategory: GrowthOverallGradeByCategory[] = [];

    /** ES → MS → HS level rings: score (0–100) + letter grade per level, from `gradesByCategory`. */
    get conceptCsLevelRings(): Array<{ label: string; score: number | null; grade: string | null }> {
        return this.levelRings('cs');
    }

    /** ES → MS → HS level rings for growth. */
    get conceptGrowthLevelRings(): Array<{ label: string; score: number | null; grade: string | null }> {
        return this.levelRings('growth');
    }

    /** APP / MEET / MASTER legend rows: label + formatted percentage ('—' when no data). */
    get conceptBandLegendRows(): Array<{ label: string; pctText: string }> {
        return (
            [
                { label: 'APP', value: this.mockApp },
                { label: 'MEET', value: this.mockMeet },
                { label: 'MASTER', value: this.mockMaster },
            ] as const
        ).map(({ label, value }) => ({
            label,
            pctText: this.scoreLevelText(this.gaugeNumber(value)),
        }));
    }

    get conceptCsScoreText(): string {
        return this.mockComponentScore === '—' ? '—' : `${this.mockComponentScore}%`;
    }

    get conceptGrowthScoreText(): string {
        return this.mockGrowth === '—' ? '—' : `${this.mockGrowth}%`;
    }

    get conceptAppScoreText(): string {
        return this.mockApp === '—' ? '—' : `${this.mockApp}%`;
    }

    get conceptMeetScoreText(): string {
        return this.mockMeet === '—' ? '—' : `${this.mockMeet}%`;
    }

    get conceptMasterScoreText(): string {
        return this.mockMaster === '—' ? '—' : `${this.mockMaster}%`;
    }

    /** NaN/'—'-safe parser for the mock* percentage strings — used by gauge-less legend/donut code. */
    /** Numeric attendance percentage for the ring (null → empty state). */
    get attendanceGaugeValue(): number | null {
        return this.gaugeNumber(this.mockAttendancePct);
    }

    private gaugeNumber(raw: string): number | null {
        const n = parseFloat(String(raw).replace(/[^\d.-]/g, ''));
        return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
    }

    /** Per-level score (0–100) + letter grade, ES → MS → HS order. */
    private levelRings(key: 'cs' | 'growth'): Array<{ label: string; score: number | null; grade: string | null }> {
        const rows = this.gradesByCategory ?? [];
        return (['ES', 'MS', 'HS'] as const).map((label) => {
            const row = rows.find((r) => (r?.categoryCode ?? '').trim().toUpperCase() === label);
            const rawScore = key === 'cs' ? row?.cs : row?.growth;
            const score = Number.isFinite(rawScore) && rawScore != null ? Math.min(100, Math.max(0, Number(rawScore))) : null;
            const rawGrade = key === 'cs' ? row?.csGrade : row?.growthGrade;
            const grade = typeof rawGrade === 'string' && rawGrade.trim() ? rawGrade.trim().toUpperCase() : null;
            return { label, score, grade };
        });
    }

    /** True while POST /growth/overall-metrics is in flight (KPI strip). */
    kpiMetricsLoading = false;
    /** True while campus / classroom overview chart data is loading. */
    campusChartLoading = false;
    /** True while POST /growth/campus-category-metrics is in flight. */
    categorySummaryLoading = false;
    /** True while POST /campus-attendance/ada-summary is in flight. */
    attendanceSummaryLoading = false;
    /** True while POST /ccmr/monthly-rates is in flight (Other summary). */
    ccmrSummaryLoading = false;
    ccmrSummaryError: string | null = null;
    ccmrRatePct: number | null = null;
    gradRatePct: number | null = null;
    teachersRatePct: number | null = null;
    /** True while POST /ccmr/academy-stats is in flight (ranking panel). */
    ccmrAcademyRankingLoading = false;
    ccmrAcademyRankingError: string | null = null;
    /** District home ROW 4 — sorted by growth descending. */
    districtCampusGrowthRanking: DistrictCampusGrowthRankVm[] = [];
    /** District home ROW 4 — sorted by CCMR descending. */
    ccmrAcademyRanking: CcmrAcademyRankVm[] = [];
    overallMetricsError: string | null = null;
    campusMetricsError: string | null = null;
    categoryMetricsError: string | null = null;

    /** Populated only from POST /growth/campus-category-metrics. */
    schoolsCategorySummaryRows: SchoolsCategorySummaryRowVm[] = [];

    /** Min chart width (px) when horizontal scroll is required; 0 when chart fills the panel. */
    campusesOverviewChartScrollWidth = 0;

    /** True when too many campuses for the panel at the target bar thickness. */
    useCampusesChartHorizontalScroll = false;

    /** Growth ranking rows derived from campus-metrics when viewing a campus category (replaces static list). */
    campusGrowthRanking: { campusName: string; growth: number | null }[] = [];

    /**
     * Schools sorted by component score with component % / growth % (campus-metrics).
     * There is no CCMR endpoint in growth APIs — this uses the same paired metric style with live data.
     */
    campusMetricPairsRanking: {
        campusName: string;
        componentScore: number | null;
        growth: number | null;
    }[] = [];

    categoryTopTeachers: CategoryTeacherLeaderVm[] = [];
    categoryTopGrowthLeaders: CategoryGrowthLeaderVm[] = [];
    categoryTeachersLoading = false;
    categoryTeacherMetricsError: string | null = null;

    campusTopClassrooms: CampusClassroomLeaderVm[] = [];
    campusTopStudents: CampusStudentLeaderVm[] = [];
    campusStudentsLoading = false;
    campusStudentsError: string | null = null;

    districtHomeTopTeachers: DistrictTopTeacherVm[] = [];
    districtHomeTopClassrooms: DistrictTopClassroomVm[] = [];
    districtLeaderboardsLoading = false;
    districtLeaderboardsError: string | null = null;

    teacherTopStudentsByScore: TeacherStudentLeaderVm[] = [];
    teacherTopStudentsByGrowth: TeacherStudentLeaderVm[] = [];
    /** Students modal table — POST /api/student-growth-records/by-teacher. */
    teacherStudentOverviewRows: StudentRow[] = [];
    teacherStudentOverviewColumns: StudentColumnDef[] = structuredClone(STUDENT_BASE_COLUMNS);
    teacherStudentDiffColumnFields: string[] = [];
    teacherStudentOverviewSearch = '';
    teacherStudentListLoading = false;

    private teacherLeaderboardSub?: Subscription;
    private campusStudentLeaderboardSub?: Subscription;
    private districtLeaderboardSub?: Subscription;
    private campusClassroomsSub?: Subscription;

    get isCampusCategoryView(): boolean {
        return this.campusCategoryRouteId != null;
    }

    // ==================================================================
    // Aurora v2 — CAMPUSES BY SCHOOL LEVEL page header
    // Everything below is presentation-only and reads the existing
    // district context / campus-metrics data. No new data source.
    // ==================================================================

    private static readonly SAVED_VIEWS_KEY_PREFIX = 'simplify_campus_level_views';
    private static readonly READ_ALERTS_KEY_PREFIX = 'simplify_campus_level_read_alerts';

    campusSearchQuery = '';
    campusSearchOpen = false;
    campusAlertsOpen = false;
    savedViewsOpen = false;
    campusViewSavedFlash = false;
    campusLevelRefreshing = false;
    savedCampusLevelViews: SavedCampusLevelView[] = [];

    private savedViewsLoadedKey = '';
    private readAlertsLoadedKey = '';
    private readAlertsByScope: Record<string, string[]> = {};

    /** Category behind the current `/dashboard/campus-category/:id` route (real reference data). */
    get campusLevelCategory(): CampusCategory | undefined {
        const id = this.campusCategoryRouteId;
        if (id == null) {
            return undefined;
        }
        return this.districtContext.campusCategories.find((c) => c.campusCategoryId === id);
    }

    /** District name for the breadcrumb, from the current selection. */
    get campusLevelDistrictName(): string {
        const id = this.districtContext.selection.districtId;
        return (
            this.districtContext.districts.find((d) => d.districtId === id)?.districtName ??
            'District'
        );
    }

    /** "HIGH SCHOOL" → "High" (data stores level names in caps). */
    private campusLevelBaseName(raw: string): string {
        const title = (raw || '')
            .trim()
            .replace(/\s+/g, ' ')
            .toLowerCase()
            .replace(/\b[a-z]/g, (c) => c.toUpperCase());
        return title.replace(/\s+schools?$/i, '').trim();
    }

    /** Short level name used in the breadcrumb and tabs (e.g. "High"). */
    get campusLevelShortName(): string {
        const raw = (this.campusLevelCategory?.categoryName ?? this.campusName ?? '').trim();
        const base = this.campusLevelBaseName(raw);
        return base && base !== 'Campus Category' ? base : 'Campuses';
    }

    /** Large page title (e.g. "High Schools"). */
    get campusLevelTitle(): string {
        const base = this.campusLevelShortName;
        return base === 'Campuses' ? 'Campuses' : `${base} Schools`;
    }

    /** Level label used in the VIEWING bar (e.g. "High schools"). */
    get campusLevelChipLabel(): string {
        const base = this.campusLevelShortName;
        return base === 'Campuses' ? 'Campuses' : `${base} schools`;
    }

    get campusLevelYearLabel(): string {
        const id = this.districtContext.selection.academicYearId;
        return (
            this.districtContext.academicYears.find((y) => y.academicYearId === id)?.yearLabel ??
            '—'
        );
    }

    get campusLevelWindowLabel(): string {
        const code = this.districtContext.selection.quarterCode;
        const quarter = this.districtContext.districtQuarters.find((q) => q.quarterCode === code);
        return quarter ? this.districtContext.quarterDisplayLabel(quarter) : code || '—';
    }

    /** Active campuses of the level currently being viewed. */
    get campusLevelCampuses(): Campus[] {
        const id = this.campusCategoryRouteId;
        if (id == null) {
            return [];
        }
        return this.districtContext.campuses.filter((c) => c.campusCategoryId === id);
    }

    /**
     * One tab per level that actually has campuses in the selected district.
     * Counts come from the same district campus list the rest of the portal uses,
     * so a level with no campuses can never appear and a count is never invented.
     */
    get campusLevelTabs(): CampusLevelTabVm[] {
        const campuses = this.districtContext.campuses;
        return this.districtContext.campusCategories
            .map((cat) => ({
                campusCategoryId: cat.campusCategoryId,
                label:
                    this.campusLevelBaseName(cat.categoryName || '') ||
                    cat.categoryCode ||
                    'Level',
                count: campuses.filter((c) => c.campusCategoryId === cat.campusCategoryId).length,
            }))
            .filter((tab) => tab.count > 0);
    }

    /** Campus search results — restricted to the level currently being viewed. */
    get campusSearchResults(): Campus[] {
        const q = this.campusSearchQuery.trim().toLowerCase();
        if (!q) {
            return [];
        }
        return this.campusLevelCampuses
            .filter((c) => `${c.campusName} ${c.campusCode}`.toLowerCase().includes(q))
            .sort((a, b) => (a.campusName || '').localeCompare(b.campusName || ''))
            .slice(0, 8);
    }

    onCampusSearchInput(): void {
        this.campusSearchOpen = !!this.campusSearchQuery.trim();
        this.campusAlertsOpen = false;
        this.savedViewsOpen = false;
    }

    clearCampusSearch(): void {
        this.campusSearchQuery = '';
        this.campusSearchOpen = false;
    }

    openFirstCampusSearchResult(event?: Event): void {
        if (event) {
            event.preventDefault();
        }
        const first = this.campusSearchResults[0];
        if (!first) {
            return;
        }
        this.campusSearchOpen = false;
        this.campusSearchQuery = '';
        this.router.navigate(['/dashboard/campus', this.districtContext.campusRouteSlug(first)]);
    }

    /**
     * Live, data-backed alerts for the current level/window. Only real conditions
     * are reported: campuses without a STAAR component score or growth value.
     */
    get campusLevelAlerts(): CampusLevelAlertVm[] {
        if (this.campusChartLoading) {
            return [];
        }
        const levelNames = new Set(this.campusLevelCampuses.map((c) => c.campusName));
        const rows = this.campusMetricPairsRanking.filter((r) => levelNames.has(r.campusName));
        if (!rows.length) {
            return [
                {
                    id: 'no-metrics',
                    title: 'No campus metrics for this level',
                    detail: `No STAAR component score or growth data for ${this.campusLevelShortName} in ${this.campusLevelWindowLabel}.`,
                    slug: null,
                },
            ];
        }
        return rows
            .filter((r) => r.componentScore == null || r.growth == null)
            .map((r) => ({
                id: `missing-${this.campusSlugFromName(r.campusName)}`,
                title: r.campusName || 'Campus',
                detail: 'Missing STAAR component score or growth for this window.',
                slug: this.campusSlugFromName(r.campusName),
            }));
    }

    get campusUnreadAlertCount(): number {
        this.ensureReadAlertsLoaded();
        const read = this.readAlertsByScope[this.campusAlertScopeKey()] ?? [];
        return this.campusLevelAlerts.filter((a) => !read.includes(a.id)).length;
    }

    toggleCampusAlerts(): void {
        this.campusAlertsOpen = !this.campusAlertsOpen;
        this.savedViewsOpen = false;
        if (this.campusAlertsOpen) {
            this.markCampusAlertsRead();
        }
    }

    private campusAlertScopeKey(): string {
        const s = this.districtContext.selection;
        return [
            s.districtId ?? '',
            s.academicYearId ?? '',
            s.quarterCode ?? '',
            this.campusCategoryRouteId ?? '',
        ].join('|');
    }

    private markCampusAlertsRead(): void {
        this.ensureReadAlertsLoaded();
        this.readAlertsByScope[this.campusAlertScopeKey()] = this.campusLevelAlerts.map((a) => a.id);
        try {
            localStorage.setItem(
                this.readAlertsStorageKey(),
                JSON.stringify(this.readAlertsByScope),
            );
        } catch {
            /* storage unavailable — read state stays in memory for this session */
        }
    }

    private ensureReadAlertsLoaded(): void {
        const key = this.readAlertsStorageKey();
        if (this.readAlertsLoadedKey === key) {
            return;
        }
        this.readAlertsLoadedKey = key;
        try {
            const raw = localStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : {};
            this.readAlertsByScope =
                parsed && typeof parsed === 'object' ? (parsed as Record<string, string[]>) : {};
        } catch {
            this.readAlertsByScope = {};
        }
    }

    private readAlertsStorageKey(): string {
        const userId = this.auth.getCurrentUser()?.userId ?? 'anonymous';
        return `${GrowthOverviewPageComponent.READ_ALERTS_KEY_PREFIX}:${userId}`;
    }

    /** Switch level tabs without losing the current year/window (stored in district context). */
    openCampusLevelTab(tab: CampusLevelTabVm): void {
        if (tab.campusCategoryId === this.campusCategoryRouteId) {
            return;
        }
        this.closeCampusHeaderPopovers();
        this.router.navigate(['/dashboard/campus-category', tab.campusCategoryId]);
    }

    /** Reload the page's own data with the current selectors. */
    refreshCampusLevelData(): void {
        if (this.campusLevelRefreshing) {
            return;
        }
        this.campusLevelRefreshing = true;
        this.metricsLoadReset$.next();
        this.loadDashboardMetrics(this.route.snapshot.paramMap);
        setTimeout(() => {
            this.campusLevelRefreshing = false;
            this.cdr.markForCheck();
        }, 900);
    }

    /** Help icon — hands off to the portal's existing AI assistant. */
    openCampusLevelHelp(): void {
        window.dispatchEvent(
            new CustomEvent('simplify-ai-prompt', {
                detail: { prompt: `Help me understand the ${this.campusLevelTitle} page` },
            }),
        );
    }

    closeCampusHeaderPopovers(): void {
        this.campusSearchOpen = false;
        this.campusAlertsOpen = false;
        this.savedViewsOpen = false;
    }

    // ----- Saved views (per signed-in user, per district) -----

    toggleSavedViews(): void {
        this.ensureSavedViewsLoaded();
        this.savedViewsOpen = !this.savedViewsOpen;
        this.campusAlertsOpen = false;
        this.campusSearchOpen = false;
    }

    saveCurrentCampusLevelView(): void {
        const s = this.districtContext.selection;
        const categoryId = this.campusCategoryRouteId;
        if (s.districtId == null || categoryId == null) {
            return;
        }
        this.ensureSavedViewsLoaded();
        const view: SavedCampusLevelView = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            districtId: s.districtId,
            academicYearId: s.academicYearId,
            quarterCode: s.quarterCode,
            campusCategoryId: categoryId,
            filters: structuredClone(this.districtContext.growthFilters),
            savedAt: new Date().toISOString(),
        };
        const signature = this.campusViewSignature(view);
        const existing = this.savedCampusLevelViews.find(
            (v) => this.campusViewSignature(v) === signature,
        );
        this.savedCampusLevelViews = existing
            ? [existing, ...this.savedCampusLevelViews.filter((v) => v.id !== existing.id)]
            : [view, ...this.savedCampusLevelViews].slice(0, 12);
        this.persistSavedViews();
        this.savedViewsOpen = true;
        this.campusAlertsOpen = false;
        this.campusSearchOpen = false;
        this.campusViewSavedFlash = true;
        setTimeout(() => {
            this.campusViewSavedFlash = false;
            this.cdr.markForCheck();
        }, 1800);
        this.cdr.markForCheck();
    }

    applySavedCampusLevelView(view: SavedCampusLevelView): void {
        this.savedViewsOpen = false;
        const s = this.districtContext.selection;
        if (s.districtId !== view.districtId) {
            this.districtContext.setDistrictId(view.districtId);
        }
        this.districtContext.setAcademicYearId(view.academicYearId);
        this.districtContext.setQuarterCode(view.quarterCode);
        this.districtContext.setGrowthFilters(structuredClone(view.filters));
        if (view.campusCategoryId !== this.campusCategoryRouteId) {
            this.router.navigate(['/dashboard/campus-category', view.campusCategoryId]);
        }
        this.cdr.markForCheck();
    }

    deleteSavedCampusLevelView(event: Event, view: SavedCampusLevelView): void {
        event.stopPropagation();
        this.savedCampusLevelViews = this.savedCampusLevelViews.filter((v) => v.id !== view.id);
        this.persistSavedViews();
    }

    savedViewLabel(view: SavedCampusLevelView): string {
        const year =
            this.districtContext.academicYears.find((y) => y.academicYearId === view.academicYearId)
                ?.yearLabel ?? '—';
        const quarter = this.districtContext.districtQuarters.find(
            (q) => q.quarterCode === view.quarterCode,
        );
        const windowLabel = quarter
            ? this.districtContext.quarterDisplayLabel(quarter)
            : view.quarterCode || '—';
        const rawCategory =
            this.districtContext.campusCategories.find(
                (c) => c.campusCategoryId === view.campusCategoryId,
            )?.categoryName ?? '';
        const category = this.campusLevelBaseName(rawCategory) || 'Level';
        return `${category} · ${year} · ${windowLabel}`;
    }

    savedViewFilterCount(view: SavedCampusLevelView): number {
        const f = view.filters;
        return (
            (f.campusId != null ? 1 : 0) +
            (f.grades?.length ?? 0) +
            (f.subjects?.length ?? 0) +
            (f.specialEducation != null ? 1 : 0) +
            (f.economicDisadvantage != null ? 1 : 0) +
            (f.emergentBilingual != null ? 1 : 0) +
            (f.ethnicity != null ? 1 : 0) +
            (f.testLanguage != null ? 1 : 0)
        );
    }

    private campusViewSignature(view: SavedCampusLevelView): string {
        return JSON.stringify([
            view.academicYearId,
            view.quarterCode,
            view.campusCategoryId,
            view.filters,
        ]);
    }

    private ensureSavedViewsLoaded(): void {
        const key = this.savedViewsStorageKey();
        if (this.savedViewsLoadedKey === key) {
            return;
        }
        this.savedViewsLoadedKey = key;
        try {
            const raw = localStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : [];
            this.savedCampusLevelViews = Array.isArray(parsed)
                ? (parsed as SavedCampusLevelView[])
                : [];
        } catch {
            this.savedCampusLevelViews = [];
        }
    }

    private persistSavedViews(): void {
        try {
            localStorage.setItem(
                this.savedViewsStorageKey(),
                JSON.stringify(this.savedCampusLevelViews),
            );
        } catch {
            /* storage unavailable — keep the in-memory list */
        }
    }

    private savedViewsStorageKey(): string {
        const userId = this.auth.getCurrentUser()?.userId ?? 'anonymous';
        const districtId = this.districtContext.selection.districtId ?? 'none';
        return `${GrowthOverviewPageComponent.SAVED_VIEWS_KEY_PREFIX}:${userId}:${districtId}`;
    }

    /** Main district dashboard (`/dashboard`); not campus or campus-category drill-down. */
    get isDistrictHomeDashboard(): boolean {
        return !this.campusId && !this.isCampusCategoryView;
    }

    /** Individual school drill-down (`/dashboard/campus/:id`), not district home or category summary. */
    get isSingleCampusView(): boolean {
        return !!this.campusId && !this.isCampusCategoryView && this.teacherRouteId == null;
    }

    /**
     * True when the browser URL is the plain main dashboard. Unlike the route params
     * (which belong to this component's ActivatedRoute), the live URL also rules out
     * emissions from a previous dashboard instance that is still tearing down after a
     * drill-down navigation.
     */
    private isOnPlainDashboardPath(): boolean {
        return location.pathname.replace(/\/+$/, '') === '/dashboard';
    }

    /** Teacher classroom drill-down (`/dashboard/campus/:id/teacher/:teacherId`). */
    get isTeacherDrillDownView(): boolean {
        return !!this.campusId && !this.isCampusCategoryView && this.teacherRouteId != null;
    }

    private readonly destroy$ = new Subject<void>();
    /** Cancels in-flight dashboard metric requests when filters or route change. */
    private readonly metricsLoadReset$ = new Subject<void>();

    /**
     * Grouped Component+Growth bars: `columnWidth` is the pair width inside each category slot.
     * Keep the pair wide enough that each bar stays readable; slot keeps gaps between campuses.
     */
    private static readonly CAMPUS_BAR_GROUP_PX = 64;
    private static readonly CAMPUS_SLOT_PX = 110;
    private static readonly CAMPUS_CHART_EDGE_PADDING_PX = 72;
    /** Fallback before the chart container is measured. */
    private static readonly CAMPUS_CHART_DEFAULT_CONTAINER_PX = 1100;
    private static readonly CHART_FONT = 'Comfortaa, sans-serif';
    private static readonly CHART_LABEL_COLOR = '#64748b';
    /** Approx. px per character at 10px Comfortaa for x-axis ellipsis sizing. */
    private static readonly CHART_LABEL_CHAR_PX = 6.5;

    @ViewChild('campusesChartContainer')
    campusesChartContainer?: ElementRef<HTMLElement>;

    @ViewChild('teacherStudentOverviewModal')
    teacherStudentOverviewModal?: NgxCustomModalComponent;

    @ViewChild('districtsModal')
    districtsModal?: NgxCustomModalComponent;

    @ViewChild('campusesModal')
    campusesModal?: NgxCustomModalComponent;

    /** Same popup component as the Districts/Campuses cards, for the status cards. */
    @ViewChild('statusCampusesModal')
    statusCampusesModal?: NgxCustomModalComponent;

    @ViewChild('teachersModal')
    teachersModal?: NgxCustomModalComponent;

    @ViewChild('comparisonModal')
    comparisonModal?: NgxCustomModalComponent;

    /** District Admin list + students popups (same ngx-custom-modal mechanism). */
    @ViewChild('districtAdminListModal')
    districtAdminListModal?: NgxCustomModalComponent;

    @ViewChild('districtAdminStudentsModal')
    districtAdminStudentsModal?: NgxCustomModalComponent;

    private chartResizeObserver?: ResizeObserver;
    private chartContainerWidthPx = 0;
    private lastChartLayoutKey = '';
    /** Empty category pads added so bars stay centered on a full-width chart. */
    private chartBarLeftPad = 0;
    private lastCampusChartPayload: {
        categories: string[];
        componentScores: number[];
        growthVals: number[];
        campusNames: string[];
        campusCodes: string[];
        teacherIds?: number[];
        isTeacherChart?: boolean;
        isStudentChart?: boolean;
    } | null = null;

    /** True when overview bars represent campuses (click navigates to `/dashboard/campus/:slug`). */
    get isCampusOverviewChartClickable(): boolean {
        return !!this.lastCampusChartPayload && !this.lastCampusChartPayload.isTeacherChart && !this.lastCampusChartPayload.isStudentChart;
    }

    /** True when bars represent teachers on a campus (click opens student stats for that teacher). */
    get isTeacherOverviewChartClickable(): boolean {
        return !!this.lastCampusChartPayload?.isTeacherChart;
    }

    componentScoreWidth = 0;
    growthWidth = 0;
    appWidth = 0;
    meetWidth = 0;
    masterWidth = 0;

    /* ================= Concept dashboard (SuperAdmin district home) ================= */

    /** Donut configs for the score strip cards (built once per metrics refresh). */
    conceptCsDonut: any = null;
    conceptGrowthDonut: any = null;
    conceptBandsDonut: any = null;
    /** Level label → index of its segment inside the apex series (missing levels are absent). */
    private conceptCsSliceIndex = new Map<string, number>();
    private conceptGrowthSliceIndex = new Map<string, number>();
    private conceptBandsSliceIndex = new Map<string, number>();
    /** Hovered legend row key, e.g. 'cs:ES' — used to highlight the row. */
    hoveredRow: string | null = null;
    /** Hovered slice index per score-strip chart (0–2); drives the CSS slice-highlight on the wrapper. */
    hoveredSliceIndex: Record<'cs' | 'growth' | 'bands', number | undefined> = {
        cs: undefined,
        growth: undefined,
        bands: undefined,
    };

    /** Right "Academic Year" card: mini calendar for the current month (real dates). */
    conceptCalendarWeeks: Array<Array<{ day: number | null; isToday: boolean }>> = [];

    /** Campus Ranked table source: growth ranking or academy CCMR ranking (both real). */
    conceptRankedSource: 'growth' | 'ccmr' = 'growth';

    setConceptRankedSource(source: 'growth' | 'ccmr'): void {
        this.conceptRankedSource = source;
        this.cdr.markForCheck();
    }

    /** Rows for the Campus Ranked table (rank computed by position — both lists are pre-sorted). */
    get conceptRankedRows(): Array<{
        key: string;
        title: string;
        metric: string;
        score: string | null;
    }> {
        if (this.conceptRankedSource === 'ccmr') {
            return this.ccmrAcademyRanking.map((r) => ({
                key: r.school,
                title: r.school,
                metric: r.ccmrPct != null ? `${r.ccmrPct.toFixed(1)}%` : '—',
                score: null,
            }));
        }
        return this.districtCampusGrowthRanking.map((r) => ({
            key: r.campusName,
            title: r.campusName,
            metric: r.growth != null ? `${r.growth.toFixed(1)}%` : '—',
            score: r.score != null ? r.score.toFixed(1) : null,
        }));
    }

    /** District Admin KPI row — same dashboard, scoped to the admin's own district only. */
    showDistrictAdminStats = false;
    districtAdminClassroomsLoading = false;
    districtAdminCampusCount = 0;
    districtAdminTotalClassrooms = 0;
    districtAdminDevelopingClassroomsCount = 0;
    districtAdminProgressingClassroomsCount = 0;
    districtAdminDevelopingCsAvg: number | null = null;
    districtAdminDevelopingCsGrade: string | null = null;
    districtAdminDevelopingGrowthAvg: number | null = null;
    districtAdminDevelopingGrowthGrade: string | null = null;
    districtAdminProgressingCsAvg: number | null = null;
    districtAdminProgressingCsGrade: string | null = null;
    districtAdminProgressingGrowthAvg: number | null = null;
    districtAdminProgressingGrowthGrade: string | null = null;
    districtAdminStudentsCount = 0;
    districtAdminStudentsLoading = false;

    private districtAdminCampusRows: DistrictAdminListRow[] = [];
    private districtAdminAllClassrooms: DistrictAdminClassroomRow[] = [];
    private districtAdminDevelopingClassrooms: DistrictAdminClassroomRow[] = [];
    private districtAdminProgressingClassrooms: DistrictAdminClassroomRow[] = [];
    private districtAdminAllStudents: DistrictAdminStudentRow[] = [];

    /** Generic district-admin list popup (campuses or classrooms). */
    districtAdminListKind: 'campus' | 'classroom' = 'campus';
    districtAdminListTitle = '';
    /** District-wide total behind the card — never changed by the popup filter. */
    districtAdminListCount = 0;
    /** Rows actually shown in the popup (follows the campus dropdown). */
    districtAdminListDisplayCount = 0;
    districtAdminListCampusFilter: string | null = null;
    districtAdminListRows: DistrictAdminListRow[] = [];

    /** Students popup — campus dropdown starts on "All Campuses". */
    districtAdminStudentCampusFilter: string | null = null;
    districtAdminStudentModalCount = 0;

    /** SuperAdmin org stat cards (districts / campuses / teachers). */
    showOrgStats = false;
    orgDistrictCount = 0;
    orgCampusCount = 0;
    orgTeacherCount = 0;

    /** Students card — live mobility totals (student_mobility; never hardcoded). */
    studentsSummaryLoading = false;
    /**
     * Live mobility summary (student_mobility row for district + year + current grading window) —
     * same source and calculation as the campus/students mobility views (postQuarterComparison).
     */
    studentsTotalCount: number | null = null;
    studentsIncomingCount: number | null = null;
    studentsOutgoingCount: number | null = null;

    /** Developing campuses — campuses in the current selection with a latest average CS ≤ 63 (portal band precedent). */
    developingCampusesLoading = false;
    developingCampusesCount = 0;
    developingCampusesTotal = 0;
    developingComponentScoreAvg: number | null = null;
    developingComponentScoreGrade: string | null = null;
    developingGrowthAvg: number | null = null;
    developingGrowthGrade: string | null = null;

    /** Progressing campuses — same selection rows, CS in the 64–74 "Progressing" band. */
    progressingCampusesLoading = false;
    progressingCampusesCount = 0;
    progressingCampusesTotal = 0;
    progressingComponentScoreAvg: number | null = null;
    progressingComponentScoreGrade: string | null = null;
    progressingGrowthAvg: number | null = null;
    progressingGrowthGrade: string | null = null;
    /** Real 14-day cumulative series for the card sparklines (empty = nothing to chart). */
    orgDistrictSpark: number[] = [];
    orgCampusSpark: number[] = [];
    orgTeacherSpark: number[] = [];
    /** Honest "added this month" counts for the card captions. */
    orgDistrictNew = 0;
    orgCampusNew = 0;
    orgTeacherNew = 0;

    isSuperAdminRole(): boolean {
        return this.auth.isSuperAdminRole();
    }

    /** District Admin is pinned to one district by the existing role scope. */
    isDistrictAdminRole(): boolean {
        const role = this.auth.getCurrentUser()?.activeRole;
        if (!role) {
            return false;
        }
        return (roleIdFromName(role.roleName) ?? role.roleId) === ROLE_IDS.DistrictAdmin;
    }

    get districtAdminDevelopingCaption(): string {
        if (this.districtAdminClassroomsLoading) return 'Loading…';
        if (!this.districtAdminDevelopingClassroomsCount) return 'NO DEVELOPING CLASSROOMS';
        return `${this.districtAdminDevelopingClassroomsCount} of ${this.districtAdminTotalClassrooms} classrooms`;
    }

    get districtAdminProgressingCaption(): string {
        if (this.districtAdminClassroomsLoading) return 'Loading…';
        if (!this.districtAdminProgressingClassroomsCount) return 'NO PROGRESSING CLASSROOMS';
        return `${this.districtAdminProgressingClassroomsCount} of ${this.districtAdminTotalClassrooms} classrooms`;
    }

    loadOrgStats(): void {
        this.apiService.get('districts?activeOnly=true').subscribe({
            next: (data: any) => {
                const list = Array.isArray(data) ? data : (data.data || []);
                this.animateCount((v) => { this.orgDistrictCount = v; }, list.length);
                this.orgDistrictSpark = this.buildSparkSeries(list, list.length);
                this.orgDistrictNew = this.countAddedThisMonth(list);
            },
            error: () => { this.orgDistrictCount = 0; },
        });
        this.apiService.get('campuses?activeOnly=true').subscribe({
            next: (data: any) => {
                const list = Array.isArray(data) ? data : (data.data || []);
                this.animateCount((v) => { this.orgCampusCount = v; }, list.length);
                this.orgCampusSpark = this.buildSparkSeries(list, list.length);
                this.orgCampusNew = this.countAddedThisMonth(list);
            },
            error: () => { this.orgCampusCount = 0; },
        });
        this.apiService.get('users?roleId=4&activeOnly=true').subscribe({
            next: (data: any) => {
                const list = Array.isArray(data) ? data : (data.data || []);
                this.animateCount((v) => { this.orgTeacherCount = v; }, list.length);
                this.orgTeacherSpark = this.buildSparkSeries(list, list.length);
                this.orgTeacherNew = this.countAddedThisMonth(list);
            },
            error: () => { this.orgTeacherCount = 0; },
        });
    }

    /**
     * Cumulative record count over the last 14 days (daily buckets), built from
     * the records' real createdAt timestamps. Everything created before the
     * window forms the flat baseline — never fabricated.
     */
    private buildSparkSeries(items: Array<{ createdAt?: string | null }>, total: number): number[] {
        if (!Array.isArray(items) || items.length < 2) {
            return [];
        }
        const days = 14;
        const dayMs = 24 * 60 * 60 * 1000;
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - (days - 1) * dayMs;
        const perDay = new Array<number>(days).fill(0);
        let inWindow = 0;
        for (const item of items) {
            const t = item?.createdAt ? new Date(item.createdAt).getTime() : NaN;
            if (!Number.isFinite(t)) {
                continue;
            }
            const dayIndex = Math.floor((Math.floor(t / dayMs) * dayMs - start) / dayMs);
            if (dayIndex >= 0 && dayIndex < days) {
                perDay[dayIndex]++;
                inWindow++;
            }
        }
        let running = Math.max(0, total - inWindow);
        return perDay.map((c) => (running += c));
    }

    /** Records whose createdAt falls in the current calendar month. */
    private countAddedThisMonth(items: Array<{ createdAt?: string | null }>): number {
        if (!Array.isArray(items)) {
            return 0;
        }
        const now = new Date();
        return items.filter((item) => {
            const d = item?.createdAt ? new Date(item.createdAt) : null;
            return !!d && !isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        }).length;
    }

    /** SVG polyline points (120x40 viewBox) for a sparkline series; '' when not plottable. */
    sparkPoints(series: number[], width = 120, height = 40): string {
        if (!series || series.length < 2) {
            return '';
        }
        const min = Math.min(...series);
        const max = Math.max(...series);
        const range = max - min;
        const step = width / (series.length - 1);
        return series
            .map((v, i) => {
                const x = i * step;
                const y = range === 0 ? height - 3 : height - 3 - ((v - min) / range) * (height - 6);
                return `${x.toFixed(1)},${y.toFixed(1)}`;
            })
            .join(' ');
    }

    /** '' → null for the filter-bar selects (Angular templates cannot call global Number()). */
    toNumberOrNull(value: string): number | null {
        return value === '' ? null : Number(value);
    }

    /** Eased 0 → target count-up for the stat card numbers. */
    private animateCount(apply: (v: number) => void, target: number, duration = 700): void {
        apply(0);
        if (target <= 0) {
            return;
        }
        const start = performance.now();
        let done = false;
        const step = (now: number) => {
            if (done) {
                return;
            }
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            apply(Math.round(eased * target));
            this.cdr.markForCheck();
            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                done = true;
            }
        };
        requestAnimationFrame(step);
        // requestAnimationFrame is suspended for backgrounded/occluded tabs —
        // guarantee the final value lands even then.
        window.setTimeout(() => {
            if (!done) {
                done = true;
                apply(target);
                this.cdr.markForCheck();
            }
        }, duration + 100);
    }

    /** Staggered animation delay for popup table rows. */
    orgRowDelay(index: number): string {
        return `${Math.min(index * 40, 400)}ms`;
    }

    /** Rows for the Districts stat-card popup (id, name, code, campus count, status). */
    orgDistrictRows: {
        districtId: number | null;
        name: string;
        code: string;
        campusCount: number;
        isActive: boolean;
    }[] = [];
    /** Rows for the Campuses stat-card popup (district, campus, component score). */
    orgCampusRows: {
        district: string;
        name: string;
        code: string;
        slug: string;
        campusId: number | null;
        score: number | null;
    }[] = [];
    orgModalLoading = false;

    /**
     * The EXACT row arrays the Developing / Progressing cards count. Stored at
     * the same moment the counts are computed, so a popup built from these can
     * never disagree with the number on the card. Replaced on every selector
     * change (and cleared while loading), so it is never a stale district list.
     */
    private developingCampusSourceRows: CampusGrowthMetricsResponse[] = [];
    private progressingCampusSourceRows: CampusGrowthMetricsResponse[] = [];

    /** Row view model for the status-campuses popup (same shape as orgCampusRows + grades). */
    statusCampusRows: {
        campusId: number;
        name: string;
        code: string;
        slug: string;
        cs: number | null;
        csGrade: string | null;
        growth: number | null;
        growthGrade: string | null;
    }[] = [];
    statusCampusModalTitle = '';
    statusCampusModalSubtitle = '';

    openDistrictsModal(): void {
        this.orgModalLoading = true;
        this.districtsModal?.open();
        forkJoin({
            districts: this.apiService.get('districts').pipe(catchError(() => of([] as any[]))),
            campuses: this.apiService.get('campuses?activeOnly=true').pipe(catchError(() => of([] as any[]))),
        }).subscribe(({ districts, campuses }) => {
            const districtList = Array.isArray(districts) ? districts : (districts as any).data || [];
            const campusList = Array.isArray(campuses) ? campuses : (campuses as any).data || [];
            this.orgDistrictRows = districtList.map((d: any) => ({
                districtId: d.districtId ?? null,
                name: d.districtName || '—',
                code: d.districtCode || '—',
                campusCount: campusList.filter(
                    (c: any) => d.districtId != null && c.districtId === d.districtId,
                ).length,
                isActive: d.isActive !== false,
            }));
            this.orgModalLoading = false;
        });
    }

    openCampusesModal(): void {
        this.orgModalLoading = true;
        this.campusesModal?.open();
        forkJoin({
            campuses: this.apiService.get('campuses?activeOnly=true').pipe(catchError(() => of([] as any[]))),
            districts: this.apiService.get('districts').pipe(catchError(() => of([] as any[]))),
        }).subscribe(({ campuses, districts }) => {
            const campusList = Array.isArray(campuses) ? campuses : (campuses as any).data || [];
            const districtList = Array.isArray(districts) ? districts : (districts as any).data || [];
            const districtNameById = new Map<number, string>();
            districtList.forEach((d: any) => {
                if (d.districtId != null) {
                    districtNameById.set(d.districtId, d.districtName || '—');
                }
            });
            // Component scores come from the same dataset that drives the
            // Campuses Overview chart (POST /growth/campus-metrics).
            const payload = this.lastCampusChartPayload;
            const scoreMap = new Map<string, number>();
            if (payload) {
                payload.campusNames.forEach((name, i) => {
                    scoreMap.set((name || '').trim(), payload.componentScores[i] ?? 0);
                });
            }
            this.orgCampusRows = campusList.map((c: any) => ({
                district: districtNameById.get(c.districtId) || '—',
                name: c.campusName || '—',
                code: c.campusCode || '—',
                slug: this.campusSlugFromName(c.campusName),
                campusId: c.campusId ?? null,
                score: scoreMap.get((c.campusName || '').trim()) ?? null,
            }));
            this.orgModalLoading = false;
        });
    }

    /**
     * Developing / Progressing cards reuse the same popup component and row
     * action as the Campuses card. No new query: the rows are the exact arrays
     * that produced the two card counts.
     */
    openDevelopingCampusesModal(): void {
        this.openStatusCampusesModal('Developing Campuses', this.developingCampusSourceRows);
    }

    openProgressingCampusesModal(): void {
        this.openStatusCampusesModal('Progressing Campuses', this.progressingCampusSourceRows);
    }

    private openStatusCampusesModal(
        title: string,
        source: CampusGrowthMetricsResponse[],
    ): void {
        this.statusCampusModalTitle = title;
        this.statusCampusModalSubtitle = `${source.length} in the current selection`;
        this.statusCampusRows = source.map((r) => ({
            campusId: r.campusId,
            name: r.campusName || '—',
            code: r.campusCode || '—',
            slug: this.campusSlugFromName(r.campusName),
            cs: r.componentScore ?? null,
            csGrade: this.gradeLetterForScore(r.componentScore),
            growth: r.growth ?? null,
            growthGrade: this.gradeLetterForScore(r.growth),
        }));
        this.statusCampusesModal?.open();
    }

    /** True when the popup row's campus is the currently applied campus filter. */
    isCampusFilterRow(campusId: number | null): boolean {
        return this.districtContext.growthFilters.campusId === campusId;
    }

    /**
     * Campuses popup row action — "select the campus and get the data/stats":
     * on the district overview the campus filter is applied in place (stats reload,
     * no navigation); on a campus/category drill-down it navigates to that campus.
     */
    applyCampusFilterFromPopup(campusId: number | null, slug: string | null): void {
        this.campusesModal?.close();
        this.applyCampusFilterFromRow(campusId, slug);
    }

    /** Same row action for the Developing/Progressing popup, closing its own modal. */
    applyStatusCampusFilterFromPopup(campusId: number | null, slug: string | null): void {
        this.statusCampusesModal?.close();
        this.applyCampusFilterFromRow(campusId, slug);
    }

    /** Shared row action — identical behaviour for every campus popup in this page. */
    private applyCampusFilterFromRow(campusId: number | null, slug: string | null): void {
        const onDistrictHome =
            this.router.url.split('?')[0].split('#')[0] === '/dashboard';
        if (campusId == null) {
            // "All Campuses (District)" — clear the campus filter.
            this.districtContext.setGrowthFilters({
                ...this.districtContext.growthFilters,
                campusId: null,
            });
            return;
        }
        if (onDistrictHome) {
            this.districtContext.setGrowthFilters({
                ...this.districtContext.growthFilters,
                campusId,
            });
        } else if (slug) {
            void this.router.navigate(['/dashboard/campus', slug]);
        }
    }

    /** Popup "More filters" button — hand off to the filter side panel. */
    openFiltersPanelFromPopup(): void {
        this.campusesModal?.close();
        this.districtContext.requestFilterPanel();
    }

    /** Rows for the Teachers stat-card popup (name, campus, status) + drill-down route. */
    orgTeacherRows: {
        name: string;
        email: string;
        campus: string;
        campusSlug: string | null;
        teacherId: number | null;
        isActive: boolean;
    }[] = [];

    /** Same slug rules as DistrictContextService.campusRouteSlug. */
    campusSlugFromName(name: string): string {
        return (name || '')
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    // ── District Admin dashboard (own district only) ─────────────────────────────

    /**
     * Loads the two extra District Admin measures (classrooms + student list) from
     * the same endpoints/calculations the rest of the dashboard already uses.
     * Campus cards reuse the existing Developing/Progressing campus stats and the
     * existing mobility totals, so no score is recalculated here.
     */
    private loadDistrictAdminData(until$: Observable<unknown>): void {
        const base = this.districtContext.baseGrowthPayload();
        if (!base) {
            this.resetDistrictAdminData();
            return;
        }
        const filters = this.districtContext.growthFiltersPayload();
        const campuses = this.districtContext.filterCampusesForActiveRole(
            this.districtContext.campuses,
        );

        this.districtAdminClassroomsLoading = true;
        this.districtAdminStudentsLoading = true;

        const campusesRequest = this.growthAnalytics
            .getCampusGrowthMetrics({ ...base, ...filters })
            .pipe(catchError(() => of<CampusGrowthMetricsResponse[]>([])));
        const classroomRequests = campuses.length
            ? forkJoin(
                  campuses.map((campus) =>
                      this.growthAnalytics
                          .getCampusTeacherGrowthMetrics({
                              ...base,
                              ...filters,
                              campusCode: campus.campusCode,
                          })
                          .pipe(catchError(() => of<TeacherGrowthMetricsResponse[]>([]))),
                  ),
              )
            : of([] as TeacherGrowthMetricsResponse[][]);

        forkJoin({ campuses: campusesRequest, classrooms: classroomRequests })
            .pipe(
                takeUntil(until$),
                finalize(() => {
                    this.districtAdminClassroomsLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe(({ campuses: campusRows, classrooms }) => {
                this.districtAdminCampusRows = campusRows.map((row) => ({
                    id: String(row.campusId),
                    name: row.campusName || '—',
                    code: row.campusCode || '—',
                    cs: row.componentScore ?? null,
                    csGrade: this.gradeLetterForScore(row.componentScore),
                    growth: row.growth ?? null,
                    growthGrade: this.gradeLetterForScore(row.growth),
                }));
                this.districtAdminCampusCount = this.districtAdminCampusRows.length;

                const all: DistrictAdminClassroomRow[] = [];
                campuses.forEach((campus, index) => {
                    for (const teacher of classrooms[index] ?? []) {
                        const cs = Number.isFinite(teacher.componentScore)
                            ? teacher.componentScore
                            : null;
                        const growth = Number.isFinite(teacher.growth) ? teacher.growth : null;
                        // The backend writes 0 for a missing aggregate; never guess a status.
                        if (cs == null || growth == null || (cs === 0 && growth === 0)) {
                            continue;
                        }
                        all.push({
                            id: `${campus.campusCode}|${teacher.teacherIdExternal ?? ''}|${teacher.firstName ?? ''}|${teacher.lastName ?? ''}`,
                            name:
                                [teacher.firstName, teacher.lastName]
                                    .filter((part) => !!part?.trim())
                                    .join(' ')
                                    .trim() ||
                                teacher.teacherIdExternal ||
                                '—',
                            campus: campus.campusName || campus.campusCode,
                            campusCode: campus.campusCode,
                            grade: teacher.grade?.trim() || '—',
                            cs,
                            csGrade: this.gradeLetterForScore(cs),
                            growth,
                            growthGrade: this.gradeLetterForScore(growth),
                        });
                    }
                });
                // Exact same status rule as the campus cards (backend bandOf).
                const developing = all.filter((row) => row.cs! <= 63);
                const progressing = all.filter((row) => row.cs! > 63 && row.cs! <= 74);
                this.districtAdminAllClassrooms = all;
                this.districtAdminDevelopingClassrooms = developing;
                this.districtAdminProgressingClassrooms = progressing;
                this.districtAdminTotalClassrooms = all.length;
                this.districtAdminDevelopingClassroomsCount = developing.length;
                this.districtAdminProgressingClassroomsCount = progressing.length;
                this.districtAdminDevelopingCsAvg = this.meanMetric(developing, 'cs');
                this.districtAdminDevelopingGrowthAvg = this.meanMetric(developing, 'growth');
                this.districtAdminProgressingCsAvg = this.meanMetric(progressing, 'cs');
                this.districtAdminProgressingGrowthAvg = this.meanMetric(progressing, 'growth');
                this.districtAdminDevelopingCsGrade = this.gradeLetterForScore(
                    this.districtAdminDevelopingCsAvg,
                );
                this.districtAdminDevelopingGrowthGrade = this.gradeLetterForScore(
                    this.districtAdminDevelopingGrowthAvg,
                );
                this.districtAdminProgressingCsGrade = this.gradeLetterForScore(
                    this.districtAdminProgressingCsAvg,
                );
                this.districtAdminProgressingGrowthGrade = this.gradeLetterForScore(
                    this.districtAdminProgressingGrowthAvg,
                );
            });

        this.fetchDistrictAdminStudents()
            .pipe(
                takeUntil(until$),
                finalize(() => {
                    this.districtAdminStudentsLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe((students) => {
                this.districtAdminAllStudents = students;
                this.districtAdminStudentsCount = students.length;
                this.districtAdminStudentCampusFilter = null;
                this.districtAdminStudentModalCount = students.length;
            });
    }

    private resetDistrictAdminData(): void {
        this.districtAdminClassroomsLoading = false;
        this.districtAdminStudentsLoading = false;
        this.districtAdminCampusCount = 0;
        this.districtAdminTotalClassrooms = 0;
        this.districtAdminDevelopingClassroomsCount = 0;
        this.districtAdminProgressingClassroomsCount = 0;
        this.districtAdminStudentsCount = 0;
        this.districtAdminCampusRows = [];
        this.districtAdminAllClassrooms = [];
        this.districtAdminDevelopingClassrooms = [];
        this.districtAdminProgressingClassrooms = [];
        this.districtAdminAllStudents = [];
    }

    private meanMetric(
        rows: DistrictAdminClassroomRow[],
        key: 'cs' | 'growth',
    ): number | null {
        const values = rows
            .map((row) => row[key])
            .filter((value): value is number => value != null && Number.isFinite(value));
        return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    }

    /** Every page of the existing student-growth-records list for the current scope. */
    private fetchDistrictAdminStudents(): Observable<DistrictAdminStudentRow[]> {
        const base = this.districtContext.baseGrowthPayload();
        if (!base) {
            return of([]);
        }
        const pageSize = 500;
        const campusByCode = new Map(
            this.districtContext
                .filterCampusesForActiveRole(this.districtContext.campuses)
                .map((campus) => [campus.campusCode, campus.campusName]),
        );
        const fetchPage = (offset: number): Observable<StudentGrowthRecordResponse[]> =>
            this.studentGrowthRecords
                .listRecords({
                    districtId: base.districtId,
                    academicYearId: base.academicYearId,
                    quarterCode: base.quarterCode,
                    offset,
                    limit: pageSize,
                })
                .pipe(
                    switchMap((page) => {
                        const rows = page.records ?? [];
                        if (rows.length < pageSize || rows.length >= (page.totalCount ?? 0)) {
                            return of(rows);
                        }
                        return fetchPage(offset + pageSize).pipe(map((more) => [...rows, ...more]));
                    }),
                    catchError(() => of<StudentGrowthRecordResponse[]>([])),
                );
        return fetchPage(0).pipe(
            map((records) => {
                const byKey = new Map<string, DistrictAdminStudentRow>();
                for (const record of records) {
                    const campusCode = record.campusCode || '';
                    const key = `${record.localId || ''}|${record.studentName || ''}|${campusCode}`;
                    if (!byKey.has(key)) {
                        byKey.set(key, {
                            key,
                            name: record.studentName?.trim() || '—',
                            campusCode,
                            campus: campusByCode.get(campusCode) || campusCode || '—',
                            grade: record.gradeCode || '—',
                            classroom: record.teacherName || '—',
                        });
                    }
                }
                return [...byKey.values()];
            }),
        );
    }

    /** Rebuilds the campus row list on every click so it always matches the card. */
    openDistrictAdminCampusesModal(): void {
        this.districtAdminListKind = 'campus';
        this.districtAdminListTitle = 'Total Campuses';
        this.districtAdminListCampusFilter = null;
        this.districtAdminListCount = this.districtAdminCampusRows.length;
        this.districtAdminListDisplayCount = this.districtAdminCampusRows.length;
        this.districtAdminListRows = [...this.districtAdminCampusRows];
        this.districtAdminListModal?.open();
    }

    openDistrictAdminClassroomsModal(kind: 'all' | 'developing' | 'progressing'): void {
        const source =
            kind === 'developing'
                ? this.districtAdminDevelopingClassrooms
                : kind === 'progressing'
                  ? this.districtAdminProgressingClassrooms
                  : this.districtAdminAllClassrooms;
        this.districtAdminListKind = 'classroom';
        this.districtAdminListTitle =
            kind === 'developing'
                ? 'Developing Classrooms'
                : kind === 'progressing'
                  ? 'Progressing Classrooms'
                  : 'Total Classrooms';
        this.districtAdminListCampusFilter = null;
        this.districtAdminListCount = source.length;
        this.districtAdminListDisplayCount = source.length;
        this.districtAdminListRows = source.map((row) => ({
            id: row.id,
            name: row.name,
            campus: row.campus,
            campusCode: row.campusCode,
            cs: row.cs,
            csGrade: row.csGrade,
            growth: row.growth,
            growthGrade: row.growthGrade,
        }));
        this.districtAdminListModal?.open();
    }

    /** Popup-only campus filter for classroom lists — does not touch card counts. */
    onDistrictAdminListCampusChange(campusCode: string | null): void {
        this.districtAdminListCampusFilter = campusCode || null;
        this.districtAdminListDisplayCount = this.districtAdminFilteredListRows.length;
    }

    get districtAdminFilteredListRows(): DistrictAdminListRow[] {
        return this.districtAdminListCampusFilter
            ? this.districtAdminListRows.filter(
                  (row) => row.campusCode === this.districtAdminListCampusFilter,
              )
            : this.districtAdminListRows;
    }

    /** Re-fetches the student list on each click; starts on All Campuses. */
    openDistrictAdminStudentsModal(): void {
        this.districtAdminStudentCampusFilter = null;
        this.districtAdminStudentModalCount = this.districtAdminStudentsCount;
        this.districtAdminStudentsLoading = true;
        this.districtAdminStudentsModal?.open();
        this.fetchDistrictAdminStudents()
            .pipe(takeUntil(this.destroy$))
            .subscribe((students) => {
                this.districtAdminAllStudents = students;
                this.districtAdminStudentsCount = students.length;
                this.districtAdminStudentModalCount = students.length;
                this.districtAdminStudentsLoading = false;
                this.cdr.markForCheck();
            });
    }

    onDistrictAdminStudentCampusChange(campusCode: string | null): void {
        this.districtAdminStudentCampusFilter = campusCode || null;
        this.districtAdminStudentModalCount = this.districtAdminFilteredStudentRows.length;
    }

    get districtAdminFilteredStudentRows(): DistrictAdminStudentRow[] {
        return this.districtAdminStudentCampusFilter
            ? this.districtAdminAllStudents.filter(
                  (row) => row.campusCode === this.districtAdminStudentCampusFilter,
              )
            : this.districtAdminAllStudents;
    }

    openTeachersModal(): void {
        this.orgModalLoading = true;
        this.teachersModal?.open();
        this.apiService.get('users?roleId=4&activeOnly=true').subscribe({
            next: (data: any) => {
                const list = Array.isArray(data) ? data : (data.data || []);
                const campusById = new Map<number, { campusName: string }>();
                this.districtContext.campuses.forEach((c) => {
                    if (c.campusId != null) {
                        campusById.set(c.campusId, c);
                    }
                });
                this.orgTeacherRows = list.map((u: any) => {
                    const assignment = (u.roleAssignments || [])[0] || {};
                    const campus = assignment.campusId != null ? campusById.get(assignment.campusId) : null;
                    const campusName = campus?.campusName || null;
                    return {
                        name: u.displayName || u.email || '—',
                        email: u.email || '',
                        campus: campusName || '—',
                        campusSlug: campusName ? this.campusSlugFromName(campusName) : null,
                        teacherId: assignment.teacherId ?? null,
                        isActive: u.isActive !== false,
                    };
                });
                this.orgModalLoading = false;
            },
            error: () => {
                this.orgTeacherRows = [];
                this.orgModalLoading = false;
            },
        });
    }

    // ==================================================================
    // Aurora v2 — DISTRICT OVERVIEW (District Admin, own district only)
    // Presentation + joins over data this page already loads: overall
    // metrics, campus metrics, attendance, CCMR and student counts.
    // ==================================================================

    private static readonly DISTRICT_OVERVIEW_VIEWS_KEY_PREFIX = 'simplify_district_overview_views';
    private static readonly DISTRICT_OVERVIEW_DISMISSED_KEY_PREFIX =
        'simplify_district_overview_dismissed';

    /** Same goal the Attendance page shows ("District Goal 95%"). */
    readonly districtOverviewAttendanceGoal = 95;

    districtOverviewSearchQuery = '';
    districtOverviewSearchOpen = false;
    districtOverviewSavedViewsOpen = false;
    districtOverviewYearMenuOpen = false;
    districtOverviewCampusMenuOpen = false;
    districtOverviewHighlightedQuadrant: string | null = null;
    districtOverviewSavedFlash = false;
    districtOverviewRefreshing = false;
    districtOverviewLevelFilter: string | null = null;
    districtOverviewBoardLevelFilter: string | null = null;
    districtOverviewLeaderSort: 'staar' | 'growth' = 'staar';

    /** Monthly attendance + CCMR rates for the District Admin extras. */
    districtOverviewMonthlyStats: MonthlyAttendanceStatDto[] = [];
    districtOverviewCcmrMonthlyRates: CcmrDistrictMonthRateDto[] = [];
    districtOverviewExtrasLoading = false;
    districtOverviewFundingAtRiskYtd: number | null = null;

    savedDistrictOverviewViews: DistrictOverviewSavedView[] = [];
    private districtOverviewSavedViewsLoadedKey = '';
    private districtOverviewDismissedLoadedKey = '';
    private districtOverviewDismissedByScope: Record<string, string[]> = {};

    /** Full campus-metrics rows behind the ranking (id/code kept for joins). */
    private districtOverviewCampusMetricRows: Array<{
        campusId: number | null;
        campusCode: string;
        campusName: string;
        cs: number | null;
        growth: number | null;
    }> = [];

    /** Unfiltered campus metrics kept for the map so other dots stay visible but dimmed. */
    private districtOverviewAllCampusMetricRows: Array<{
        campusId: number | null;
        campusCode: string;
        campusName: string;
        cs: number | null;
        growth: number | null;
    }> = [];

    /** True only on the plain district dashboard for a District Admin session. */
    get isDistrictAdminOverview(): boolean {
        return this.isDistrictAdminRole() && this.isDistrictHomeDashboard && this.isOnPlainDashboardPath();
    }

    get districtOverviewDistrictName(): string {
        const id = this.districtContext.selection.districtId;
        return (
            this.districtContext.districts.find((d) => d.districtId === id)?.districtName ??
            'District'
        );
    }

    get districtOverviewYearLabel(): string {
        return this.campusLevelYearLabel;
    }

    get districtOverviewWindowLabel(): string {
        return this.campusLevelWindowLabel;
    }

    get districtOverviewWindowYearPill(): string {
        return `${this.districtOverviewWindowLabel} · ${this.districtOverviewYearLabel}`;
    }

    /** Q1–Q4 buttons over the district's active assessment periods. */
    get districtOverviewQuarterOptions(): Array<{
        code: string;
        label: string;
        windowLabel: string;
    }> {
        return [...this.districtContext.districtQuarters]
            .sort(
                (a, b) =>
                    (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
                    (a.startDate || '').localeCompare(b.startDate || ''),
            )
            .map((quarter, index) => ({
                code: quarter.quarterCode,
                label: `Q${index + 1}`,
                windowLabel: this.districtContext.quarterDisplayLabel(quarter),
            }));
    }

    get districtOverviewSelectedQuarterCode(): string | null {
        return this.districtContext.selection.quarterCode;
    }

    /** Short period label used inside the hero pill. */
    get districtOverviewQuarterShortLabel(): string {
        const code = this.districtOverviewSelectedQuarterCode;
        return (
            this.districtOverviewQuarterOptions.find((option) => option.code === code)?.label ??
            this.districtOverviewWindowLabel
        );
    }

    selectDistrictOverviewQuarter(code: string): void {
        this.districtOverviewYearMenuOpen = false;
        if (code !== this.districtOverviewSelectedQuarterCode) {
            this.districtContext.setQuarterCode(code);
        }
    }

    get districtOverviewUserName(): string {
        const user = this.auth.getCurrentUser();
        if (!user) {
            return 'User';
        }
        const name = user.displayName?.trim();
        if (name) {
            return name;
        }
        const local = user.email?.split('@')[0]?.trim();
        return local || 'User';
    }

    get districtOverviewUserInitial(): string {
        return (this.districtOverviewUserName.trim().charAt(0) || 'U').toUpperCase();
    }

    get districtOverviewThemeIsDark(): boolean {
        return this.store?.theme === 'dark';
    }

    toggleDistrictOverviewTheme(): void {
        this.storeData.dispatch({
            type: 'toggleTheme',
            payload: this.districtOverviewThemeIsDark ? 'light' : 'dark',
        });
    }

    get districtOverviewPopoversOpen(): boolean {
        return (
            this.districtOverviewSearchOpen ||
            this.districtOverviewSavedViewsOpen ||
            this.districtOverviewYearMenuOpen ||
            this.districtOverviewCampusMenuOpen
        );
    }

    closeDistrictOverviewPopovers(): void {
        this.districtOverviewSearchOpen = false;
        this.districtOverviewSavedViewsOpen = false;
        this.districtOverviewYearMenuOpen = false;
        this.districtOverviewCampusMenuOpen = false;
    }

    toggleDistrictOverviewCampusMenu(): void {
        this.districtOverviewCampusMenuOpen = !this.districtOverviewCampusMenuOpen;
        this.districtOverviewSearchOpen = false;
        this.districtOverviewSavedViewsOpen = false;
        this.districtOverviewYearMenuOpen = false;
    }

    /** Whole-page campus scope, persisted through the portal's existing growth filter. */
    get districtOverviewSelectedCampus(): Campus | undefined {
        return this.districtContext.filterCampus();
    }

    get districtOverviewCampusLabel(): string {
        return this.districtOverviewSelectedCampus?.campusName || 'All campuses';
    }

    get districtOverviewSelectedCampusSlug(): string | null {
        const campus = this.districtOverviewSelectedCampus;
        return campus ? this.districtContext.campusRouteSlug(campus) : null;
    }

    selectDistrictOverviewCampus(campusId: number | null): void {
        this.districtOverviewCampusMenuOpen = false;
        this.districtOverviewHighlightedQuadrant = null;
        this.districtContext.setGrowthFilters({
            ...this.districtContext.growthFilters,
            campusId,
        });
        this.cdr.markForCheck();
    }

    toggleDistrictOverviewYearMenu(): void {
        this.districtOverviewYearMenuOpen = !this.districtOverviewYearMenuOpen;
        this.districtOverviewSearchOpen = false;
        this.districtOverviewSavedViewsOpen = false;
        this.districtOverviewCampusMenuOpen = false;
    }

    selectDistrictOverviewYear(academicYearId: number | null): void {
        this.districtOverviewYearMenuOpen = false;
        if (academicYearId !== this.districtContext.selection.academicYearId) {
            this.districtContext.setAcademicYearId(academicYearId);
        }
    }

    refreshDistrictOverview(): void {
        if (this.districtOverviewRefreshing) {
            return;
        }
        this.districtOverviewRefreshing = true;
        this.metricsLoadReset$.next();
        this.loadDashboardMetrics(this.route.snapshot.paramMap);
        setTimeout(() => {
            this.districtOverviewRefreshing = false;
            this.cdr.markForCheck();
        }, 900);
    }

    scrollToDistrictAttention(): void {
        const el = document.getElementById('dov-attention');
        el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ----- Header search (district campuses + loaded student rows) -----

    onDistrictOverviewSearchInput(): void {
        this.districtOverviewSearchOpen = !!this.districtOverviewSearchQuery.trim();
        this.districtOverviewSavedViewsOpen = false;
    }

    clearDistrictOverviewSearch(): void {
        this.districtOverviewSearchQuery = '';
        this.districtOverviewSearchOpen = false;
    }

    get districtOverviewCampusResults(): Campus[] {
        const q = this.districtOverviewSearchQuery.trim().toLowerCase();
        if (!q) {
            return [];
        }
        return this.districtContext.campuses
            .filter((c) => `${c.campusName} ${c.campusCode}`.toLowerCase().includes(q))
            .sort((a, b) => (a.campusName || '').localeCompare(b.campusName || ''))
            .slice(0, 6);
    }

    get districtOverviewStudentResults(): DistrictAdminStudentRow[] {
        const q = this.districtOverviewSearchQuery.trim().toLowerCase();
        if (!q) {
            return [];
        }
        return this.districtAdminAllStudents
            .filter((s) =>
                `${s.name} ${s.campus} ${s.grade}`.toLowerCase().includes(q),
            )
            .slice(0, 6);
    }

    get districtOverviewSearchResultCount(): number {
        return this.districtOverviewCampusResults.length + this.districtOverviewStudentResults.length;
    }

    openDistrictOverviewCampus(campus: Campus): void {
        this.closeDistrictOverviewPopovers();
        this.districtOverviewSearchQuery = '';
        this.router.navigate(['/dashboard/campus', this.districtContext.campusRouteSlug(campus)]);
    }

    openDistrictOverviewCampusBySlug(slug: string): void {
        this.closeDistrictOverviewPopovers();
        if (!slug) {
            return;
        }
        this.router.navigate(['/dashboard/campus', slug]);
    }

    openDistrictOverviewStudent(): void {
        this.closeDistrictOverviewPopovers();
        this.districtOverviewSearchQuery = '';
        this.router.navigate(['/students']);
    }

    // ----- Campus rows joined from the page's existing campus-metrics payload -----

    private districtOverviewRowsFromMetrics(
        metrics: Array<{
            campusId: number | null;
            campusCode: string;
            campusName: string;
            cs: number | null;
            growth: number | null;
        }>,
    ): DistrictOverviewCampusVm[] {
        const byId = new Map<number, (typeof metrics)[number]>();
        const byCode = new Map<string, (typeof metrics)[number]>();
        const byName = new Map<string, (typeof metrics)[number]>();
        for (const row of metrics) {
            if (row.campusId != null) {
                byId.set(row.campusId, row);
            }
            if (row.campusCode) {
                byCode.set(row.campusCode.toUpperCase(), row);
            }
            if (row.campusName) {
                byName.set(row.campusName.trim().toLowerCase(), row);
            }
        }
        const categories = this.districtContext.campusCategories;
        return this.districtContext
            .filterCampusesForActiveRole(this.districtContext.campuses)
            .map((campus) => {
                const metric =
                    byId.get(campus.campusId) ??
                    byCode.get((campus.campusCode || '').toUpperCase()) ??
                    byName.get((campus.campusName || '').trim().toLowerCase());
                const category = categories.find(
                    (c) => c.campusCategoryId === campus.campusCategoryId,
                );
                const levelCode = (category?.categoryCode || '—').toUpperCase();
                return {
                    campusId: campus.campusId,
                    campusCode: campus.campusCode || '',
                    campusName: campus.campusName || campus.campusCode || 'Campus',
                    shortCode: (campus.campusCode || campus.campusName || '—')
                        .trim()
                        .slice(0, 4)
                        .toUpperCase(),
                    slug: this.districtContext.campusRouteSlug(campus),
                    levelCode,
                    levelLabel: this.campusLevelBaseName(category?.categoryName || '') || levelCode,
                    cs: metric?.cs ?? null,
                    growth: metric?.growth ?? null,
                };
            })
            .sort((a, b) => a.campusName.localeCompare(b.campusName));
    }

    get districtOverviewCampusRows(): DistrictOverviewCampusVm[] {
        return this.districtOverviewRowsFromMetrics(this.districtOverviewCampusMetricRows);
    }

    /** All campuses' scores for the map, even when the page is scoped to one campus. */
    get districtOverviewAllCampusRows(): DistrictOverviewCampusVm[] {
        const all = this.districtOverviewRowsFromMetrics(
            this.districtOverviewAllCampusMetricRows,
        );
        return all.length ? all : this.districtOverviewCampusRows;
    }

    get districtOverviewLevels(): DistrictOverviewLevelVm[] {
        const categories = this.districtContext.campusCategories;
        const campuses = this.districtContext.campuses;
        const gradeRows = this.gradesByCategory ?? [];
        return categories
            .map((category) => {
                const code = (category.categoryCode || '').toUpperCase();
                const gradeRow = gradeRows.find(
                    (r) => (r.categoryCode || '').trim().toUpperCase() === code,
                );
                const selectedCampus = this.districtOverviewSelectedCampus;
                const campusCount = selectedCampus
                    ? selectedCampus.campusCategoryId === category.campusCategoryId
                        ? 1
                        : 0
                    : campuses.filter(
                          (c) => c.campusCategoryId === category.campusCategoryId,
                        ).length;
                return {
                    campusCategoryId: category.campusCategoryId,
                    code,
                    label: this.campusLevelBaseName(category.categoryName || '') || code,
                    campusCount,
                    cs: this.districtOverviewNumber(gradeRow?.cs),
                    csGrade: this.districtOverviewGrade(gradeRow?.csGrade),
                    growth: this.districtOverviewNumber(gradeRow?.growth),
                    growthGrade: this.districtOverviewGrade(gradeRow?.growthGrade),
                    link: `/dashboard/campus-category/${category.campusCategoryId}`,
                };
            })
            .filter(
                (row) =>
                    row.campusCount > 0 &&
                    (!this.districtOverviewSelectedCampus ||
                        row.campusCategoryId ===
                            this.districtOverviewSelectedCampus.campusCategoryId),
            )
            .sort((a, b) => this.districtOverviewLevelRank(a.code) - this.districtOverviewLevelRank(b.code));
    }

    private districtOverviewLevelRank(code: string): number {
        const order = ['ES', 'MS', 'HS'];
        const idx = order.indexOf(code);
        return idx < 0 ? 99 : idx;
    }

    private districtOverviewLevelColor(code: string): string {
        if (code === 'ES') {
            return '#A5B4FC';
        }
        if (code === 'MS') {
            return '#5B3DF5';
        }
        if (code === 'HS') {
            return '#11143A';
        }
        return '#5A6080';
    }

    private districtOverviewNumber(value: unknown): number | null {
        if (value == null || value === '') {
            return null;
        }
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
    }

    private districtOverviewGrade(value: unknown): string | null {
        const text = typeof value === 'string' ? value.trim().toUpperCase() : '';
        return text || null;
    }

    districtOverviewGradeArticle(grade: string | null | undefined): string {
        const g = (grade ?? '').trim().toUpperCase();
        return /^[AEIOUFLMNSX]$/.test(g) ? 'an' : 'a';
    }

    districtOverviewGradeClass(grade: string | null | undefined): string {
        const g = (grade ?? '').trim().toUpperCase();
        if (g === 'A') {
            return 'dov-grade-a';
        }
        if (g === 'B') {
            return 'dov-grade-b';
        }
        if (g === 'C') {
            return 'dov-grade-c';
        }
        if (g === 'D') {
            return 'dov-grade-d';
        }
        if (g === 'F') {
            return 'dov-grade-f';
        }
        return 'dov-grade-none';
    }

    // ----- Section 2: navy hero -----

    get districtOverviewCsScore(): number | null {
        return this.gaugeNumber(this.mockComponentScore);
    }

    get districtOverviewGrowthScore(): number | null {
        return this.gaugeNumber(this.mockGrowth);
    }

    get districtOverviewHeroScoreText(): string {
        const score = this.districtOverviewCsScore;
        return score == null ? '—' : String(Math.round(score));
    }

    get districtOverviewHeroGrowthText(): string {
        const score = this.districtOverviewGrowthScore;
        return score == null ? '—' : String(Math.round(score));
    }

    districtOverviewRingBackground(score: number | null): string {
        const pct = score == null ? 0 : Math.min(100, Math.max(0, score));
        return `conic-gradient(#A5B4FC ${pct}%, rgba(255, 255, 255, 0.12) ${pct}% 100%)`;
    }

    districtOverviewLevelGrades(measure: 'cs' | 'growth'): Array<{ label: string; grade: string | null }> {
        return (this.gradesByCategory ?? [])
            .map((row) => ({
                label: (row.categoryCode || '').trim().toUpperCase(),
                grade: this.districtOverviewGrade(
                    measure === 'cs' ? row.csGrade : row.growthGrade,
                ),
            }))
            .filter((row) => !!row.label);
    }

    get districtOverviewStudentsAcross(): number | null {
        // The hero reports tested students (same count as the KPI card), not enrollment.
        if (this.districtAdminStudentsLoading) {
            return null;
        }
        return this.districtOverviewStudentsTestedCount;
    }

    get districtOverviewCampusCount(): number {
        return this.districtContext.campuses.length;
    }

    get districtOverviewHeroLine(): string {
        const students = this.districtOverviewStudentsAcross;
        const campus = this.districtOverviewSelectedCampus;
        if (students == null) {
            return 'Loading student counts…';
        }
        if (campus) {
            return `${students.toLocaleString('en-US')} students at ${campus.campusName || campus.campusCode}.`;
        }
        const campusCount = this.districtOverviewCampusCount;
        return `${students.toLocaleString('en-US')} students across ${campusCount} campus${campusCount === 1 ? '' : 'es'}.`;
    }

    get districtOverviewComparisonSentence(): string {
        const cs = this.districtOverviewCsScore;
        const growth = this.districtOverviewGrowthScore;
        if (cs == null || growth == null) {
            return '';
        }
        if (Math.abs(growth - cs) < 0.05) {
            return 'Growth and achievement are level.';
        }
        return growth > cs
            ? 'Growth is outpacing achievement.'
            : 'Achievement is ahead of growth.';
    }

    get districtOverviewComparisonSubline(): string {
        const levels = this.districtOverviewLevels.filter(
            (l) => l.cs != null || l.growth != null,
        );
        if (!levels.length) {
            return '';
        }
        const withCs = levels.filter((l) => l.cs != null);
        const withGrowth = levels.filter((l) => l.growth != null);
        const csLeader = withCs.length
            ? withCs.reduce((best, row) => ((row.cs ?? -1) > (best.cs ?? -1) ? row : best))
            : null;
        const growthLeader = withGrowth.length
            ? withGrowth.reduce((best, row) =>
                  (row.growth ?? -1) > (best.growth ?? -1) ? row : best,
              )
            : null;
        const gapLeader = levels
            .filter((l) => l.cs != null && l.growth != null && (l.growth as number) < (l.cs as number))
            .map((l) => ({ level: l, gap: (l.cs as number) - (l.growth as number) }))
            .sort((a, b) => b.gap - a.gap)[0];

        const lead =
            csLeader && growthLeader && csLeader.code === growthLeader.code
                ? `${csLeader.label} schools lead on both measures.`
                : '';
        const lever = gapLeader
            ? `${gapLeader.level.label} growth is the district's biggest lever in the ${this.districtOverviewWindowLabel} window.`
            : '';
        return [lead, lever].filter(Boolean).join(' ');
    }

    // ----- Section 3: "Needs your attention" -----

    get districtOverviewAlerts(): DistrictOverviewAlertVm[] {
        if (!this.districtContext.bootstrapLoaded || this.campusChartLoading) {
            return [];
        }
        const alerts: DistrictOverviewAlertVm[] = [];
        const rows = this.districtOverviewCampusRows;
        const csAvg = this.districtOverviewMean(rows, 'cs');
        const growthAvg = this.districtOverviewMean(rows, 'growth');
        const goal = this.districtOverviewAttendanceGoal;

        const ada = this.attendanceGaugeValue;
        if (ada != null && ada < goal && !this.attendanceSummaryLoading) {
            const gap = goal - ada;
            const funding =
                this.districtOverviewFundingAtRiskYtd != null
                    ? this.districtOverviewUsdCompact(this.districtOverviewFundingAtRiskYtd)
                    : null;
            alerts.push({
                id: 'attendance-funding',
                category: 'FUNDING RISK',
                title: `Attendance is ${gap.toFixed(1)} pt below goal`,
                detail: `District ADA is ${ada.toFixed(1)}% against a ${goal}% goal.${funding ? ` About ${funding} in funding is at risk this year.` : ''}`,
                metrics: [
                    `${ada.toFixed(1)}% ADA`,
                    `Goal ${goal}%`,
                    funding ? `${funding} at risk` : 'Funding impact unavailable',
                ],
                actionLabel: 'Review attendance',
                actionLink: '/attendance',
            });
        }

        const levels = this.districtOverviewLevels.filter((l) => l.growth != null);
        if (levels.length > 1) {
            const lowest = levels.reduce((best, row) =>
                (row.growth ?? 999) < (best.growth ?? 999) ? row : best,
            );
            const growthValue = lowest.growth as number;
            const grade = lowest.growthGrade;
            const gradePhrase = grade ? `${this.districtOverviewGradeArticle(grade)} ${grade}` : null;
            const contrast =
                lowest.csGrade != null
                    ? `even though their STAAR score is ${this.districtOverviewGradeArticle(lowest.csGrade)} ${lowest.csGrade}.`
                    : lowest.cs != null
                      ? `with a STAAR score of ${lowest.cs.toFixed(1)}.`
                      : '';
            const detailBase = `${lowest.label} schools score ${growthValue.toFixed(1)} in growth, the lowest of any level`;
            const detail = contrast ? `${detailBase}, ${contrast}` : `${detailBase}.`;
            alerts.push({
                id: `level-growth-${lowest.code}`,
                category: 'GROWTH',
                title: gradePhrase
                    ? `${lowest.label} school growth is ${gradePhrase}`
                    : `${lowest.label} schools have the lowest growth`,
                detail: `${detailBase}, ${contrast}`,
                metrics: [
                    `${growthValue.toFixed(1)} growth`,
                    lowest.csGrade ? `STAAR ${lowest.csGrade}` : 'STAAR unavailable',
                ],
                actionLabel: `Open ${lowest.label} schools`,
                actionLink: lowest.link,
            });
        }

        const scoredCampuses = rows.filter((r) => r.cs != null);
        if (scoredCampuses.length) {
            const lowestCampus = scoredCampuses.reduce((best, row) =>
                (row.cs ?? 999) < (best.cs ?? 999) ? row : best,
            );
            const cs = lowestCampus.cs as number;
            const diff =
                csAvg != null ? (csAvg - cs) : null;
            const growthContrast =
                lowestCampus.growth != null && growthAvg != null
                    ? Math.abs(lowestCampus.growth - growthAvg) <= 5
                        ? `, though its growth (${lowestCampus.growth.toFixed(1)}) is close to average`
                        : `, with growth of ${lowestCampus.growth.toFixed(1)}`
                    : '';
            alerts.push({
                id: `campus-staar-${lowestCampus.campusCode || lowestCampus.slug}`,
                category: 'ACHIEVEMENT',
                title: `${lowestCampus.campusName} has the lowest STAAR score`,
                detail:
                    diff != null && diff > 0
                        ? `At ${cs.toFixed(1)}, it is ${diff.toFixed(1)} pts below the district average of ${(csAvg as number).toFixed(1)}${growthContrast}.`
                        : `Its STAAR score is ${cs.toFixed(1)} for this window${growthContrast}.`,
                metrics: [
                    `STAAR ${cs.toFixed(1)}`,
                    diff != null && diff > 0 ? `${diff.toFixed(1)} pts below avg` : 'District average unavailable',
                ],
                actionLabel: 'Open campus',
                actionLink: `/dashboard/campus/${lowestCampus.slug}`,
            });
        }

        if (csAvg != null && growthAvg != null) {
            const belowAverage = rows
                .filter(
                    (r) =>
                        r.cs != null &&
                        r.growth != null &&
                        (r.cs as number) >= csAvg &&
                        (r.growth as number) < growthAvg,
                )
                .map((r) => ({
                    row: r,
                    gap: (r.cs as number) - (r.growth as number),
                }))
                .sort((a, b) => b.gap - a.gap)[0];
            const globalLowestGrowth = rows
                .filter((r) => r.growth != null)
                .reduce<number | null>(
                    (min, r) => (min == null || (r.growth as number) < min ? (r.growth as number) : min),
                    null,
                );
            if (belowAverage) {
                const row = belowAverage.row;
                const growth = row.growth as number;
                const scope =
                    globalLowestGrowth != null && Math.abs(growth - globalLowestGrowth) < 0.05
                        ? 'the lowest growth of any campus'
                        : 'the lowest growth among campuses at or above the district STAAR average';
                alerts.push({
                    id: `campus-stalling-${row.campusCode || row.slug}`,
                    category: 'GROWTH',
                    title: `${row.campusName} is stalling`,
                    detail: `High STAAR score (${(row.cs as number).toFixed(1)}) but ${scope} (${growth.toFixed(1)}).`,
                    metrics: [
                        `STAAR ${(row.cs as number).toFixed(1)}`,
                        `Growth ${growth.toFixed(1)}`,
                    ],
                    actionLabel: 'Open campus',
                    actionLink: `/dashboard/campus/${row.slug}`,
                });
            }
        }

        return alerts.slice(0, 4);
    }

    get districtOverviewVisibleAlerts(): DistrictOverviewAlertVm[] {
        const dismissed = this.districtOverviewDismissedIds();
        return this.districtOverviewAlerts.filter((a) => !dismissed.includes(a.id));
    }

    get districtOverviewOpenAlertCount(): number {
        return this.districtOverviewVisibleAlerts.length;
    }

    dismissDistrictOverviewAlert(event: Event, alert: DistrictOverviewAlertVm): void {
        event.stopPropagation();
        this.ensureDistrictOverviewDismissedLoaded();
        const scope = this.districtOverviewScopeKey();
        const current = this.districtOverviewDismissedByScope[scope] ?? [];
        if (!current.includes(alert.id)) {
            this.districtOverviewDismissedByScope[scope] = [...current, alert.id];
            try {
                localStorage.setItem(
                    this.districtOverviewDismissedStorageKey(),
                    JSON.stringify(this.districtOverviewDismissedByScope),
                );
            } catch {
                /* storage unavailable — dismissal stays for this session */
            }
        }
        this.cdr.markForCheck();
    }

    private districtOverviewScopeKey(): string {
        const s = this.districtContext.selection;
        return [s.districtId ?? '', s.academicYearId ?? '', s.quarterCode ?? ''].join('|');
    }

    private districtOverviewDismissedIds(): string[] {
        this.ensureDistrictOverviewDismissedLoaded();
        return this.districtOverviewDismissedByScope[this.districtOverviewScopeKey()] ?? [];
    }

    private ensureDistrictOverviewDismissedLoaded(): void {
        const key = this.districtOverviewDismissedStorageKey();
        if (this.districtOverviewDismissedLoadedKey === key) {
            return;
        }
        this.districtOverviewDismissedLoadedKey = key;
        try {
            const raw = localStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : {};
            this.districtOverviewDismissedByScope =
                parsed && typeof parsed === 'object'
                    ? (parsed as Record<string, string[]>)
                    : {};
        } catch {
            this.districtOverviewDismissedByScope = {};
        }
    }

    private districtOverviewDismissedStorageKey(): string {
        const userId = this.auth.getCurrentUser()?.userId ?? 'anonymous';
        return `${GrowthOverviewPageComponent.DISTRICT_OVERVIEW_DISMISSED_KEY_PREFIX}:${userId}`;
    }

    private districtOverviewMean(
        rows: DistrictOverviewCampusVm[],
        key: 'cs' | 'growth',
    ): number | null {
        const values = rows
            .map((r) => r[key])
            .filter((v): v is number => v != null && Number.isFinite(v));
        return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
    }

    private districtOverviewUsd(value: number): string {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
        }).format(value);
    }

    private districtOverviewUsdCompact(value: number): string {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            notation: 'compact',
            maximumFractionDigits: 2,
        }).format(value);
    }

    districtOverviewAlertTagClass(category: string): string {
        const key = (category || '').trim().toUpperCase();
        if (key.includes('FUNDING')) {
            return 'dov-cat-red';
        }
        if (key.includes('ACHIEVEMENT')) {
            return 'dov-cat-amber';
        }
        if (key.includes('GROWTH')) {
            return 'dov-cat-violet';
        }
        return 'dov-cat-navy';
    }

    // ----- Section 4: KPI strip -----

    /** District-wide or campus-scoped count of the students already loaded for the card. */
    get districtOverviewStudentsTestedCount(): number {
        const campus = this.districtOverviewSelectedCampus;
        if (!campus) {
            return this.districtAdminStudentsCount;
        }
        return this.districtAdminAllStudents.filter(
            (row) => row.campusCode === campus.campusCode,
        ).length;
    }

    get districtOverviewStudentsTestedText(): string {
        if (this.districtAdminStudentsLoading) {
            return '—';
        }
        return this.districtOverviewStudentsTestedCount.toLocaleString('en-US');
    }

    get districtOverviewStudentsTestedSub(): string {
        const campuses = this.districtOverviewCampusRows.filter((r) => r.cs != null).length;
        const levels = this.districtOverviewLevels.filter(
            (l) => l.cs != null || l.growth != null,
        ).length;
        if (!campuses) {
            return 'No tested campuses for this window';
        }
        return `${campuses} campuses · ${levels} level${levels === 1 ? '' : 's'}`;
    }

    get districtOverviewAttendanceText(): string {
        return this.mockAttendancePct === '—' ? '—' : `${this.mockAttendancePct}%`;
    }

    get districtOverviewFundingAtRiskText(): string {
        return this.districtOverviewFundingAtRiskYtd != null
            ? `${this.districtOverviewUsdCompact(this.districtOverviewFundingAtRiskYtd)} funding at risk YTD`
            : 'Funding impact unavailable';
    }

    get districtOverviewCcmrText(): string {
        if (this.districtOverviewSelectedCampus) {
            return '—';
        }
        return this.ccmrRatePct != null ? `${this.ccmrRatePct.toFixed(1)}%` : '—';
    }

    get districtOverviewCcmrDelta(): number | null {
        const quarters = [...this.districtContext.districtQuarters].sort(
            (a, b) =>
                (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
                (a.startDate || '').localeCompare(b.startDate || ''),
        );
        const code = this.districtContext.selection.quarterCode;
        if (!code || !quarters.length || !this.districtOverviewCcmrMonthlyRates.length) {
            return null;
        }
        const index = quarters.findIndex((q) => q.quarterCode === code);
        if (index <= 0) {
            return null;
        }
        const current = this.districtOverviewCcmrWindowRate(quarters[index]);
        const previous = this.districtOverviewCcmrWindowRate(quarters[index - 1]);
        if (current == null || previous == null) {
            return null;
        }
        return current - previous;
    }

    get districtOverviewCcmrDeltaText(): string {
        const delta = this.districtOverviewCcmrDelta;
        if (delta == null) {
            return 'No prior window data';
        }
        const sign = delta > 0 ? '+' : '';
        return `${sign}${delta.toFixed(1)} pts vs prior window`;
    }

    get districtOverviewCcmrSubline(): string {
        if (this.districtOverviewSelectedCampus) {
            return 'Campus-level CCMR data unavailable';
        }
        const quarters = [...this.districtContext.districtQuarters].sort(
            (a, b) =>
                (a.sortOrder ?? 0) - (b.sortOrder ?? 0) ||
                (a.startDate || '').localeCompare(b.startDate || ''),
        );
        const code = this.districtContext.selection.quarterCode;
        const index = quarters.findIndex((q) => q.quarterCode === code);
        if (index <= 0) {
            return this.districtOverviewWindowLabel;
        }
        const current = this.districtContext.quarterDisplayLabel(quarters[index]);
        const previous = this.districtContext.quarterDisplayLabel(quarters[index - 1]);
        return `${current} vs ${previous}`;
    }

    private districtOverviewCcmrWindowRate(quarter: DistrictQuarter): number | null {
        const months = this.districtOverviewMonthsInQuarter(quarter);
        if (!months.length) {
            return null;
        }
        const values = this.districtOverviewCcmrMonthlyRates
            .filter((row) =>
                months.includes((row.month || '').trim()),
            )
            .map((row) => this.districtOverviewNumber(row.ccmrRate))
            .filter((v): v is number => v != null);
        if (!values.length) {
            return null;
        }
        return values.reduce((sum, v) => sum + v, 0) / values.length;
    }

    /** Month names whose 15th falls inside the quarter (monthly rates are per calendar month). */
    private districtOverviewMonthsInQuarter(quarter: DistrictQuarter): string[] {
        if (!quarter.startDate || !quarter.endDate) {
            return [];
        }
        const names = [
            'January',
            'February',
            'March',
            'April',
            'May',
            'June',
            'July',
            'August',
            'September',
            'October',
            'November',
            'December',
        ];
        const parse = (value: string): number[] | null => {
            const parts = value.slice(0, 10).split('-').map((p) => Number(p));
            return parts.length === 3 && parts.every((p) => Number.isFinite(p)) ? parts : null;
        };
        const start = parse(quarter.startDate);
        const end = parse(quarter.endDate);
        if (!start || !end) {
            return [];
        }
        const startUtc = Date.UTC(start[0], start[1] - 1, 1);
        const endUtc = Date.UTC(end[0], end[1] - 1, 1);
        const out: string[] = [];
        for (let cursor = startUtc; cursor <= endUtc; ) {
            const d = new Date(cursor);
            const year = d.getUTCFullYear();
            const month = d.getUTCMonth();
            const mid = Date.UTC(year, month, 15);
            if (mid >= Date.UTC(start[0], start[1] - 1, start[2]) &&
                mid <= Date.UTC(end[0], end[1] - 1, end[2])) {
                out.push(names[month]);
            }
            cursor = Date.UTC(year, month + 1, 1);
        }
        return out;
    }

    get districtOverviewGradText(): string {
        if (this.districtOverviewSelectedCampus) {
            return '—';
        }
        return this.gradRatePct != null ? `${this.gradRatePct.toFixed(1)}%` : '—';
    }

    get districtOverviewGradDeltaText(): string {
        return 'No prior window data';
    }

    get districtOverviewGradClassLabel(): string {
        if (this.districtOverviewSelectedCampus) {
            return 'Campus-level graduation data unavailable';
        }
        const label = this.districtOverviewYearLabel;
        const end = label.includes('-') ? label.split('-')[1]?.trim() : label;
        return `Class of ${end || '—'} projection`;
    }

    // ----- Section 5: campus map + performance levels -----

    get districtOverviewLevelFilters(): Array<{ code: string; label: string; count: number }> {
        return this.districtOverviewLevels.map((l) => ({
            code: l.code,
            label: l.label,
            count: l.campusCount,
        }));
    }

    setDistrictOverviewLevelFilter(code: string | null): void {
        this.districtOverviewLevelFilter = code;
        this.cdr.markForCheck();
    }

    setDistrictOverviewBoardLevelFilter(code: string | null): void {
        this.districtOverviewBoardLevelFilter = code;
        this.cdr.markForCheck();
    }

    isDistrictOverviewBoardLevelActive(code: string): boolean {
        return this.districtOverviewBoardLevelFilter === code;
    }

    get districtOverviewBoardLevelLabel(): string {
        const code = this.districtOverviewBoardLevelFilter;
        if (!code) {
            return 'All levels';
        }
        const level = this.districtOverviewLevels.find((l) => l.code === code);
        return level ? `${level.label} schools` : 'All levels';
    }

    get districtOverviewBoardRows(): DistrictOverviewCampusVm[] {
        const code = this.districtOverviewBoardLevelFilter;
        return code
            ? this.districtOverviewCampusRows.filter((r) => r.levelCode === code)
            : this.districtOverviewCampusRows;
    }

    isDistrictOverviewLevelActive(code: string): boolean {
        return this.districtOverviewLevelFilter === code;
    }

    get districtOverviewLevelFilteredRows(): DistrictOverviewCampusVm[] {
        const code = this.districtOverviewLevelFilter;
        return code
            ? this.districtOverviewCampusRows.filter((r) => r.levelCode === code)
            : this.districtOverviewCampusRows;
    }

    get districtOverviewPerformanceBands(): Array<{
        label: string;
        value: number | null;
        text: string;
    }> {
        return [
            { label: 'Approaches', value: this.gaugeNumber(this.mockApp) },
            { label: 'Meets', value: this.gaugeNumber(this.mockMeet) },
            { label: 'Masters', value: this.gaugeNumber(this.mockMaster) },
        ].map((band) => ({
            ...band,
            text: band.value == null ? '—' : `${band.value.toFixed(1)}%`,
        }));
    }

    /** Compact APP / MEET / MASTER columns shown in the hero's third panel. */
    get districtOverviewHeroBands(): Array<{
        label: string;
        text: string;
        value: number | null;
    }> {
        const short: Record<string, string> = {
            Approaches: 'APP',
            Meets: 'MEET',
            Masters: 'MASTER',
        };
        return this.districtOverviewPerformanceBands.map((band) => ({
            label: short[band.label] ?? band.label.toUpperCase().slice(0, 4),
            text: band.text,
            value: band.value,
        }));
    }

    get districtOverviewHighSchoolLink(): string {
        return '/academies/ccmr';
    }

    get districtOverviewScatter(): {
        points: DistrictOverviewScatterPointVm[];
        avgX: number | null;
        avgY: number | null;
        avgXLine: number | null;
        avgYLine: number | null;
        hasData: boolean;
    } {
        const rows = this.districtOverviewAllCampusRows;
        const allX = rows.map((r) => r.cs).filter((v): v is number => v != null);
        const allY = rows.map((r) => r.growth).filter((v): v is number => v != null);
        const xDomain = this.districtOverviewDomain(allX);
        const yDomain = this.districtOverviewDomain(allY);
        const left = 46;
        const right = 648;
        const top = 18;
        const bottom = 292;
        const plotW = right - left;
        const plotH = bottom - top;
        const xFor = (value: number): number =>
            left + ((value - xDomain.min) / Math.max(0.001, xDomain.max - xDomain.min)) * plotW;
        const yFor = (value: number): number =>
            top + ((yDomain.max - value) / Math.max(0.001, yDomain.max - yDomain.min)) * plotH;

        const avgX = allX.length ? allX.reduce((a, b) => a + b, 0) / allX.length : null;
        const avgY = allY.length ? allY.reduce((a, b) => a + b, 0) / allY.length : null;

        const points: DistrictOverviewScatterPointVm[] = rows
            .filter((r) => !this.districtOverviewLevelFilter || r.levelCode === this.districtOverviewLevelFilter)
            .filter((r) => r.cs != null && r.growth != null)
            .map((r) => ({
                key: `${r.campusId ?? r.campusCode}-${r.campusName}`,
                label: r.shortCode,
                name: r.campusName,
                levelCode: r.levelCode,
                cs: r.cs as number,
                growth: r.growth as number,
                x: xFor(r.cs as number),
                y: yFor(r.growth as number),
                color: this.districtOverviewLevelColor(r.levelCode),
                slug: r.slug,
                quadrantKey:
                    avgX != null && avgY != null
                        ? this.districtOverviewQuadrantKey(
                              r.cs as number,
                              r.growth as number,
                              avgX,
                              avgY,
                          )
                        : '',
            }));

        return {
            points,
            avgX,
            avgY,
            avgXLine: avgX != null ? xFor(avgX) : null,
            avgYLine: avgY != null ? yFor(avgY) : null,
            hasData: points.length > 0,
        };
    }

    private districtOverviewQuadrantDefs(): Array<{
        key: string;
        label: string;
        color: string;
        highCs: boolean;
        highGrowth: boolean;
    }> {
        return [
            { key: 'catching-up', label: 'CATCHING UP', color: '#a5b4fc', highCs: false, highGrowth: true },
            { key: 'high-achieve', label: 'HIGH ACHIEVE · HIGH GROWTH', color: '#5b3df5', highCs: true, highGrowth: true },
            { key: 'needs-support', label: 'NEEDS SUPPORT', color: '#8b93b5', highCs: false, highGrowth: false },
            { key: 'stalling', label: 'STALLING', color: '#11143a', highCs: true, highGrowth: false },
        ];
    }

    private districtOverviewQuadrantKey(
        cs: number,
        growth: number,
        avgX: number,
        avgY: number,
    ): string {
        const def = this.districtOverviewQuadrantDefs().find(
            (item) => (cs >= avgX) === item.highCs && (growth >= avgY) === item.highGrowth,
        );
        return def?.key ?? '';
    }

    /** Quadrant counts + campus codes, derived from the same plotted points and district averages. */
    get districtOverviewQuadrants(): Array<{
        key: string;
        label: string;
        color: string;
        count: number;
        codes: string;
    }> {
        const scatter = this.districtOverviewScatter;
        if (!scatter.hasData || scatter.avgX == null || scatter.avgY == null) {
            return [];
        }
        return this.districtOverviewQuadrantDefs().map((def) => {
            const points = scatter.points.filter((p) => p.quadrantKey === def.key);
            return {
                key: def.key,
                label: def.label,
                color: def.color,
                count: points.length,
                codes: points.map((p) => p.label).join(' · '),
            };
        });
    }

    toggleDistrictOverviewQuadrant(key: string): void {
        this.districtOverviewHighlightedQuadrant =
            this.districtOverviewHighlightedQuadrant === key ? null : key;
        this.cdr.markForCheck();
    }

    get districtOverviewQuadrantAverageText(): string {
        const scatter = this.districtOverviewScatter;
        if (scatter.avgX == null || scatter.avgY == null) {
            return 'District averages unavailable';
        }
        return `Avg STAAR ${(scatter.avgX as number).toFixed(1)} · Avg growth ${(scatter.avgY as number).toFixed(1)}`;
    }

    private districtOverviewDomain(values: number[]): { min: number; max: number } {
        if (!values.length) {
            return { min: 0, max: 100 };
        }
        let min = Math.min(...values);
        let max = Math.max(...values);
        if (max - min < 0.001) {
            min = Math.max(0, min - 5);
            max = Math.min(100, max + 5);
            if (max - min < 1) {
                return { min: 0, max: 100 };
            }
            return { min, max };
        }
        const pad = Math.max(2.5, (max - min) * 0.12);
        return { min: Math.max(0, min - pad), max: Math.min(100, max + pad) };
    }

    // ----- Section 6: campus leaderboard -----

    setDistrictOverviewLeaderSort(sort: 'staar' | 'growth'): void {
        this.districtOverviewLeaderSort = sort;
        this.cdr.markForCheck();
    }

    get districtOverviewLeaderboard(): Array<
        DistrictOverviewCampusVm & {
            rank: number;
            staarPct: number;
            growthPct: number;
        }
    > {
        const rows = this.districtOverviewBoardRows.filter((r) => r.cs != null);
        const sort = this.districtOverviewLeaderSort;
        const sorted = [...rows].sort((a, b) => {
            const av = (sort === 'staar' ? a.cs : a.growth) ?? -1;
            const bv = (sort === 'staar' ? b.cs : b.growth) ?? -1;
            return bv - av || a.campusName.localeCompare(b.campusName);
        });
        const scale = Math.max(
            100,
            ...rows.map((r) => Math.max(0, r.cs ?? 0) + Math.max(0, r.growth ?? 0)),
        );
        return sorted.map((row, index) => ({
            ...row,
            rank: index + 1,
            staarPct: ((Math.max(0, row.cs ?? 0) / scale) * 100),
            growthPct: ((Math.max(0, row.growth ?? 0) / scale) * 100),
        }));
    }

    get districtOverviewLeaderboardHiddenCount(): number {
        return this.districtOverviewBoardRows.filter((r) => r.cs == null).length;
    }

    // ----- Section 7: level cards -----

    get districtOverviewLevelCards(): DistrictOverviewLevelVm[] {
        return this.districtOverviewLevels;
    }

    // ----- Saved views (per signed-in user, per district) -----

    toggleDistrictOverviewSavedViews(): void {
        this.ensureDistrictOverviewSavedViewsLoaded();
        this.districtOverviewSavedViewsOpen = !this.districtOverviewSavedViewsOpen;
        this.districtOverviewSearchOpen = false;
    }

    saveDistrictOverviewView(): void {
        const s = this.districtContext.selection;
        if (s.districtId == null) {
            return;
        }
        this.ensureDistrictOverviewSavedViewsLoaded();
        const view: DistrictOverviewSavedView = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            districtId: s.districtId,
            academicYearId: s.academicYearId,
            quarterCode: s.quarterCode,
            filters: structuredClone(this.districtContext.growthFilters),
            savedAt: new Date().toISOString(),
        };
        const signature = this.districtOverviewViewSignature(view);
        const existing = this.savedDistrictOverviewViews.find(
            (v) => this.districtOverviewViewSignature(v) === signature,
        );
        this.savedDistrictOverviewViews = existing
            ? [existing, ...this.savedDistrictOverviewViews.filter((v) => v.id !== existing.id)]
            : [view, ...this.savedDistrictOverviewViews].slice(0, 12);
        this.persistDistrictOverviewSavedViews();
        this.districtOverviewSavedViewsOpen = true;
        this.districtOverviewSearchOpen = false;
        this.districtOverviewSavedFlash = true;
        setTimeout(() => {
            this.districtOverviewSavedFlash = false;
            this.cdr.markForCheck();
        }, 1800);
        this.cdr.markForCheck();
    }

    applyDistrictOverviewSavedView(view: DistrictOverviewSavedView): void {
        this.districtOverviewSavedViewsOpen = false;
        const s = this.districtContext.selection;
        if (s.districtId !== view.districtId) {
            this.districtContext.setDistrictId(view.districtId);
        }
        this.districtContext.setAcademicYearId(view.academicYearId);
        this.districtContext.setQuarterCode(view.quarterCode);
        this.districtContext.setGrowthFilters(structuredClone(view.filters));
        this.cdr.markForCheck();
    }

    deleteDistrictOverviewSavedView(event: Event, view: DistrictOverviewSavedView): void {
        event.stopPropagation();
        this.savedDistrictOverviewViews = this.savedDistrictOverviewViews.filter(
            (v) => v.id !== view.id,
        );
        this.persistDistrictOverviewSavedViews();
    }

    districtOverviewSavedViewLabel(view: DistrictOverviewSavedView): string {
        const year =
            this.districtContext.academicYears.find((y) => y.academicYearId === view.academicYearId)
                ?.yearLabel ?? '—';
        const quarter = this.districtContext.districtQuarters.find(
            (q) => q.quarterCode === view.quarterCode,
        );
        const windowLabel = quarter
            ? this.districtContext.quarterDisplayLabel(quarter)
            : view.quarterCode || '—';
        return `${year} · ${windowLabel}`;
    }

    districtOverviewSavedViewFilterCount(view: DistrictOverviewSavedView): number {
        const f = view.filters;
        return (
            (f.campusId != null ? 1 : 0) +
            (f.grades?.length ?? 0) +
            (f.subjects?.length ?? 0) +
            (f.specialEducation != null ? 1 : 0) +
            (f.economicDisadvantage != null ? 1 : 0) +
            (f.emergentBilingual != null ? 1 : 0) +
            (f.ethnicity != null ? 1 : 0) +
            (f.testLanguage != null ? 1 : 0)
        );
    }

    private districtOverviewViewSignature(view: DistrictOverviewSavedView): string {
        return JSON.stringify([view.academicYearId, view.quarterCode, view.filters]);
    }

    private ensureDistrictOverviewSavedViewsLoaded(): void {
        const key = this.districtOverviewSavedViewsStorageKey();
        if (this.districtOverviewSavedViewsLoadedKey === key) {
            return;
        }
        this.districtOverviewSavedViewsLoadedKey = key;
        try {
            const raw = localStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : [];
            this.savedDistrictOverviewViews = Array.isArray(parsed)
                ? (parsed as DistrictOverviewSavedView[])
                : [];
        } catch {
            this.savedDistrictOverviewViews = [];
        }
    }

    private persistDistrictOverviewSavedViews(): void {
        try {
            localStorage.setItem(
                this.districtOverviewSavedViewsStorageKey(),
                JSON.stringify(this.savedDistrictOverviewViews),
            );
        } catch {
            /* storage unavailable — keep the in-memory list */
        }
    }

    private districtOverviewSavedViewsStorageKey(): string {
        const userId = this.auth.getCurrentUser()?.userId ?? 'anonymous';
        const districtId = this.districtContext.selection.districtId ?? 'none';
        return `${GrowthOverviewPageComponent.DISTRICT_OVERVIEW_VIEWS_KEY_PREFIX}:${userId}:${districtId}`;
    }

    // ----- Extra data used only by the District Overview KPI cards -----

    private loadDistrictOverviewExtras(
        attendanceBody: { districtId: number; academicYearId: number; campusId?: number },
        until$: Observable<unknown>,
    ): void {
        this.districtOverviewExtrasLoading = true;
        this.attendanceAnalytics
            .postMonthlyStats(attendanceBody)
            .pipe(
                takeUntil(until$),
                catchError(() => of([] as MonthlyAttendanceStatDto[])),
                finalize(() => {
                    this.districtOverviewExtrasLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe((rows) => {
                this.districtOverviewMonthlyStats = rows ?? [];
                const values = (rows ?? [])
                    .map((m) => this.districtOverviewNumber(m.estimatedMissedFinance))
                    .filter((v): v is number => v != null);
                this.districtOverviewFundingAtRiskYtd = values.length
                    ? values.reduce((sum, v) => sum + v, 0)
                    : null;
                this.cdr.markForCheck();
            });

        this.ccmrAnalytics
            .postDistrictMonthlyRates({
                districtId: attendanceBody.districtId,
                academicYearId: attendanceBody.academicYearId,
                notLikelyCredits: CCMR_DEFAULT_CREDIT_THRESHOLDS.notLikelyCredits,
            })
            .pipe(
                takeUntil(until$),
                catchError(() => of([] as CcmrDistrictMonthRateDto[])),
            )
            .subscribe((rows) => {
                this.districtOverviewCcmrMonthlyRates = rows ?? [];
                this.cdr.markForCheck();
            });
    }

    private resetDistrictOverviewExtras(): void {
        this.districtOverviewExtrasLoading = false;
        this.districtOverviewMonthlyStats = [];
        this.districtOverviewCcmrMonthlyRates = [];
        this.districtOverviewFundingAtRiskYtd = null;
    }

    constructor(
        public storeData: Store<any>,
        private route: ActivatedRoute,
        private router: Router,
        /** Exposed for template: wait for filter bootstrap before showing “no data” empty states. */
        public readonly districtContext: DistrictContextService,
        private auth: AuthService,
        private apiService: ApiService,
        private growthAnalytics: GrowthAnalyticsService,
        private studentGrowthRecords: StudentGrowthRecordsService,
        private teachersService: TeachersService,
        private attendanceAnalytics: AttendanceAnalyticsService,
        private ccmrAnalytics: CcmrAnalyticsService,
        private studentMobilityApi: StudentMobilityService,
        private dashboardAnalytics: DashboardAnalyticsService,
        private cdr: ChangeDetectorRef,
    ) {
        this.initStore();
        this.isLoading = false;
    }

    ngOnInit() {
        this.route.paramMap.pipe(takeUntil(this.destroy$)).subscribe((params) => {
            this.campusId = params.get('id');
            const teacherStr = params.get('teacherId');
            const parsedTeacher = teacherStr != null && teacherStr !== '' ? Number(teacherStr) : NaN;
            this.teacherRouteId = Number.isFinite(parsedTeacher) ? parsedTeacher : null;
            const catStr = params.get('categoryId');
            const parsed = catStr != null && catStr !== '' ? Number(catStr) : NaN;
            this.campusCategoryRouteId = Number.isFinite(parsed) ? parsed : null;
            const districtStr = params.get('districtId');
            const parsedDistrict =
                districtStr != null && districtStr !== '' ? Number(districtStr) : NaN;
            this.districtRouteId = Number.isFinite(parsedDistrict) ? parsedDistrict : null;

            if (this.districtRouteId != null) {
                this.campusName = 'District Dashboard';
                /**
                 * Remember the pre-drilldown scope so returning to the main dashboard
                 * can restore it — visiting an empty district must not strand the
                 * whole dashboard on an empty context.
                 */
                this.districtContext.stashHomeSelection();
                /** Scope the whole dashboard to the clicked district (resets quarter + campuses). */
                if (this.districtContext.selection.districtId !== this.districtRouteId) {
                    this.districtContext.setDistrictId(this.districtRouteId);
                }
            } else if (this.campusCategoryRouteId != null) {
                this.campusName = 'Campus category';
            } else if (this.campusId) {
                const words = this.campusId.split('-');
                this.campusName = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            } else {
                this.campusName = 'Main Organization';
                /**
                 * Restoring the pre-drilldown scope happens in the loader chain below
                 * (after the district context bootstrap resolves) — doing it here races
                 * with the bootstrap re-applying the drilled district from storage.
                 */
            }

            if (!this.teacherRouteId) {
                this.teacherName = 'Classroom';
            }

            this.initCharts();

            const isPlainDistrictHome =
                !this.campusId &&
                this.campusCategoryRouteId == null &&
                this.districtRouteId == null;
            this.showOrgStats = this.isSuperAdminRole() && isPlainDistrictHome;
            this.showDistrictAdminStats = this.isDistrictAdminRole() && isPlainDistrictHome;
            if (this.showOrgStats) {
                this.loadOrgStats();
            }
        });

        /**
         * Each dashboard section loads independently and renders as soon as its API returns.
         * ADA summary no longer blocks growth KPIs, campus chart, or schools summary.
         */
        this.districtContext
            .initialize()
            .pipe(
                takeUntil(this.destroy$),
                switchMap(() =>
                    combineLatest([
                        this.districtContext.selection$,
                        this.districtContext.growthFilters$,
                        this.route.paramMap,
                    ]).pipe(
                        distinctUntilChanged(
                            ([a, fa, pa], [b, fb, pb]) =>
                                a.districtId === b.districtId &&
                                a.academicYearId === b.academicYearId &&
                                a.quarterCode === b.quarterCode &&
                                areGrowthFiltersEqual(fa, fb) &&
                                fa.specialEducation === fb.specialEducation &&
                                fa.economicDisadvantage === fb.economicDisadvantage &&
                                fa.emergentBilingual === fb.emergentBilingual &&
                                fa.ethnicity === fb.ethnicity &&
                                fa.testLanguage === fb.testLanguage &&
                                pa.get('id') === pb.get('id') &&
                                pa.get('categoryId') === pb.get('categoryId') &&
                                pa.get('teacherId') === pb.get('teacherId'),
                        ),
                        switchMap((tuple) =>
                            this.districtContext.ensureDistrictCampuses().pipe(map(() => tuple)),
                        ),
                    ),
                ),
            )
            .subscribe(([, , params]) => {
                /**
                 * Returning to the plain main dashboard after a district drill-down:
                 * restore the pre-drilldown scope BEFORE the quarter-readiness gate below.
                 * A drilled district without quarters keeps quarterCode null, so it never
                 * passes that gate — gating first used to strand the restore (dashes
                 * everywhere) until a manual refresh.
                 *
                 * The live-URL check is essential: when a drill-down switches the context,
                 * a still-tearing-down previous dashboard instance re-emits here with its
                 * own (home-route) params — without the URL check its restore would fire
                 * on the drill route and clobber the drilled district back to the home one.
                 */
                if (
                    !params.get('districtId') &&
                    !params.get('id') &&
                    !params.get('categoryId') &&
                    !params.get('teacherId') &&
                    this.isOnPlainDashboardPath() &&
                    this.districtContext.restoreHomeSelection()
                ) {
                    return;
                }
                /** Growth analytics need district + year + quarter; wait for the default quarter to land. */
                if (!this.districtContext.isGrowthContextReady()) {
                    /**
                     * Clear any KPIs left over from the previous scope — a quarter-less
                     * drill-down (e.g. a district with no quarters configured) must show
                     * dashes, never the previous district's numbers.
                     */
                    this.metricsLoadReset$.next();
                    this.clearOverallMetricsDisplay();
                    this.clearConceptDashboardState();
                    this.schoolsCategorySummaryRows = [];
                    this.categoryMetricsError = null;
                    this.clearCampusesOverviewChart();
                    this.campusMetricsError = null;
                    this.applyAttendanceSummary(null);
                    this.studentsSummaryLoading = false;
                    this.studentsTotalCount = null;
                    this.studentsIncomingCount = null;
                    this.studentsOutgoingCount = null;
                    this.developingCampusesLoading = false;
                    this.developingCampusesCount = 0;
                    this.developingCampusesTotal = 0;
                    this.developingComponentScoreAvg = null;
                    this.developingComponentScoreGrade = null;
                    this.developingGrowthAvg = null;
                    this.developingGrowthGrade = null;
                    this.progressingCampusesLoading = false;
                    this.progressingCampusesCount = 0;
                    this.progressingCampusesTotal = 0;
                    this.progressingComponentScoreAvg = null;
                    this.progressingComponentScoreGrade = null;
                    this.progressingGrowthAvg = null;
                    this.progressingGrowthGrade = null;
                    this.kpiMetricsLoading = false;
                    this.campusChartLoading = false;
                    this.categorySummaryLoading = false;
                    this.attendanceSummaryLoading = false;
                    this.resetCcmrSummary();
                    this.resetCcmrAcademyRanking();
                    this.districtCampusGrowthRanking = [];
                    this.cdr.markForCheck();
                    return;
                }
                this.metricsLoadReset$.next();
                this.loadDashboardMetrics(params);
                if (this.campusComparisonIds) {
                    this.loadCampusComparison(this.campusComparisonIds);
                }
            });

        /** Campus Comparison — react when a pair is chosen (or cleared) in the filters panel. */
        this.districtContext.campusComparison$.pipe(takeUntil(this.destroy$)).subscribe((pair) => {
            const changed = JSON.stringify(pair) !== JSON.stringify(this.lastComparisonPair);
            this.lastComparisonPair = pair;
            this.campusComparisonIds = pair;
            if (pair) {
                if (changed) {
                    this.comparisonModalDismissed = false;
                }
                this.loadCampusComparison(pair);
                /** Results surface in the floating window (unless the user closed it). */
                if (!this.comparisonModalDismissed) {
                    this.comparisonModal?.open();
                }
            } else {
                this.campusComparisonRows = null;
                this.campusComparisonError = null;
                this.campusComparisonLoading = false;
                this.comparisonModal?.close();
            }
            this.cdr.markForCheck();
        });
    }

    // ===== Campus Comparison panel (two campuses side by side) =====

    campusComparisonIds: [number, number] | null = null;
    campusComparisonRows: Array<{
        id: number;
        name: string;
        stats: GrowthOverallMetricsResponse | null;
    }> | null = null;
    campusComparisonLoading = false;
    campusComparisonError: string | null = null;

    /** Modal bookkeeping: remember the last pair and whether the user closed the window. */
    private lastComparisonPair: [number, number] | null = null;
    private comparisonModalDismissed = false;

    onComparisonModalClosed(): void {
        this.comparisonModalDismissed = true;
    }

    closeComparisonModal(): void {
        this.comparisonModal?.close();
    }

    /** Download the comparison stats as a PDF file to the local system. */
    async exportComparisonPdf(): Promise<void> {
        const rows = this.campusComparisonRows;
        if (!rows || rows.length !== 2) {
            return;
        }
        try {
            /** jsPDF loads lazily so it stays out of the initial dashboard bundle. */
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
            const pageW = doc.internal.pageSize.getWidth();
            const margin = 40;
            const now = new Date();

            const selection = this.districtContext.selection;
            const districtName =
                this.districtContext.districts.find((d) => d.districtId === selection.districtId)
                    ?.districtName || 'District';
            const quarter = selection.quarterCode ? ` · ${selection.quarterCode}` : '';

            // Title + context
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(14, 23, 38);
            doc.text('Campus Comparison', margin, 60);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(110, 118, 132);
            doc.text(
                `${districtName}${quarter} · Generated ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`,
                margin,
                76,
            );

            // Header row — metric column + one column per campus (brand colors)
            const tableW = pageW - margin * 2;
            const metricW = 150;
            const colW = (tableW - metricW) / 2;
            const headerH = 30;
            let y = 100;
            const header = (x: number, w: number, r: number, g: number, b: number, label: string) => {
                doc.setFillColor(r, g, b);
                doc.rect(x, y, w, headerH, 'F');
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(9);
                doc.setTextColor(255, 255, 255);
                doc.text(label, x + w / 2, y + headerH / 2 + 3, { align: 'center', maxWidth: w - 8 });
            };
            header(margin, metricW, 100, 116, 139, 'Metric');
            header(margin + metricW, colW, 42, 157, 143, rows[0].name || 'Campus A');
            header(margin + metricW + colW, colW, 231, 111, 81, rows[1].name || 'Campus B');
            y += headerH;

            // Metric rows — leader gets a highlighted cell + "(leads)" tag
            const rowH = 30;
            this.comparisonMetricRows.forEach((m, idx) => {
                const leader = this.comparisonLeader(m.key);
                if (idx % 2 === 1) {
                    doc.setFillColor(246, 248, 247);
                    doc.rect(margin, y, tableW, rowH, 'F');
                }
                doc.setDrawColor(226, 232, 240);
                doc.line(margin, y + rowH, margin + tableW, y + rowH);
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(9);
                doc.setTextColor(71, 85, 105);
                doc.text(m.label, margin + 10, y + rowH / 2 + 3);

                rows.forEach((row, i) => {
                    const cx = margin + metricW + i * colW;
                    const stats = row.stats;
                    const grade =
                        m.key === 'cs' ? stats?.csGrade : m.key === 'growth' ? stats?.growthGrade : null;
                    const val = this.fmtComparison(this.comparisonValue(stats, m.key));
                    const isLeader = leader === i;
                    const text = `${val}%${grade ? ` (${grade})` : ''}${isLeader ? '  (leads)' : ''}`;
                    doc.setFont('helvetica', isLeader ? 'bold' : 'normal');
                    doc.setFontSize(10);
                    if (isLeader) {
                        doc.setTextColor(23, 131, 119);
                    } else {
                        doc.setTextColor(30, 41, 59);
                    }
                    doc.text(text, cx + colW / 2, y + rowH / 2 + 3, {
                        align: 'center',
                        maxWidth: colW - 10,
                    });
                });
                y += rowH;
            });

            // Footnote
            y += 16;
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(140, 148, 160);
            doc.text(
                '(leads) marks the higher campus for each metric. Grades shown as letter where available.',
                margin,
                y,
            );

            const slug = (s: string) =>
                s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'campus';
            doc.save(
                `campus-comparison-${slug(rows[0].name || 'a')}-vs-${slug(rows[1].name || 'b')}.pdf`,
            );
        } catch (err) {
            console.error('Campus comparison PDF export failed', err);
        }
    }

    /** Which campus leads each metric in the comparison panel. */
    comparisonLeader(
        metric: 'cs' | 'growth' | 'app' | 'meet' | 'master',
    ): 0 | 1 | null {
        const rows = this.campusComparisonRows;
        if (!rows || rows.length !== 2) {
            return null;
        }
        const a = rows[0].stats?.[metric] ?? null;
        const b = rows[1].stats?.[metric] ?? null;
        if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) {
            return null;
        }
        if (Number(a) === Number(b)) {
            return null;
        }
        return Number(a) > Number(b) ? 0 : 1;
    }

    clearCampusComparison(): void {
        this.districtContext.setCampusComparison(null);
    }

    /** Comparison rows iterated in the template (key typed for stats indexing). */
    readonly comparisonMetricRows: Array<{
        key: 'cs' | 'growth' | 'app' | 'meet' | 'master';
        label: string;
    }> = [
        { key: 'cs', label: 'STAAR Component Score' },
        { key: 'growth', label: 'Growth' },
        { key: 'app', label: 'APP' },
        { key: 'meet', label: 'MEET' },
        { key: 'master', label: 'MASTER' },
    ];

    /** One-decimal display for comparison metric values. */
    fmtComparison(n: number | null | undefined): string {
        return Number.isFinite(Number(n)) ? Number(n).toFixed(1) : '—';
    }

    /** Typed metric lookup so the template stays strict-clean. */
    comparisonValue(
        stats: GrowthOverallMetricsResponse | null | undefined,
        key: 'cs' | 'growth' | 'app' | 'meet' | 'master',
    ): number | null {
        const v = stats?.[key];
        return Number.isFinite(Number(v)) ? Number(v) : null;
    }

    /** Fetch overall growth metrics for both picked campuses (same body as district home). */
    private loadCampusComparison(pair: [number, number]): void {
        const base = this.buildGrowthRequest(null, null);
        if (!base) {
            /* Growth context (district/year/quarter) not ready yet — the metrics
               subscription above re-fires this once selection lands. */
            return;
        }
        /** Comparison always scopes to the picked campuses, not the filter-campus. */
        const { campusCode: _ignored, ...baseBody } = base as CampusGrowthMetricsRequest;
        const campuses = this.districtContext.campuses;
        const picked = pair
            .map((id) => campuses.find((c) => c.campusId === id))
            .filter((c): c is NonNullable<typeof c> => c != null);
        if (picked.length < 2) {
            this.campusComparisonError = 'Campus list is still loading — try again in a moment.';
            this.cdr.markForCheck();
            return;
        }
        this.campusComparisonLoading = true;
        this.campusComparisonError = null;
        this.cdr.markForCheck();
        const until$ = merge(this.metricsLoadReset$, this.destroy$);
        forkJoin(
            picked.map((c) =>
                this.growthAnalytics
                    .getOverallGrowthMetrics({ ...baseBody, campusCode: c.campusCode })
                    .pipe(
                        timeout({ first: 90_000 }),
                        catchError(() => of(null as GrowthOverallMetricsResponse | null)),
                    ),
            ),
        )
            .pipe(
                takeUntil(until$),
                finalize(() => {
                    this.campusComparisonLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe((statsList) => {
                this.campusComparisonRows = picked.map((c, i) => ({
                    id: c.campusId,
                    name: c.campusName,
                    stats: statsList[i] ?? null,
                }));
                this.cdr.markForCheck();
            });
    }

    ngAfterViewInit(): void {
        this.attachCampusesChartResizeObserver();
        /** A saved comparison survives reloads — re-open its floating window. */
        if (this.campusComparisonIds && !this.comparisonModalDismissed) {
            this.comparisonModal?.open();
            this.cdr.markForCheck();
        }
    }

    ngOnDestroy(): void {
        this.metricsLoadReset$.next();
        this.metricsLoadReset$.complete();
        this.chartResizeObserver?.disconnect();
        this.teacherLeaderboardSub?.unsubscribe();
        this.campusStudentLeaderboardSub?.unsubscribe();
        this.districtLeaderboardSub?.unsubscribe();
        this.campusClassroomsSub?.unsubscribe();
        this.destroy$.next();
        this.destroy$.complete();
    }

    /**
     * Fires growth + attendance APIs in parallel; each section updates the view on its own response.
     */
    private loadDashboardMetrics(params: ParamMap): void {
        const routeId = params.get('id')?.toLowerCase() ?? '';
        const catStr = params.get('categoryId');
        const parsedCat = catStr != null && catStr !== '' ? Number(catStr) : NaN;
        const categoryId = Number.isFinite(parsedCat) ? parsedCat : null;
        const campusRouteId = params.get('id');
        const teacherStr = params.get('teacherId');
        const parsedTeacher = teacherStr != null && teacherStr !== '' ? Number(teacherStr) : NaN;
        const teacherRouteId = Number.isFinite(parsedTeacher) ? parsedTeacher : null;
        const isCampusRoute = categoryId == null && !!routeId;
        const isTeacherDrillDownView = isCampusRoute && teacherRouteId != null;
        const isSingleCampusView = isCampusRoute && teacherRouteId == null;
        const campusCode =
            isCampusRoute && campusRouteId
                ? this.resolveCampusCodeFromRouteParam(campusRouteId)
                : undefined;
        const body = this.buildGrowthRequest(campusRouteId, categoryId);
        const until$ = merge(this.metricsLoadReset$, this.destroy$);

        this.overallMetricsError = null;
        this.campusMetricsError = null;
        this.categoryMetricsError = null;
        /** New cards reload with the same selectors — never show the previous scope's numbers. */
        this.studentsSummaryLoading = true;
        this.studentsTotalCount = null;
        this.studentsIncomingCount = null;
        this.studentsOutgoingCount = null;
        this.developingCampusesLoading = true;
        this.developingCampusSourceRows = [];
        this.developingCampusesCount = 0;
        this.developingCampusesTotal = 0;
        this.developingComponentScoreAvg = null;
        this.developingComponentScoreGrade = null;
        this.developingGrowthAvg = null;
        this.developingGrowthGrade = null;
        this.progressingCampusesLoading = true;
        this.progressingCampusSourceRows = [];
        this.progressingCampusesCount = 0;
        this.progressingCampusesTotal = 0;
        this.progressingComponentScoreAvg = null;
        this.progressingComponentScoreGrade = null;
        this.progressingGrowthAvg = null;
        this.progressingGrowthGrade = null;

        if (!body) {
            this.kpiMetricsLoading = false;
            this.campusChartLoading = false;
            this.categorySummaryLoading = false;
            this.attendanceSummaryLoading = false;
            this.studentsSummaryLoading = false;
            this.developingCampusesLoading = false;
            this.progressingCampusesLoading = false;
            this.resetCcmrSummary();
            this.resetCcmrAcademyRanking();
            this.districtCampusGrowthRanking = [];
            this.districtOverviewCampusMetricRows = [];
            this.districtOverviewAllCampusMetricRows = [];
            return;
        }

        const filters = this.districtContext.growthFiltersPayload();
        const isDistrictHome = categoryId == null && !routeId;
        const overallBody: GrowthOverallMetricsRequest = {
            ...body,
            ...(isTeacherDrillDownView && teacherRouteId != null && campusCode
                ? { campusCode, teacherId: teacherRouteId }
                : {}),
        };
        this.kpiMetricsLoading = true;
        this.ensureConceptCalendar();
        this.growthAnalytics
            .getOverallGrowthMetrics(overallBody)
            .pipe(
                takeUntil(until$),
                timeout({ first: 90_000 }),
                catchError(() => {
                    this.overallMetricsError = 'Could not load growth metrics.';
                    return of(null);
                }),
                finalize(() => {
                    this.kpiMetricsLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe((overall) => {
                if (overall) {
                    this.applyOverallMetrics(overall);
                } else {
                    this.clearOverallMetricsDisplay();
                }
                this.cdr.markForCheck();
            });

        if (isTeacherDrillDownView) {
            this.teacherLeaderboardSub?.unsubscribe();
            this.categoryTopTeachers = [];
            this.categoryTopGrowthLeaders = [];
            this.categoryTeachersLoading = false;
            this.categoryTeacherMetricsError = null;
            this.campusStudentLeaderboardSub?.unsubscribe();
            this.campusTopClassrooms = [];
            this.campusTopStudents = [];
            this.campusStudentsLoading = false;
            this.campusStudentsError = null;

            if (campusRouteId && !campusCode) {
                this.campusMetricsError = 'Could not resolve campus for this school.';
                this.clearCampusesOverviewChart();
                this.campusChartLoading = false;
                this.teacherTopStudentsByScore = [];
                this.teacherTopStudentsByGrowth = [];
                this.teacherStudentOverviewRows = [];
                this.teacherStudentOverviewColumns = structuredClone(STUDENT_BASE_COLUMNS);
                this.teacherStudentDiffColumnFields = [];
                this.teacherStudentListLoading = false;
            } else if (campusCode && teacherRouteId != null) {
                this.teacherName = this.resolveTeacherNameFromNavigation(teacherRouteId);
                this.campusChartLoading = true;
                this.teacherStudentListLoading = true;
                this.campusMetricsError = null;
                const scopeBody = {
                    districtId: body.districtId,
                    academicYearId: body.academicYearId,
                    quarterCode: body.quarterCode,
                    campusCode,
                    teacherId: teacherRouteId,
                    ...filters,
                };
                const byTeacherBody = this.buildStudentGrowthByTeacherRequest(
                    campusCode,
                    teacherRouteId,
                    filters,
                    body,
                );
                forkJoin({
                    chartMetrics: this.growthAnalytics
                        .getCampusTeacherStudentGrowthMetrics(scopeBody)
                        .pipe(catchError(() => of([] as TeacherStudentGrowthMetricsResponse[]))),
                    studentRecords: byTeacherBody
                        ? this.studentGrowthRecords.listByTeacher(byTeacherBody).pipe(
                              catchError(() => of([] as StudentGrowthRecordResponse[])),
                          )
                        : of([] as StudentGrowthRecordResponse[]),
                })
                    .pipe(
                        takeUntil(until$),
                        finalize(() => {
                            this.campusChartLoading = false;
                            this.teacherStudentListLoading = false;
                            this.cdr.markForCheck();
                        }),
                    )
                    .subscribe(({ chartMetrics, studentRecords }) => {
                        if (this.campusId) {
                            const code = this.resolveCampusCodeFromRouteParam(this.campusId);
                            const match = this.districtContext.campuses?.find(
                                (c) => c.campusCode === code,
                            );
                            if (match?.campusName) {
                                this.campusName = match.campusName;
                            }
                        }
                        if (!chartMetrics?.length) {
                            this.campusMetricsError =
                                this.campusMetricsError ?? 'Could not load student overview.';
                        }
                        this.applyStudentMetricsChart(chartMetrics ?? []);
                        this.syncTeacherStudentOverviewTableRows(studentRecords ?? []);
                        this.cdr.markForCheck();
                    });
            }
        } else if (isSingleCampusView) {
            if (campusRouteId && !campusCode) {
                this.campusMetricsError = 'Could not resolve campus for this school.';
                this.clearCampusesOverviewChart();
                this.campusChartLoading = false;
                this.campusTopClassrooms = [];
                this.campusTopStudents = [];
                this.campusStudentsLoading = false;
                this.campusStudentLeaderboardSub?.unsubscribe();
            } else if (campusCode) {
                this.campusChartLoading = true;
                this.growthAnalytics
                    .getCampusTeacherGrowthMetrics({
                        districtId: body.districtId,
                        academicYearId: body.academicYearId,
                        quarterCode: body.quarterCode,
                        campusCode,
                        ...filters,
                    })
                    .pipe(
                        takeUntil(until$),
                        catchError(() => {
                            this.campusMetricsError = 'Could not load classroom overview.';
                            return of(null);
                        }),
                        finalize(() => {
                            this.campusChartLoading = false;
                            this.cdr.markForCheck();
                        }),
                    )
                    .subscribe((teachers) => {
                        if (this.campusId) {
                            const code = this.resolveCampusCodeFromRouteParam(this.campusId);
                            const match = this.districtContext.campuses?.find(
                                (c) => c.campusCode === code,
                            );
                            if (match?.campusName) {
                                this.campusName = match.campusName;
                            }
                        }
                        if (teachers?.length) {
                            this.applyTeacherMetricsChart(teachers);
                        } else {
                            this.clearCampusesOverviewChart();
                        }
                        this.cdr.markForCheck();
                    });
                this.loadCampusClassroomLeaderboard(campusCode, body, until$);
                this.loadCampusStudentLeaderboard(campusCode, body, until$);
            }
            this.teacherLeaderboardSub?.unsubscribe();
            this.categoryTopTeachers = [];
            this.categoryTopGrowthLeaders = [];
            this.categoryTeachersLoading = false;
            this.categoryTeacherMetricsError = null;
        } else {
            this.campusStudentLeaderboardSub?.unsubscribe();
            this.campusTopClassrooms = [];
            this.campusTopStudents = [];
            this.campusStudentsLoading = false;
            this.campusStudentsError = null;
            this.teacherTopStudentsByScore = [];
            this.teacherTopStudentsByGrowth = [];
            this.teacherStudentOverviewRows = [];
            this.teacherStudentOverviewColumns = structuredClone(STUDENT_BASE_COLUMNS);
            this.teacherStudentDiffColumnFields = [];
            this.teacherStudentListLoading = false;
            this.campusChartLoading = true;
            this.growthAnalytics
                .getCampusGrowthMetrics(body)
                .pipe(
                    takeUntil(until$),
                    catchError(() => {
                        this.campusMetricsError = 'Could not load campus overview.';
                        return of(null);
                    }),
                    finalize(() => {
                        this.campusChartLoading = false;
                        this.cdr.markForCheck();
                    }),
                )
                .subscribe((campus) => {
                    const scopedCampus = this.filterCampusMetricsForRole(campus);
                    if (scopedCampus?.length) {
                        this.applyCampusMetricsChart(scopedCampus);
                    } else {
                        this.clearCampusesOverviewChart();
                    }
                    if (campus == null) {
                        // Request failed — never show invented zeros; dashes like every other card.
                        this.developingCampusSourceRows = [];
                        this.progressingCampusSourceRows = [];
                        this.developingCampusesLoading = false;
                        this.developingCampusesCount = 0;
                        this.developingCampusesTotal = 0;
                        this.developingComponentScoreAvg = null;
                        this.developingComponentScoreGrade = null;
                        this.developingGrowthAvg = null;
                        this.developingGrowthGrade = null;
                        this.progressingCampusesLoading = false;
                        this.progressingCampusesCount = 0;
                        this.progressingCampusesTotal = 0;
                        this.progressingComponentScoreAvg = null;
                        this.progressingComponentScoreGrade = null;
                        this.progressingGrowthAvg = null;
                        this.progressingGrowthGrade = null;
                    } else {
                        this.applyDevelopingCampusStats(scopedCampus);
                        this.applyProgressingCampusStats(scopedCampus);
                    }
                    this.applyDistrictCampusGrowthRanking(scopedCampus);
                    if (this.isDistrictAdminOverview && isDistrictHome && this.districtContext.filterCampus()) {
                        this.districtOverviewAllCampusMetricRows = [];
                        this.growthAnalytics
                            .getCampusGrowthMetrics({ ...body, campusCode: null } as any)
                            .pipe(
                                takeUntil(until$),
                                catchError(() => of<CampusGrowthMetricsResponse[]>([])),
                            )
                            .subscribe((rows) => {
                                this.districtOverviewAllCampusMetricRows = (rows ?? []).map(
                                    (r) => ({
                                        campusId: r.campusId ?? null,
                                        campusCode: (r.campusCode || '').trim(),
                                        campusName: (r.campusName || r.campusCode || '').trim(),
                                        cs: r.componentScore ?? null,
                                        growth: r.growth ?? null,
                                    }),
                                );
                                this.cdr.markForCheck();
                            });
                    } else {
                        this.districtOverviewAllCampusMetricRows =
                            this.districtOverviewCampusMetricRows;
                    }
                    this.applyCampusGrowthRanking(scopedCampus);
                    this.applyCampusMetricPairsRanking(scopedCampus);
                    if (this.isCampusCategoryView) {
                        this.loadCategoryTopLeaderboards(this.campusCategoryRouteId);
                    } else {
                        this.teacherLeaderboardSub?.unsubscribe();
                        this.categoryTopTeachers = [];
                        this.categoryTopGrowthLeaders = [];
                        this.categoryTeachersLoading = false;
                        this.categoryTeacherMetricsError = null;
                    }
                    if (isDistrictHome) {
                        this.loadDistrictHomeLeaderboards(until$);
                    } else {
                        this.districtLeaderboardSub?.unsubscribe();
                        this.districtHomeTopTeachers = [];
                        this.districtHomeTopClassrooms = [];
                        this.districtLeaderboardsLoading = false;
                        this.districtLeaderboardsError = null;
                    }
                    this.cdr.markForCheck();
                });
        }

        this.categorySummaryLoading = true;
        if (isDistrictHome || categoryId != null) {
            this.growthAnalytics
                .getCampusCategoryGrowthMetrics(body)
                .pipe(
                    takeUntil(until$),
                    catchError(() => {
                        this.categoryMetricsError = 'Could not load schools summary.';
                        this.schoolsCategorySummaryRows = [];
                        return of(null);
                    }),
                    finalize(() => {
                        this.categorySummaryLoading = false;
                        this.cdr.markForCheck();
                    }),
                )
                .subscribe((categories) => {
                    if (categories != null) {
                        const scopedCategories = this.filterCategoryMetricsForRole(categories);
                        this.applyCategoryMetrics(scopedCategories);
                        if (this.campusCategoryRouteId != null && scopedCategories.length > 0) {
                            const match = scopedCategories.find(
                                (c) => c.campusCategoryId === this.campusCategoryRouteId,
                            );
                            if (match?.campusCategoryName) {
                                this.campusName = match.campusCategoryName;
                            }
                        }
                    }
                    this.cdr.markForCheck();
                });
        } else {
            this.categorySummaryLoading = false;
            this.schoolsCategorySummaryRows = [];
            this.categoryMetricsError = null;
        }

        if (isDistrictHome && this.districtContext.isAttendanceContextReady()) {
            const filterCampus = this.districtContext.filterCampus();
            this.loadStudentMobilitySummary(
                filterCampus?.campusCode ?? null,
                until$,
            );
            if (this.isDistrictAdminRole()) {
                this.loadDistrictAdminData(until$);
            }
            const baseAttendance = this.districtContext.baseAttendancePayload();
            const attendanceBody = baseAttendance
                ? { ...baseAttendance, ...(filterCampus ? { campusId: filterCampus.campusId } : {}) }
                : null;
            if (attendanceBody) {
                this.attendanceSummaryLoading = true;
                this.attendanceAnalytics
                    .postDistrictAdaSummary(attendanceBody)
                    .pipe(
                        takeUntil(until$),
                        catchError(() => of(null as DistrictAttendanceSummaryDto | null)),
                        finalize(() => {
                            this.attendanceSummaryLoading = false;
                            this.cdr.markForCheck();
                        }),
                    )
                    .subscribe((summary) => {
                        this.applyAttendanceSummary(summary);
                        this.cdr.markForCheck();
                    });

                this.loadCcmrSummary(attendanceBody, until$);
                if (this.isDistrictAdminRole()) {
                    this.loadDistrictOverviewExtras(attendanceBody, until$);
                } else {
                    this.resetDistrictOverviewExtras();
                }
            } else {
                this.resetCcmrSummary();
                this.resetCcmrAcademyRanking();
                this.resetDistrictOverviewExtras();
            }
        } else {
            if (!isDistrictHome) {
                this.applyAttendanceSummary(null);
            }
            this.resetCcmrSummary();
            this.resetCcmrAcademyRanking();
            this.resetDistrictOverviewExtras();
            this.districtCampusGrowthRanking = [];
            this.studentsSummaryLoading = false;
            this.studentsTotalCount = null;
            this.studentsIncomingCount = null;
            this.studentsOutgoingCount = null;
        }
    }

    /**
     * Students KPI — total / incoming / outgoing students for the current district + year + grading window.
     * Same source and calculation as the Campus/Students mobility stats (POST /api/student-mobility/quarter-comparison,
     * backed by the student_mobility table). Respects the campus filter chosen in Search Filters when set.
     * No data for the window → honest empty state (dashes), never invented numbers.
     */
    private loadStudentMobilitySummary(campusCode: string | null, until$: Observable<unknown>): void {
        const selection = this.districtContext.selection;
        if (
            selection.districtId == null ||
            selection.academicYearId == null ||
            !selection.quarterCode?.trim()
        ) {
            this.studentsSummaryLoading = false;
            this.studentsTotalCount = null;
            this.studentsIncomingCount = null;
            this.studentsOutgoingCount = null;
            return;
        }
        this.studentsSummaryLoading = true;
        this.studentMobilityApi
            .postQuarterComparison({
                districtId: selection.districtId,
                academicYearId: selection.academicYearId,
                quarterCode: selection.quarterCode,
                ...(campusCode ? { campusCode } : {}),
            })
            .pipe(
                takeUntil(until$),
                catchError(() => of(null)),
                finalize(() => {
                    this.studentsSummaryLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe((mobility) => {
                if (!mobility) {
                    this.studentsTotalCount = null;
                    this.studentsIncomingCount = null;
                    this.studentsOutgoingCount = null;
                    this.cdr.markForCheck();
                    return;
                }
                const toNumberOrNull = (v: unknown): number | null => {
                    if (v == null || v === '') {
                        return null;
                    }
                    const n = Number(v);
                    return Number.isFinite(n) ? n : null;
                };
                this.studentsTotalCount = toNumberOrNull(mobility.totalStudents);
                this.studentsIncomingCount = toNumberOrNull(mobility.incomingStudents);
                this.studentsOutgoingCount = toNumberOrNull(mobility.outgoingStudents);
                this.cdr.markForCheck();
            });
    }

    /**
     * Other summary + academy ranking — overall-percentages then academy-stats (calendar month from API).
     */
    private loadCcmrSummary(
        base: { districtId: number; academicYearId: number },
        until$: Observable<unknown>,
    ): void {
        this.ccmrSummaryLoading = true;
        this.ccmrAcademyRankingLoading = true;
        this.ccmrSummaryError = null;
        this.ccmrAcademyRankingError = null;

        const thresholds = CCMR_DEFAULT_CREDIT_THRESHOLDS;
        const thresholdBody = this.ccmrAnalytics.buildThresholdPayload(
            base.districtId,
            base.academicYearId,
            thresholds,
        );

        this.dashboardAnalytics
            .postOverallPercentages({
                districtId: base.districtId,
                academicYearId: base.academicYearId,
                notLikelyCredits: thresholds.notLikelyCredits,
            })
            .pipe(
                takeUntil(until$),
                switchMap((overall) =>
                    this.loadAcademyRankingForMonth(overall, thresholdBody),
                ),
                catchError(() => {
                    this.ccmrSummaryError = 'Could not load summary metrics.';
                    return of(null);
                }),
                finalize(() => {
                    this.ccmrSummaryLoading = false;
                    this.ccmrAcademyRankingLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe((result) => {
                if (!result) {
                    this.resetCcmrSummary();
                    this.resetCcmrAcademyRanking();
                    this.cdr.markForCheck();
                    return;
                }
                this.applyOverallPercentages(result.overall);
                this.applyCcmrAcademyRanking(result.academy);
                this.cdr.markForCheck();
            });
    }

    private loadAcademyRankingForMonth(
        overall: DistrictOverallPercentagesResponse,
        thresholdBody: ReturnType<CcmrAnalyticsService['buildThresholdPayload']>,
    ): Observable<{
        overall: DistrictOverallPercentagesResponse;
        academy: CcmrAcademyStatsItemDto[];
    }> {
        const calendarMonth = overall.calendarMonth?.trim();
        if (!calendarMonth) {
            return of({ overall, academy: [] });
        }
        return this.ccmrAnalytics.postAcademyStats({ ...thresholdBody, calendarMonth }).pipe(
            map((academy) => ({ overall, academy })),
            catchError(() => {
                this.ccmrAcademyRankingError = 'Could not load academy CCMR ranking.';
                return of({ overall, academy: [] as CcmrAcademyStatsItemDto[] });
            }),
        );
    }

    private applyOverallPercentages(data: DistrictOverallPercentagesResponse): void {
        const ccmr = this.normalizeCcmrRate(data.ccmrRate);
        const grad = this.normalizeCcmrRate(data.graduationRate);
        const teachers = this.normalizeCcmrRate(data.teachers);
        this.ccmrRatePct = ccmr;
        this.gradRatePct = grad;
        this.teachersRatePct = teachers;
    }

    private resetCcmrSummary(): void {
        this.ccmrRatePct = null;
        this.gradRatePct = null;
        this.teachersRatePct = null;
        this.ccmrSummaryError = null;
        this.ccmrSummaryLoading = false;
    }

    private resetCcmrAcademyRanking(): void {
        this.ccmrAcademyRanking = [];
        this.ccmrAcademyRankingError = null;
        this.ccmrAcademyRankingLoading = false;
    }

    private applyCcmrAcademyRanking(rows: CcmrAcademyStatsItemDto[] | null | undefined): void {
        if (!rows?.length) {
            this.ccmrAcademyRanking = [];
            return;
        }
        this.ccmrAcademyRanking = [...rows]
            .sort(
                (a, b) =>
                    (this.normalizeCcmrRate(b.ccmr) ?? -999999) -
                    (this.normalizeCcmrRate(a.ccmr) ?? -999999),
            )
            .slice(0, 8)
            .map((row) => ({
                school: (row.school ?? '—').trim(),
                ccmrPct: this.normalizeCcmrRate(row.ccmr),
                gradPct: this.normalizeCcmrRate(row.gradRate),
            }));
    }

    /** District home ROW 4 — reuse POST /growth/campus-metrics (no extra call). */
    private applyDistrictCampusGrowthRanking(
        campus: CampusGrowthMetricsResponse[] | null | undefined,
    ): void {
        if (!this.isDistrictHomeDashboard || !campus?.length) {
            this.districtCampusGrowthRanking = [];
            this.districtOverviewCampusMetricRows = [];
            this.districtOverviewAllCampusMetricRows = [];
            return;
        }
        this.districtOverviewCampusMetricRows = campus.map((r) => ({
            campusId: r.campusId ?? null,
            campusCode: (r.campusCode || '').trim(),
            campusName: (r.campusName || r.campusCode || '').trim(),
            cs: r.componentScore ?? null,
            growth: r.growth ?? null,
        }));
        this.districtCampusGrowthRanking = [...campus]
            .sort((a, b) => (b.growth ?? -999999) - (a.growth ?? -999999))
            .slice(0, 8)
            .map((r) => ({
                campusName: (r.campusName || r.campusCode || '—').trim(),
                growth: r.growth ?? null,
                score: r.componentScore ?? null,
            }));
    }

    formatCcmrPairPct(ccmr: number | null, grad: number | null): string {
        const c = ccmr != null ? `${ccmr.toFixed(1)}%` : '—';
        const g = grad != null ? `${grad.toFixed(1)}%` : '—';
        return `${c} / ${g}`;
    }

    trackDistrictCampusGrowthRank(_index: number, row: DistrictCampusGrowthRankVm): string {
        return row.campusName;
    }

    trackCcmrAcademyRank(_index: number, row: CcmrAcademyRankVm): string {
        return row.school;
    }

    /** API may return 0–1 fractions; cards expect 0–100 percentages. */
    private normalizeCcmrRate(n: number | null | undefined): number | null {
        if (n == null || !Number.isFinite(Number(n))) {
            return null;
        }
        const v = Number(n);
        return v > 0 && v <= 1 ? v * 100 : v;
    }

    /** Display helper for teacher / campus tables. */
    formatNullablePct(n: number | null | undefined): string {
        if (n == null || !Number.isFinite(Number(n))) {
            return '—';
        }
        return `${Number(n).toFixed(1)}%`;
    }

    formatStudentScore(n: number | null | undefined): string {
        if (n == null || !Number.isFinite(Number(n))) {
            return '—';
        }
        return `${Math.round(Number(n))}%`;
    }

    get canOpenTeacherStudentOverview(): boolean {
        return this.teacherStudentOverviewRows.length > 0 && !this.teacherStudentListLoading;
    }

    get canExportTeacherStudentOverview(): boolean {
        return this.teacherStudentOverviewRows.length > 0;
    }

    /** Row accent by quarter score band — matches Students screen. */
    teacherStudentRowClass(row: StudentRow): string {
        return scoreBandRowClass(row.quarterScore);
    }

    teacherStudentQuarterDiffValue(row: StudentRow | null | undefined, field: string): number | null {
        if (!row) {
            return null;
        }
        const value = row[field];
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }

    openTeacherStudentOverviewModal(): void {
        if (!this.canOpenTeacherStudentOverview) {
            return;
        }
        this.teacherStudentOverviewModal?.open();
    }

    exportTeacherStudentOverview(kind: 'excel' | 'print'): void {
        if (!this.canExportTeacherStudentOverview) {
            return;
        }
        const title = this.teacherStudentExportTitle();
        const cols = this.teacherStudentExportColumns();
        const rows = this.teacherStudentOverviewRows.map((row) => {
            const out: Record<string, string | number | null> = {};
            for (const col of cols) {
                const value = row[col.field];
                out[col.field] = value == null ? '' : value;
            }
            return out;
        });
        if (kind === 'excel') {
            downloadCsv(this.teacherStudentExportFilename(), cols, rows);
            return;
        }
        printTable(title, cols, rows);
    }

    private teacherStudentExportColumns(): TableExportColumn[] {
        return this.teacherStudentOverviewColumns
            .filter((col) => !col.hide)
            .map((col) => ({ field: col.field, title: col.title }));
    }

    private teacherStudentExportTitle(): string {
        const campus = this.campusName?.trim() || 'Campus';
        const teacher = this.teacherName?.trim() || 'Classroom';
        const quarterCode = this.districtContext.selection.quarterCode;
        const quarter = this.districtContext.districtQuarters.find((q) => q.quarterCode === quarterCode);
        const quarterLabel = quarter
            ? this.districtContext.quarterDisplayLabel(quarter)
            : quarterCode?.trim();
        return `${teacher} — Students — ${campus}${quarterLabel ? ` (${quarterLabel})` : ''}`;
    }

    private teacherStudentExportFilename(): string {
        const slug = (value: string) =>
            value
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'export';
        return `students-${slug(this.campusName)}-${slug(this.teacherName)}`;
    }

    private syncTeacherStudentOverviewTableRows(records: StudentGrowthRecordResponse[]): void {
        const quarterSequence = this.deriveTeacherStudentQuarterSequence(records);
        this.applyTeacherStudentOverviewColumns(quarterSequence);
        this.teacherStudentOverviewRows = records.map((record) =>
            mapStudentGrowthRecordToRow(
                record,
                this.districtContext.campuses,
                quarterSequence,
            ),
        );
    }

    private applyTeacherStudentOverviewColumns(quarterSequence?: string[] | null): void {
        const diffCols = buildQuarterDiffColumnDefs(quarterSequence);
        this.teacherStudentOverviewColumns = [...STUDENT_BASE_COLUMNS, ...diffCols];
        this.teacherStudentDiffColumnFields = diffCols.map((col) => col.field);
    }

    private deriveTeacherStudentQuarterSequence(
        records: StudentGrowthRecordResponse[],
    ): string[] | null {
        const codes = new Set<string>();
        for (const record of records) {
            const active = record.quarterCode?.trim();
            if (active) {
                codes.add(active);
            }
            for (const step of record.quarterScoreProgression ?? []) {
                const earlier = step.earlierQuarterCode?.trim();
                const later = step.laterQuarterCode?.trim();
                if (earlier) {
                    codes.add(earlier);
                }
                if (later) {
                    codes.add(later);
                }
            }
        }
        const districtOrder = this.districtContext.districtQuarters
            .map((q) => q.quarterCode?.trim())
            .filter((code): code is string => !!code);
        if (districtOrder.length >= 2) {
            const ordered = districtOrder.filter((code) => codes.has(code));
            if (ordered.length >= 2) {
                return ordered;
            }
        }
        return codes.size >= 2 ? [...codes] : null;
    }

    private buildStudentGrowthByTeacherRequest(
        campusCode: string,
        teacherId: number,
        filters: ReturnType<DistrictContextService['growthFiltersPayload']>,
        body: CampusGrowthMetricsRequest,
    ): StudentGrowthRecordsByTeacherRequest | null {
        const req: StudentGrowthRecordsByTeacherRequest = {
            districtId: body.districtId,
            academicYearId: body.academicYearId,
            quarterCode: body.quarterCode,
            campusCode,
            teacherId,
        };
        if (filters.grade?.length) {
            req.gradeCode = [...filters.grade];
        }
        if (filters.subject?.length) {
            req.subjectCode = [...filters.subject];
        }
        if (filters.specialEducation != null) {
            req.specialEducation = filters.specialEducation;
        }
        if (filters.economicDisadvantage != null) {
            req.economicDisadvantage = filters.economicDisadvantage;
        }
        if (filters.emergentBilingual != null) {
            req.emergentBilingual = filters.emergentBilingual;
        }
        if (filters.ethnicity != null) {
            req.ethnicity = filters.ethnicity;
        }
        if (filters.testLanguage != null) {
            req.testLanguage = filters.testLanguage;
        }
        return req;
    }


    private buildGrowthRequest(
        campusRouteId: string | null,
        campusCategoryId: number | null,
    ): CampusGrowthMetricsRequest | null {
        const base = this.districtContext.baseGrowthPayload();
        if (!base) {
            return null;
        }
        const filters = this.districtContext.growthFiltersPayload();
        let req: CampusGrowthMetricsRequest = { ...base, ...filters };
        if (campusCategoryId != null) {
            req = { ...req, campusCategoryId };
        } else if (campusRouteId) {
            const campusCode = this.resolveCampusCodeFromRouteParam(campusRouteId);
            if (campusCode) {
                req = { ...req, campusCode };
            }
        } else {
            /**
             * District home — a campus chosen in the search-filters panel scopes the
             * whole dashboard (STAAR / Growth / APP cards + campus chart) in place.
             */
            const filterCampus = this.districtContext.filterCampus();
            if (filterCampus) {
                req = { ...req, campusCode: filterCampus.campusCode };
            }
        }
        return req;
    }

    /** Sorted campus list for “growth ranking” panel on campus-category drill-down. */
    private applyCampusGrowthRanking(campus: CampusGrowthMetricsResponse[] | null | undefined): void {
        if (!this.isCampusCategoryView || !campus?.length) {
            this.campusGrowthRanking = [];
            return;
        }
        this.campusGrowthRanking = [...campus]
            .sort((a, b) => (b.growth ?? -999999) - (a.growth ?? -999999))
            .slice(0, 12)
            .map((r) => ({
                campusName: (r.campusName || r.campusCode || '—').trim(),
                growth: r.growth,
            }));
    }

    /** Component-score ordering with paired component / growth display (CCMR-style layout, growth API data). */
    private applyCampusMetricPairsRanking(campus: CampusGrowthMetricsResponse[] | null | undefined): void {
        if (!this.isCampusCategoryView || !campus?.length) {
            this.campusMetricPairsRanking = [];
            return;
        }
        this.campusMetricPairsRanking = [...campus]
            .sort((a, b) => (b.componentScore ?? -999999) - (a.componentScore ?? -999999))
            .slice(0, 12)
            .map((r) => ({
                campusName: (r.campusName || r.campusCode || '—').trim(),
                componentScore: r.componentScore,
                growth: r.growth,
            }));
    }

    /**
     * District home — POST /api/teachers/top and POST /api/growth/top-classrooms.
     */
    private loadDistrictHomeLeaderboards(until$: Observable<unknown>): void {
        this.districtLeaderboardSub?.unsubscribe();
        const teachersBody = this.buildTopTeachersRequest(null);
        const filterCampus = this.districtContext.filterCampus();
        const classroomsBody = this.buildTopClassroomsRequest(
            filterCampus ? { campusCode: filterCampus.campusCode } : {},
        );
        if (!teachersBody || !classroomsBody) {
            this.districtHomeTopTeachers = [];
            this.districtHomeTopClassrooms = [];
            this.districtLeaderboardsLoading = false;
            return;
        }

        this.districtLeaderboardsLoading = true;
        this.districtLeaderboardsError = null;

        this.districtLeaderboardSub = forkJoin({
            teachers: this.teachersService.getTopTeachers(teachersBody).pipe(
                catchError(() => of([])),
            ),
            classrooms: this.growthAnalytics.getTopClassrooms(classroomsBody).pipe(
                catchError(() => of([] as TeacherGrowthMetricsResponse[])),
            ),
        })
            .pipe(
                takeUntil(until$),
                finalize(() => {
                    this.districtLeaderboardsLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: ({ teachers, classrooms }) => {
                    this.districtHomeTopTeachers = teachers.map((t) => this.mapTopTeacherToDistrictVm(t));
                    this.districtHomeTopClassrooms = this.mapTopClassroomsToVm(classrooms);
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.districtLeaderboardsError = 'Could not load district leaderboards.';
                    this.cdr.markForCheck();
                },
            });
    }

    /**
     * Campus category — POST /api/teachers/top and POST /api/growth/top-classrooms.
     */
    private loadCategoryTopLeaderboards(campusCategoryId: number | null): void {
        this.teacherLeaderboardSub?.unsubscribe();
        const categoryCode = this.resolveCampusCategoryCode(campusCategoryId);
        const teachersBody = this.buildTopTeachersRequest(categoryCode);
        const classroomsBody = this.buildTopClassroomsRequest(
            categoryCode ? { campusCategoryCode: categoryCode } : {},
        );
        if (!teachersBody || !classroomsBody) {
            this.categoryTopTeachers = [];
            this.categoryTopGrowthLeaders = [];
            this.categoryTeachersLoading = false;
            return;
        }

        this.categoryTeachersLoading = true;
        this.categoryTeacherMetricsError = null;

        this.teacherLeaderboardSub = forkJoin({
            teachers: this.teachersService.getTopTeachers(teachersBody).pipe(
                catchError(() => of([])),
            ),
            classrooms: this.growthAnalytics.getTopClassrooms(classroomsBody).pipe(
                catchError(() => of([] as TeacherGrowthMetricsResponse[])),
            ),
        })
            .pipe(takeUntil(this.destroy$))
            .subscribe({
                next: ({ teachers, classrooms }) => {
                    this.categoryTopTeachers = teachers.map((t) => this.mapTopTeacherToCategoryVm(t));
                    this.categoryTopGrowthLeaders = this.mapTopClassroomsToCategoryVm(classrooms);
                    this.categoryTeachersLoading = false;
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.categoryTeachersLoading = false;
                    this.categoryTeacherMetricsError =
                        this.categoryTeacherMetricsError ?? 'Could not load teacher leaderboards.';
                    this.cdr.markForCheck();
                },
            });
    }

    private loadCampusClassroomLeaderboard(
        campusCode: string,
        body: CampusGrowthMetricsRequest,
        until$: Observable<unknown>,
    ): void {
        this.campusClassroomsSub?.unsubscribe();
        const req = this.buildTopClassroomsRequest({ campusCode });
        if (!req) {
            this.campusTopClassrooms = [];
            return;
        }

        this.campusClassroomsSub = this.growthAnalytics
            .getTopClassrooms(req)
            .pipe(
                takeUntil(until$),
                catchError(() => of([] as TeacherGrowthMetricsResponse[])),
            )
            .subscribe((rows) => {
                this.campusTopClassrooms = rows.map((r) => ({
                    instructorName: [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || '—',
                    gradeLabel: this.topClassroomGradeLabel(r),
                    growth: r.growth ?? null,
                }));
                this.cdr.markForCheck();
            });
    }

    private buildTopTeachersRequest(campusCategoryCode: string | null): TopTeachersRequest | null {
        const base = this.districtContext.baseGrowthPayload();
        if (!base) {
            return null;
        }
        const req: TopTeachersRequest = {
            districtId: base.districtId,
            academicYearId: base.academicYearId,
            top: 5,
        };
        if (campusCategoryCode) {
            req.campusCategoryCode = campusCategoryCode;
        }
        const f = this.districtContext.growthFiltersPayload();
        if (f.grade?.length) {
            req.gradeCode = [...f.grade];
        }
        if (f.subject?.length) {
            req.subjectCode = [...f.subject];
        }
        return req;
    }

    private buildTopClassroomsRequest(scope: {
        campusCategoryCode?: string;
        campusCode?: string;
    }): TopClassroomsRequest | null {
        const base = this.districtContext.baseGrowthPayload();
        if (!base) {
            return null;
        }
        const f = this.districtContext.growthFiltersPayload();
        const req: TopClassroomsRequest = {
            districtId: base.districtId,
            academicYearId: base.academicYearId,
            quarterCode: base.quarterCode,
            top: 5,
        };
        if (f.specialEducation != null) {
            req.specialEducation = f.specialEducation;
        }
        if (f.economicDisadvantage != null) {
            req.economicDisadvantage = f.economicDisadvantage;
        }
        if (f.emergentBilingual != null) {
            req.emergentBilingual = f.emergentBilingual;
        }
        if (f.ethnicity != null) {
            req.ethnicity = f.ethnicity;
        }
        if (f.testLanguage != null) {
            req.testLanguage = f.testLanguage;
        }
        if (f.grade?.length) {
            req.gradeCode = [...f.grade];
        }
        if (f.subject?.length) {
            req.subjectCode = [...f.subject];
        }
        if (scope.campusCategoryCode) {
            req.campusCategoryCode = scope.campusCategoryCode;
        }
        if (scope.campusCode) {
            req.campusCode = scope.campusCode;
        }
        return req;
    }

    private buildTopStudentsRequest(campusCode: string): TopStudentsRequest | null {
        const base = this.districtContext.baseGrowthPayload();
        if (!base) {
            return null;
        }
        const f = this.districtContext.growthFiltersPayload();
        const req: TopStudentsRequest = {
            districtId: base.districtId,
            academicYearId: base.academicYearId,
            quarterCode: base.quarterCode,
            campusCode,
            top: 5,
        };
        if (f.specialEducation != null) {
            req.specialEducation = f.specialEducation;
        }
        if (f.economicDisadvantage != null) {
            req.economicDisadvantage = f.economicDisadvantage;
        }
        if (f.emergentBilingual != null) {
            req.emergentBilingual = f.emergentBilingual;
        }
        if (f.ethnicity != null) {
            req.ethnicity = f.ethnicity;
        }
        if (f.testLanguage != null) {
            req.testLanguage = f.testLanguage;
        }
        if (f.grade?.length) {
            req.gradeCode = [...f.grade];
        }
        if (f.subject?.length) {
            req.subjectCode = [...f.subject];
        }
        return req;
    }

    private resolveCampusCategoryCode(campusCategoryId: number | null): string | null {
        if (campusCategoryId == null) {
            return null;
        }
        const cat = this.districtContext.campusCategories.find(
            (c) => c.campusCategoryId === campusCategoryId,
        );
        return cat?.categoryCode?.trim() || null;
    }

    private mapTopClassroomsToVm(rows: TeacherGrowthMetricsResponse[]): DistrictTopClassroomVm[] {
        return rows.map((r) => ({
            instructorName: [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || '—',
            gradeLabel: this.topClassroomGradeLabel(r),
            growth: r.growth ?? null,
        }));
    }

    private mapTopClassroomsToCategoryVm(rows: TeacherGrowthMetricsResponse[]): CategoryGrowthLeaderVm[] {
        return rows.map((r) => ({
            campusName: '—',
            instructorName: [r.firstName, r.lastName].filter(Boolean).join(' ').trim() || '—',
            growth: r.growth ?? 0,
            gradeLabel: this.topClassroomGradeLabel(r),
        }));
    }

    private topClassroomGradeLabel(row: TeacherGrowthMetricsResponse): string {
        const grade = row.grade?.trim();
        return grade || '—';
    }

    private mapTopTeacherToDistrictVm(t: TopTeacherItemDto): DistrictTopTeacherVm {
        return {
            rank: t.rank,
            name: this.topTeacherDisplayName(t),
            subjectLabel: this.topTeacherSubjectLabel(t),
            summativeScore: t.summativeScore ?? null,
        };
    }

    private mapTopTeacherToCategoryVm(t: TopTeacherItemDto): CategoryTeacherLeaderVm {
        return {
            teacherId: t.teacherId ?? 0,
            name: this.topTeacherDisplayName(t),
            subjectLabel: this.topTeacherSubjectLabel(t),
            componentScore: t.summativeScore ?? 0,
            growth: 0,
        };
    }

    private topTeacherDisplayName(t: TopTeacherItemDto): string {
        return (
            t.teacherName?.trim() ||
            [t.firstName, t.lastName].filter(Boolean).join(' ').trim() ||
            '—'
        );
    }

    private topTeacherSubjectLabel(t: TopTeacherItemDto): string {
        const subject = t.subject?.trim();
        return subject || '—';
    }

    private resolveGradeCodeForStudentApi(): string {
        const fromFilter = this.districtContext.growthFilters.grades[0];
        if (fromFilter) {
            return fromFilter;
        }
        return this.districtContext.grades[0]?.gradeCode ?? '';
    }

    private resolveSubjectCodeForStudentApi(): string {
        const fromFilter = this.districtContext.growthFilters.subjects[0];
        if (fromFilter) {
            return fromFilter;
        }
        return this.districtContext.subjects[0]?.subjectCode ?? '';
    }

    private loadCampusStudentLeaderboard(
        campusCode: string,
        _body: CampusGrowthMetricsRequest,
        until$: Observable<unknown>,
    ): void {
        this.campusStudentLeaderboardSub?.unsubscribe();
        const req = this.buildTopStudentsRequest(campusCode);
        if (!req) {
            this.campusTopStudents = [];
            this.campusStudentsLoading = false;
            this.campusStudentsError = null;
            return;
        }

        this.campusStudentsLoading = true;
        this.campusStudentsError = null;
        this.campusStudentLeaderboardSub = this.growthAnalytics
            .getTopStudents(req)
            .pipe(
                takeUntil(until$),
                catchError(() => {
                    this.campusStudentsError = 'Could not load top students.';
                    return of(null);
                }),
                finalize(() => {
                    this.campusStudentsLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe((rows) => {
                if (!rows?.length) {
                    this.campusTopStudents = [];
                    return;
                }
                this.campusTopStudents = rows.map((r) => ({
                    studentName: r.studentName?.trim() || '—',
                    grade: r.grade ?? undefined,
                    componentScore: r.componentScore ?? null,
                    growth: r.growth ?? null,
                }));
                this.cdr.markForCheck();
            });
    }

    /** Match route segment (slug or code) to loaded campuses for optional `campusCode` on the API. */
    private resolveCampusCodeFromRouteParam(routeId: string): string | undefined {
        const list = this.districtContext.campuses;
        if (!list?.length) {
            return undefined;
        }
        const id = routeId.toLowerCase();
        const byCode = list.find((c) => c.campusCode.toLowerCase() === id);
        if (byCode) {
            return byCode.campusCode;
        }
        const dashed = id.replace(/-/g, ' ');
        const byName = list.find(
            (c) =>
                c.campusName.toLowerCase() === dashed ||
                c.campusName.toLowerCase().replace(/[^a-z0-9]+/g, '-') === id,
        );
        return byName?.campusCode;
    }

    /** Slug for `/dashboard/campus/:id` — matches sidebar `campusRouteSlug`. */
    private campusRouteSlugForCode(campusCode: string, campusName?: string): string {
        const list = this.districtContext.campuses;
        const match = list?.find((c) => c.campusCode.toLowerCase() === campusCode.toLowerCase());
        const label = match?.campusName?.trim() || campusName?.trim() || match?.campusCode || campusCode;
        return label
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    private navigateToCampusFromChart(dataPointIndex: number): void {
        const payload = this.lastCampusChartPayload;
        const idx = dataPointIndex - this.chartBarLeftPad;
        if (!payload || payload.isTeacherChart || payload.isStudentChart || idx < 0) {
            return;
        }
        const code = payload.campusCodes[idx];
        const name = payload.campusNames[idx];
        if (!code && !name) {
            return;
        }
        const slug = code
            ? this.campusRouteSlugForCode(code, name)
            : (name ?? '')
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, '-')
                  .replace(/^-+|-+$/g, '');
        if (!slug) {
            return;
        }
        void this.router.navigate(['/dashboard/campus', slug]);
    }

    private navigateToTeacherFromChart(dataPointIndex: number): void {
        const payload = this.lastCampusChartPayload;
        const idx = dataPointIndex - this.chartBarLeftPad;
        if (!payload?.isTeacherChart || idx < 0 || !this.campusId) {
            return;
        }
        const teacherId = payload.teacherIds?.[idx];
        if (!teacherId) {
            return;
        }
        const teacherName = payload.campusNames[idx]?.trim();
        if (teacherName) {
            this.cacheTeacherDisplayName(this.campusId, teacherId, teacherName);
        }
        void this.router.navigate(['/dashboard/campus', this.campusId, 'teacher', teacherId], {
            state: teacherName ? { teacherName } : undefined,
        });
    }

    private teacherNameCacheKey(campusRouteId: string, teacherId: number): string {
        return `growth-teacher-name:${campusRouteId}:${teacherId}`;
    }

    private cacheTeacherDisplayName(
        campusRouteId: string | null,
        teacherId: number,
        teacherName: string,
    ): void {
        if (!campusRouteId || !teacherName.trim()) {
            return;
        }
        try {
            sessionStorage.setItem(
                this.teacherNameCacheKey(campusRouteId, teacherId),
                teacherName.trim(),
            );
        } catch {
            /* ignore quota */
        }
    }

    private resolveTeacherNameFromNavigation(teacherId: number): string {
        const fromState = history.state?.['teacherName'];
        if (typeof fromState === 'string' && fromState.trim()) {
            return fromState.trim();
        }
        if (this.campusId) {
            try {
                const cached = sessionStorage.getItem(
                    this.teacherNameCacheKey(this.campusId, teacherId),
                );
                if (cached?.trim()) {
                    return cached.trim();
                }
            } catch {
                /* ignore */
            }
        }
        return 'Classroom';
    }

    /** Maps API `data` to KPI cards: cs → component score, growth, app/meet/master. */
    private applyOverallMetrics(m: GrowthOverallMetricsResponse): void {
        const fmt = (n: number): string =>
            Number.isFinite(n) ? Number(n).toFixed(1) : '—';
        this.mockComponentScore = fmt(m.cs);
        this.mockGrowth = fmt(m.growth);
        this.mockApp = fmt(m.app);
        this.mockMeet = fmt(m.meet);
        this.mockMaster = fmt(m.master);
        this.overallCsGrade = m.csGrade?.trim() || null;
        this.overallGrowthGrade = m.growthGrade?.trim() || null;
        this.gradesByCategory = this.sortGradesByCategory(
            this.filterGradesByCategoryForRole(m.gradesByCategory ?? []),
        );
        this.syncMetricBarWidthsFromMocks();
        this.rebuildScoreDonuts();
    }

    /** Level / band colors shared by the score-strip donuts and legends. */
    private readonly scoreDonutColors: Record<string, string> = {
        ES: '#3b82f6',
        MS: '#8b5cf6',
        HS: '#14b8a6',
        APP: '#2563eb',
        MEET: '#b91c1c',
        MASTER: '#fb923c',
    };

    /** Build the score-strip donuts from the levels already mapped to the cards (called once per metrics refresh). */
    private rebuildScoreDonuts(): void {
        this.conceptCsDonut = this.buildLevelDonut('cs');
        this.conceptGrowthDonut = this.buildLevelDonut('growth');
        this.conceptBandsDonut = this.buildBandsDonut();
    }

    /** Donut segments are the levels that have a score; missing levels are excluded (legend shows '—'). */
    private buildLevelDonut(key: 'cs' | 'growth'): any | null {
        const rows = this.levelRings(key).filter((r) => r.score != null);
        if (!rows.length) {
            return null;
        }
        const colors = rows.map((r) => this.scoreDonutColors[r.label] ?? '#64748b');
        const sliceIndex = new Map<string, number>();
        rows.forEach((r, i) => sliceIndex.set(r.label, i));
        if (key === 'cs') {
            this.conceptCsSliceIndex = sliceIndex;
        } else {
            this.conceptGrowthSliceIndex = sliceIndex;
        }
        return {
            series: rows.map((r) => Number(r.score)),
            labels: rows.map((r) => r.label),
            chart: {
                type: 'donut',
                height: 165,
                fontFamily: 'inherit',
                animations: { enabled: true, speed: 600 },
            },
            colors,
            stroke: { width: 2, colors: ['#ffffff'] },
            dataLabels: { enabled: false },
            legend: { show: false },
            states: { active: { filter: { type: 'darken', value: 0.6 } }, hover: { filter: { type: 'darken', value: 0.72 } } },
            plotOptions: {
                pie: {
                    donut: { size: '68%' },
                },
            },
            tooltip: {
                y: {
                    formatter: (val: number, opts: { seriesIndex: number }) =>
                        `${Number(val).toFixed(1)}% · Grade ${rows[opts.seriesIndex]?.grade ?? '—'}`,
                },
            },
        };
    }

    /** APP/MEET/MASTER donut — one slice per level with the same colors as the bars. */
    private buildBandsDonut(): any | null {
        const raw = [
            { label: 'APP', value: this.gaugeNumber(this.mockApp) },
            { label: 'MEET', value: this.gaugeNumber(this.mockMeet) },
            { label: 'MASTER', value: this.gaugeNumber(this.mockMaster) },
        ].filter((r) => r.value != null);
        if (!raw.length) {
            return null;
        }
        const sliceIndex = new Map<string, number>();
        raw.forEach((r, i) => sliceIndex.set(r.label, i));
        this.conceptBandsSliceIndex = sliceIndex;
        return {
            series: raw.map((r) => Number(r.value)),
            labels: raw.map((r) => r.label),
            chart: {
                type: 'donut',
                height: 165,
                fontFamily: 'inherit',
                animations: { enabled: true, speed: 600 },
            },
            colors: raw.map((r) => this.scoreDonutColors[r.label]),
            stroke: { width: 2, colors: ['#ffffff'] },
            dataLabels: { enabled: false },
            legend: { show: false },
            states: { active: { filter: { type: 'darken', value: 0.6 } }, hover: { filter: { type: 'darken', value: 0.72 } } },
            plotOptions: {
                pie: {
                    donut: { size: '68%' },
                },
            },
            tooltip: {
                y: {
                    formatter: (val: number) => `${Number(val).toFixed(1)}%`,
                },
            },
        };
    }

    /** Donut hover wiring: stores the hovered row + slice index; the template renders data-hl for CSS highlighting. */
    onScoreLegendEnter(key: 'cs' | 'growth' | 'bands', label: string): void {
        this.hoveredRow = `${key}:${label}`;
        this.hoveredSliceIndex[key] = this.sliceIndexFor(key, label) ?? undefined;
        this.cdr.markForCheck();
    }

    /** Legend row leave → clear the hovered row and slice highlight. */
    onScoreLegendLeave(key: 'cs' | 'growth' | 'bands'): void {
        this.hoveredRow = null;
        this.hoveredSliceIndex[key] = undefined;
        this.cdr.markForCheck();
    }

    /** Slice index of a level inside a chart key's series (missing levels are absent). */
    private sliceIndexFor(key: 'cs' | 'growth' | 'bands', label: string): number | null {
        const map = key === 'cs' ? this.conceptCsSliceIndex : key === 'growth' ? this.conceptGrowthSliceIndex : this.conceptBandsSliceIndex;
        const idx = map.get(label);
        return idx == null ? null : idx;
    }

    /** Legend row highlight class — purple tint used across the portal for active/selected rows. */
    isScoreLegendRowHovered(key: 'cs' | 'growth' | 'bands', label: string): boolean {
        return this.hoveredRow === `${key}:${label}`;
    }

    /** Legend dot/bar color for a level label (ES/MS/HS, APP/MEET/MASTER). */
    scoreLevelColor(label: string): string {
        return this.scoreDonutColors[label] ?? '#64748b';
    }

    /** Score text for legend rows; '—' when the level has no data. */
    scoreLevelText(score: number | null | undefined): string {
        return score == null || !Number.isFinite(Number(score)) ? '—' : `${Number(score).toFixed(1)}%`;
    }

    /* ================= Concept dashboard loaders ================= */

    /** Mini calendar for the current month (real dates, today highlighted). */
    private ensureConceptCalendar(): void {
        const now = new Date();
        const first = new Date(now.getFullYear(), now.getMonth(), 1);
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const lead = first.getDay(); // 0 = Sunday
        const cells: Array<{ day: number | null; isToday: boolean }> = [];
        for (let i = 0; i < lead; i++) {
            cells.push({ day: null, isToday: false });
        }
        for (let d = 1; d <= daysInMonth; d++) {
            cells.push({ day: d, isToday: d === now.getDate() });
        }
        while (cells.length % 7 !== 0) {
            cells.push({ day: null, isToday: false });
        }
        this.conceptCalendarWeeks = [];
        for (let i = 0; i < cells.length; i += 7) {
            this.conceptCalendarWeeks.push(cells.slice(i, i + 7));
        }
    }

    /** Initials for the campus chips in the right card. */
    campusInitials(name: string): string {
        const clean = (name || '').trim();
        if (!clean) {
            return '?';
        }
        const parts = clean.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return clean.slice(0, 2).toUpperCase();
    }

    /** District name for the right card (from loaded reference data). */
    get conceptDistrictName(): string {
        const id = this.districtContext.selection.districtId;
        const match = this.districtContext.districts?.find((d) => d.districtId === id);
        return match?.districtName || '—';
    }

    /** Real assessment periods (quarterName + date range) for the right card. */
    get conceptPeriods(): DistrictQuarter[] {
        return this.districtContext.districtQuarters || [];
    }

    /** Campus chips for the right card (first 6 real campuses). */
    get conceptCampusChips(): string[] {
        return (this.districtContext.campuses || [])
            .slice(0, 6)
            .map((c) => c.campusName || c.campusCode);
    }

    get conceptCampusChipExtra(): number {
        const list = this.districtContext.campuses || [];
        return Math.max(0, list.length - 6);
    }

    /** Academic year label for the right card (e.g. 2024-2025). */
    get conceptAcademicYearLabel(): string {
        const id = this.districtContext.selection.academicYearId;
        const match = this.districtContext.academicYears?.find((y) => y.academicYearId === id);
        return match?.yearLabel || '—';
    }

    /**
     * Developing campuses caption — real selection counts, uppercase micro-label style.
     * "— CAMPUSES" while loading; "NO DEVELOPING CAMPUSES" when zero; else "X OF Y CAMPUSES".
     */
    get developingCaptionLabel(): string {
        if (this.developingCampusesLoading) {
            return 'Loading…';
        }
        if (this.developingCampusesCount === 0) {
            return 'NO DEVELOPING CAMPUSES';
        }
        return `${this.developingCampusesCount} of ${this.developingCampusesTotal} campuses`;
    }

    /** Progressing campuses caption — same format as the Developing card. */
    get progressingCaptionLabel(): string {
        if (this.progressingCampusesLoading) {
            return 'Loading…';
        }
        if (this.progressingCampusesCount === 0) {
            return 'NO PROGRESSING CAMPUSES';
        }
        return `${this.progressingCampusesCount} of ${this.progressingCampusesTotal} campuses`;
    }

    /** The currently selected quarter code (to highlight the active period row). */
    get conceptActiveQuarterCode(): string | null {
        return this.districtContext.selection.quarterCode;
    }

    private filterCampusMetricsForRole(
        rows: CampusGrowthMetricsResponse[] | null | undefined,
    ): CampusGrowthMetricsResponse[] {
        if (!rows?.length) {
            return [];
        }
        const campusId = this.auth.scopedCampusId();
        if (!this.auth.isPrincipalRole() || campusId == null) {
            return rows;
        }
        return rows.filter((r) => r.campusId === campusId);
    }

    private filterCategoryMetricsForRole(
        rows: CampusCategoryGrowthMetricsResponse[],
    ): CampusCategoryGrowthMetricsResponse[] {
        if (!rows.length) {
            return rows;
        }
        const scope = this.districtContext.roleScopePayload();
        const categoryId = scope.campusCategoryId;
        if (!this.auth.isPrincipalRole() || categoryId == null) {
            return rows;
        }
        return rows.filter((r) => r.campusCategoryId === categoryId);
    }

    private filterGradesByCategoryForRole(
        rows: GrowthOverallGradeByCategory[],
    ): GrowthOverallGradeByCategory[] {
        if (!rows.length) {
            return rows;
        }
        const scope = this.districtContext.roleScopePayload();
        const categoryId = scope.campusCategoryId;
        if (!this.auth.isPrincipalRole() || categoryId == null) {
            return rows;
        }
        return rows.filter((r) => r.campusCategoryId === categoryId);
    }

    private clearOverallMetricsDisplay(): void {
        this.mockComponentScore = '—';
        this.mockGrowth = '—';
        this.mockApp = '—';
        this.mockMeet = '—';
        this.mockMaster = '—';
        this.overallCsGrade = null;
        this.overallGrowthGrade = null;
        this.gradesByCategory = [];
        this.conceptCsDonut = null;
        this.conceptGrowthDonut = null;
        this.conceptBandsDonut = null;
        this.conceptCsSliceIndex.clear();
        this.conceptGrowthSliceIndex.clear();
        this.conceptBandsSliceIndex.clear();
        this.hoveredSliceIndex = { cs: undefined, growth: undefined, bands: undefined };
        this.hoveredRow = null;
        this.syncMetricBarWidthsFromMocks();
    }

    /**
     * Reset every concept-dashboard panel (score strip donuts, Campus Ranked rows).
     * Called when the growth context becomes incomplete (e.g. a state
     * with no districts was selected) so stale data from the previous scope can never
     * stay on screen — empty selection means honest dashes, never old numbers.
     */
    private clearConceptDashboardState(): void {
        this.conceptCsDonut = null;
        this.conceptGrowthDonut = null;
        this.conceptBandsDonut = null;
        this.conceptCsSliceIndex.clear();
        this.conceptGrowthSliceIndex.clear();
        this.conceptBandsSliceIndex.clear();
        this.hoveredSliceIndex = { cs: undefined, growth: undefined, bands: undefined };
        this.hoveredRow = null;
        this.districtCampusGrowthRanking = [];
        this.ccmrAcademyRanking = [];
    }

    private sortGradesByCategory(
        rows: GrowthOverallGradeByCategory[],
    ): GrowthOverallGradeByCategory[] {
        const order: Record<string, number> = { ES: 0, ELEM: 0, MS: 1, MID: 1, HS: 2 };
        return [...rows].sort((a, b) => {
            const ao = order[a.categoryCode?.toUpperCase() ?? ''] ?? 50;
            const bo = order[b.categoryCode?.toUpperCase() ?? ''] ?? 50;
            if (ao !== bo) {
                return ao - bo;
            }
            return (a.categoryName || '').localeCompare(b.categoryName || '', undefined, {
                sensitivity: 'base',
            });
        });
    }

    /** Letter-grade color for KPI / schools-summary displays. */
    gradeLetterClass(grade: string | null | undefined): string {
        const g = (grade ?? '').trim().toUpperCase();
        if (g === 'A') {
            return 'text-emerald-600 dark:text-emerald-400';
        }
        if (g === 'B') {
            return 'text-sky-600 dark:text-sky-400';
        }
        if (g === 'C') {
            return 'text-amber-600 dark:text-amber-400';
        }
        if (g === 'D') {
            return 'text-orange-600 dark:text-orange-400';
        }
        if (g === 'F' || g === 'N') {
            return 'text-red-600 dark:text-red-400';
        }
        return 'text-slate-400 dark:text-slate-500';
    }

    categoryCsGrade(campusCategoryId: number): string | null {
        return (
            this.gradesByCategory.find((g) => g.campusCategoryId === campusCategoryId)?.csGrade ??
            null
        );
    }

    categoryGrowthGrade(campusCategoryId: number): string | null {
        return (
            this.gradesByCategory.find((g) => g.campusCategoryId === campusCategoryId)
                ?.growthGrade ?? null
        );
    }

    trackGradeByCategory(_index: number, row: GrowthOverallGradeByCategory): number {
        return row.campusCategoryId;
    }

    /**
     * Attendance card KPI — POST /campus-attendance/ada-summary.
     * `averageAdaPct` drives the large ring.
     */
    private applyAttendanceSummary(s: DistrictAttendanceSummaryDto | null): void {
        if (!s) {
            this.mockAttendancePct = '—';
            return;
        }
        const ada = Number(s.averageAdaPct);
        this.mockAttendancePct = Number.isFinite(ada) ? ada.toFixed(1) : '—';
    }

    /** Schools summary card — POST /growth/campus-category-metrics. */
    private applyCategoryMetrics(rows: CampusCategoryGrowthMetricsResponse[]): void {
        const sorted = [...rows].sort((a, b) =>
            (a.campusCategoryName || '').localeCompare(b.campusCategoryName || '', undefined, {
                sensitivity: 'base',
            }),
        );
        this.schoolsCategorySummaryRows = sorted.map((r) => {
            const cs = r.componentScore != null && Number.isFinite(r.componentScore) ? Math.min(100, Math.max(0, r.componentScore)) : null;
            const gr = r.growth != null && Number.isFinite(r.growth) ? Math.min(100, Math.max(0, r.growth)) : null;
            return {
                campusCategoryId: r.campusCategoryId,
                label: (r.campusCategoryName || '—').toUpperCase(),
                componentPct: cs,
                growthPct: gr,
            };
        });
    }

    trackSchoolCategoryRow(_index: number, row: SchoolsCategorySummaryRowVm): number {
        return row.campusCategoryId;
    }

    private formatTeacherDisplayName(t: TeacherGrowthMetricsResponse): string {
        return [t.firstName, t.lastName].filter(Boolean).join(' ').trim() || '—';
    }

    /** Classroom overview grouped bars — POST /growth/campus-teacher-metrics on single-campus drill-down. */
    private applyTeacherMetricsChart(rows: TeacherGrowthMetricsResponse[]): void {
        if (!rows.length) {
            this.clearCampusesOverviewChart();
            return;
        }
        const sorted = [...rows].sort((a, b) => {
            const ln = (t: TeacherGrowthMetricsResponse) => (t.lastName ?? '').trim();
            const fn = (t: TeacherGrowthMetricsResponse) => (t.firstName ?? '').trim();
            const byLast = ln(a).localeCompare(ln(b), undefined, { sensitivity: 'base' });
            if (byLast !== 0) {
                return byLast;
            }
            return fn(a).localeCompare(fn(b), undefined, { sensitivity: 'base' });
        });
        this.lastCampusChartPayload = {
            categories: sorted.map((r) => this.formatTeacherDisplayName(r)),
            componentScores: sorted.map((r) =>
                r.componentScore != null && Number.isFinite(r.componentScore) ? r.componentScore : 0,
            ),
            growthVals: sorted.map((r) =>
                r.growth != null && Number.isFinite(r.growth) ? r.growth : 0,
            ),
            campusNames: sorted.map((r) => this.formatTeacherDisplayName(r)),
            campusCodes: [],
            teacherIds: sorted.map((r) => r.teacherId),
            isTeacherChart: true,
        };
        this.lastChartLayoutKey = '';
        this.renderCampusesOverviewChart();
        queueMicrotask(() => this.attachCampusesChartResizeObserver());
    }

    /** Student overview bars — POST /api/growth/campus-teacher-student-metrics. */
    private applyStudentMetricsChart(rows: TeacherStudentGrowthMetricsResponse[]): void {
        const aggregated = this.aggregateTeacherStudentRows(rows);
        if (!aggregated.length) {
            this.clearCampusesOverviewChart();
            this.teacherTopStudentsByScore = [];
            this.teacherTopStudentsByGrowth = [];
            return;
        }
        const sorted = [...aggregated].sort((a, b) =>
            a.studentName.localeCompare(b.studentName, undefined, { sensitivity: 'base' }),
        );
        this.teacherTopStudentsByScore = [...aggregated]
            .sort((a, b) => b.componentScore - a.componentScore)
            .slice(0, 5);
        this.teacherTopStudentsByGrowth = [...aggregated]
            .sort((a, b) => b.growth - a.growth)
            .slice(0, 5);
        this.lastCampusChartPayload = {
            categories: sorted.map((r) => r.studentName?.trim() || '—'),
            componentScores: sorted.map((r) => r.componentScore),
            growthVals: sorted.map((r) => r.growth),
            campusNames: sorted.map((r) => r.studentName?.trim() || '—'),
            campusCodes: [],
            isStudentChart: true,
        };
        this.lastChartLayoutKey = '';
        this.renderCampusesOverviewChart();
        queueMicrotask(() => this.attachCampusesChartResizeObserver());
    }

    /** One row per student when API returns multiple grade/subject rows for the same name. */
    private aggregateTeacherStudentRows(
        rows: TeacherStudentGrowthMetricsResponse[],
    ): TeacherStudentLeaderVm[] {
        const byStudent = new Map<
            string,
            { studentName: string; sumCs: number; sumGr: number; count: number }
        >();
        for (const row of rows) {
            const studentName = (row.studentName ?? '').trim() || '—';
            const cs = Number(row.componentScore);
            const gr = Number(row.growth);
            if (!Number.isFinite(cs) || !Number.isFinite(gr)) {
                continue;
            }
            const current = byStudent.get(studentName) ?? {
                studentName,
                sumCs: 0,
                sumGr: 0,
                count: 0,
            };
            current.sumCs += cs;
            current.sumGr += gr;
            current.count += 1;
            byStudent.set(studentName, current);
        }
        return [...byStudent.values()].map(({ studentName, sumCs, sumGr, count }) => ({
            studentName,
            componentScore: Number((sumCs / count).toFixed(1)),
            growth: Number((sumGr / count).toFixed(1)),
        }));
    }

    /**
     * Developing campuses card — live aggregate for campuses in the CURRENT selection
     * (district + year + grading window, already loaded as the Campuses Overview rows)
     * whose latest average Component Score is ≤ 63 (the same ≤63 "needs improvement"
     * banding the portal uses elsewhere). Missing scores are never counted.
     * Aggregates: mean of campus averages; grades mirror backend gradeLetter().
     */
    private applyDevelopingCampusStats(rows: CampusGrowthMetricsResponse[] | null | undefined): void {
        const list = Array.isArray(rows) ? rows : [];
        const developing = list.filter(
            (r) => r.componentScore != null && Number.isFinite(r.componentScore) && Number(r.componentScore) <= 63,
        );
        this.developingCampusesTotal = list.length;
        this.developingCampusesCount = developing.length;
        // Same array object => the popup can only ever show these exact campuses.
        this.developingCampusSourceRows = developing;
        const csVals = developing
            .map((r) => Number(r.componentScore))
            .filter((v) => Number.isFinite(v));
        const growthVals = developing
            .map((r) => Number(r.growth))
            .filter((v) => Number.isFinite(v));
        this.developingComponentScoreAvg = csVals.length
            ? csVals.reduce((sum, v) => sum + v, 0) / csVals.length
            : null;
        this.developingGrowthAvg = growthVals.length
            ? growthVals.reduce((sum, v) => sum + v, 0) / growthVals.length
            : null;
        this.developingComponentScoreGrade = this.gradeLetterForScore(this.developingComponentScoreAvg);
        this.developingGrowthGrade = this.gradeLetterForScore(this.developingGrowthAvg);
        this.developingCampusesLoading = false;
    }

    /**
     * Progressing campuses card — exact twin of the Developing card. Same current-selection
     * rows (district + year + grading window as loaded for the Campuses Overview), selected by
     * the portal's existing banding rule `bandOf` in backend/src/routes/analytics.js:
     * ≤ 63 "Needs Improvement", 64–74 "Progressing", > 74 "Proficient".
     * So Progressing = latest average Component Score > 63 and ≤ 74. Missing scores never count.
     */
    private applyProgressingCampusStats(rows: CampusGrowthMetricsResponse[] | null | undefined): void {
        const list = Array.isArray(rows) ? rows : [];
        const progressing = list.filter(
            (r) =>
                r.componentScore != null &&
                Number.isFinite(r.componentScore) &&
                Number(r.componentScore) > 63 &&
                Number(r.componentScore) <= 74,
        );
        this.progressingCampusesTotal = list.length;
        this.progressingCampusesCount = progressing.length;
        // Same array object => the popup can only ever show these exact campuses.
        this.progressingCampusSourceRows = progressing;
        const csVals = progressing
            .map((r) => Number(r.componentScore))
            .filter((v) => Number.isFinite(v));
        const growthVals = progressing
            .map((r) => Number(r.growth))
            .filter((v) => Number.isFinite(v));
        this.progressingComponentScoreAvg = csVals.length
            ? csVals.reduce((sum, v) => sum + v, 0) / csVals.length
            : null;
        this.progressingGrowthAvg = growthVals.length
            ? growthVals.reduce((sum, v) => sum + v, 0) / growthVals.length
            : null;
        this.progressingComponentScoreGrade = this.gradeLetterForScore(this.progressingComponentScoreAvg);
        this.progressingGrowthGrade = this.gradeLetterForScore(this.progressingGrowthAvg);
        this.progressingCampusesLoading = false;
    }

    /** Letter grade mirroring backend `gradeLetter()` in util.js (A ≥ 90, B ≥ 80, C ≥ 70, D ≥ 60, else F). */
    private gradeLetterForScore(n: number | null | undefined): string | null {
        if (n == null) {
            return null;
        }
        const v = Number(n);
        if (!Number.isFinite(v)) {
            return null;
        }
        if (v >= 90) return 'A';
        if (v >= 80) return 'B';
        if (v >= 70) return 'C';
        if (v >= 60) return 'D';
        return 'F';
    }

    /** Campuses overview grouped bars — x-axis uses `campusCode` from POST /growth/campus-metrics. */
    private clearCampusesOverviewChart(): void {
        this.campusesOverviewChart = null;
        this.lastCampusChartPayload = null;
        this.lastChartLayoutKey = '';
        this.chartBarLeftPad = 0;
        this.useCampusesChartHorizontalScroll = false;
        this.campusesOverviewChartScrollWidth = 0;
    }

    private applyCampusMetricsChart(rows: CampusGrowthMetricsResponse[]): void {
        if (!rows.length) {
            this.clearCampusesOverviewChart();
            return;
        }
        const sorted = [...rows].sort((a, b) =>
            (a.campusCode || '').localeCompare(b.campusCode || '', undefined, { sensitivity: 'base' }),
        );
        this.lastCampusChartPayload = {
            categories: sorted.map((r) => r.campusCode || '—'),
            componentScores: sorted.map((r) =>
                r.componentScore != null && Number.isFinite(r.componentScore) ? r.componentScore : 0,
            ),
            growthVals: sorted.map((r) =>
                r.growth != null && Number.isFinite(r.growth) ? r.growth : 0,
            ),
            campusNames: sorted.map((r) => r.campusName?.trim() || r.campusCode || ''),
            campusCodes: sorted.map((r) => r.campusCode || ''),
            isTeacherChart: false,
        };
        this.lastChartLayoutKey = '';
        this.renderCampusesOverviewChart();
        queueMicrotask(() => this.attachCampusesChartResizeObserver());
    }

    /**
     * Fixed bar width + spacing. Full-width chart with centered bars when they fit;
     * horizontal scroll when crowded.
     */
    private computeCampusesChartLayout(n: number, containerWidthPx: number): {
        chartWidth: number | '100%';
        columnWidthPct: number;
        useScroll: boolean;
        scrollWidth: number;
        slotPx: number;
        leftPad: number;
        rightPad: number;
    } {
        const pad = GrowthOverviewPageComponent.CAMPUS_CHART_EDGE_PADDING_PX;
        const slot = GrowthOverviewPageComponent.CAMPUS_SLOT_PX;
        const groupPx = GrowthOverviewPageComponent.CAMPUS_BAR_GROUP_PX;
        const container =
            containerWidthPx > 0
                ? containerWidthPx
                : GrowthOverviewPageComponent.CAMPUS_CHART_DEFAULT_CONTAINER_PX;

        const columnWidthPct = Math.round((groupPx * 100) / slot);
        const naturalWidth = pad + Math.max(n, 1) * slot;

        if (naturalWidth > container) {
            return {
                chartWidth: naturalWidth,
                columnWidthPct,
                useScroll: true,
                scrollWidth: naturalWidth,
                slotPx: slot,
                leftPad: 0,
                rightPad: 0,
            };
        }

        const fitSlots = Math.max(n, Math.floor(Math.max(container - pad, slot) / slot));
        const extra = Math.max(0, fitSlots - n);
        const leftPad = Math.floor(extra / 2);
        const rightPad = extra - leftPad;

        return {
            chartWidth: '100%',
            columnWidthPct,
            useScroll: false,
            scrollWidth: 0,
            slotPx: slot,
            leftPad,
            rightPad,
        };
    }

    private chartLabelMaxChars(slotPx: number): number {
        return Math.max(6, Math.floor(slotPx / GrowthOverviewPageComponent.CHART_LABEL_CHAR_PX) - 1);
    }

    private truncateChartLabel(text: string, maxChars: number): string {
        const label = String(text ?? '').trim();
        if (label.length <= maxChars) {
            return label;
        }
        return `${label.slice(0, Math.max(1, maxChars - 3)).trimEnd()}...`;
    }

    private attachCampusesChartResizeObserver(): void {
        const el = this.campusesChartContainer?.nativeElement;
        if (!el || !this.lastCampusChartPayload) {
            return;
        }

        this.chartResizeObserver?.disconnect();
        this.chartResizeObserver = new ResizeObserver((entries) => {
            const w = Math.round(entries[0]?.contentRect.width ?? 0);
            if (w > 0 && Math.abs(w - this.chartContainerWidthPx) >= 16) {
                this.chartContainerWidthPx = w;
                this.renderCampusesOverviewChart();
            }
        });
        this.chartResizeObserver.observe(el);

        const initialW = Math.round(el.getBoundingClientRect().width);
        if (initialW > 0 && initialW !== this.chartContainerWidthPx) {
            this.chartContainerWidthPx = initialW;
            this.renderCampusesOverviewChart();
        }
    }

    private renderCampusesOverviewChart(): void {
        const payload = this.lastCampusChartPayload;
        if (!payload) {
            return;
        }
        const isTeacherChart = !!payload.isTeacherChart;
        const isStudentChart = !!payload.isStudentChart;
        const n = payload.categories.length;
        const layout = this.computeCampusesChartLayout(n, this.chartContainerWidthPx);
        const layoutKey = `${this.chartContainerWidthPx}|${n}|${layout.useScroll}|${layout.leftPad}|${layout.rightPad}|${layout.columnWidthPct}|${isTeacherChart ? 1 : 0}|${isStudentChart ? 1 : 0}`;
        if (layoutKey === this.lastChartLayoutKey && this.campusesOverviewChart) {
            return;
        }
        this.lastChartLayoutKey = layoutKey;
        this.useCampusesChartHorizontalScroll = layout.useScroll;
        this.campusesOverviewChartScrollWidth = layout.scrollWidth;
        this.chartBarLeftPad = layout.leftPad;

        const blankCats = (count: number) => Array.from({ length: count }, () => '');
        const blankVals = (count: number) =>
            Array.from({ length: count }, () => null as number | null);
        const categories = [
            ...blankCats(layout.leftPad),
            ...payload.categories,
            ...blankCats(layout.rightPad),
        ];
        const componentScores: Array<number | null> = [
            ...blankVals(layout.leftPad),
            ...payload.componentScores,
            ...blankVals(layout.rightPad),
        ];
        const growthVals: Array<number | null> = [
            ...blankVals(layout.leftPad),
            ...payload.growthVals,
            ...blankVals(layout.rightPad),
        ];
        const campusNames = [
            ...blankCats(layout.leftPad),
            ...payload.campusNames,
            ...blankCats(layout.rightPad),
        ];

        this.campusesOverviewChart = this.buildCampusesOverviewChartConfig(
            categories,
            componentScores,
            growthVals,
            campusNames,
            layout,
            isTeacherChart,
            isStudentChart,
        );
        this.cdr.markForCheck();
        // Overlay per-series "chip" pill backgrounds behind the percentage data labels.
        // Runs after Apex has drawn (and animated) the bars; striped pairs only last into the next redraw.
        setTimeout(() => this.decorateCampusesChartChips(), 450);
    }

    /**
     * Insert a rounded rect (light teal / light orange tint, matching the series color)
     * directly behind each `.apexcharts-datalabel` text — Apex can't do per-series
     * label backgrounds, so the chips are drawn here as plain SVG siblings.
     */
    private decorateCampusesChartChips(): void {
        const host = this.campusesChartContainer?.nativeElement;
        if (!host) {
            return;
        }
        const svg = host.querySelector('svg');
        if (!svg) {
            return;
        }
        svg.querySelectorAll('.campus-chip').forEach((el) => el.remove());
        const NS = 'http://www.w3.org/2000/svg';
        const labels = Array.from(svg.querySelectorAll<SVGTextElement>('.apexcharts-datalabel'));
        for (const text of labels) {
            const fill = (text.getAttribute('fill') || '').toLowerCase();
            const isStaar = fill.includes('1f6e63') || fill.includes('2a9d8f') || fill.includes('5fc4b6') || fill.includes('178377');
            const isGrowth = fill.includes('c14a24') || fill.includes('d2542f') || fill.includes('e76f51');
            if (!isStaar && !isGrowth) {
                continue;
            }
            const bbox = text.getBBox();
            if (!bbox.width || !bbox.height) {
                continue;
            }
            const rect = document.createElementNS(NS, 'rect');
            const padX = 7;
            const padY = 3;
            rect.setAttribute('class', 'campus-chip');
            rect.setAttribute('x', (bbox.x - padX).toFixed(2));
            rect.setAttribute('y', (bbox.y - padY).toFixed(2));
            rect.setAttribute('width', (bbox.width + padX * 2).toFixed(2));
            rect.setAttribute('height', (bbox.height + padY * 2).toFixed(2));
            rect.setAttribute('rx', '999');
            rect.setAttribute('fill', isStaar ? '#E8F5F1' : '#FDECE2');
            const parent = text.parentNode;
            if (parent) {
                parent.insertBefore(rect, text);
            }
        }
    }

    /** Apex grouped bar chart shared by initial demo data and API-driven campus metrics. */
    private buildCampusesOverviewChartConfig(
        categories: string[],
        componentScores: Array<number | null>,
        growthVals: Array<number | null>,
        campusTooltipNames: string[],
        layout: {
            chartWidth: number | '100%';
            columnWidthPct: number;
            slotPx: number;
        },
        isTeacherChart = false,
        isStudentChart = false,
    ): any {
        const categoriesSafe = categories.map((c) => (c == null ? '' : String(c).trim()));
        const namesSafe =
            campusTooltipNames.length === categories.length
                ? campusTooltipNames.map((n, i) =>
                      n == null ? categoriesSafe[i] : String(n).trim() || categoriesSafe[i],
                  )
                : categoriesSafe.map((c, i) => {
                      const n = campusTooltipNames[i];
                      return n == null ? c : String(n).trim() || c;
                  });
        const chartFont = GrowthOverviewPageComponent.CHART_FONT;
        const nameLabelMaxChars = this.chartLabelMaxChars(layout.slotPx);
        const useNameLabels = isTeacherChart || isStudentChart;

        const component = this;

        return {
            chart: {
                type: 'bar',
                toolbar: { show: false },
                width: layout.chartWidth,
                height: 360,
                fontFamily: chartFont,
                parentHeightOffset: 0,
                offsetX: 0,
                offsetY: 0,
                animations: {
                    enabled: true,
                    speed: 600,
                    easing: 'easeOutCubic',
                },
                events: isTeacherChart
                    ? {
                          click: (
                              _event: MouseEvent,
                              _chartContext: unknown,
                              config: { dataPointIndex?: number },
                          ) => {
                              const idx = config?.dataPointIndex;
                              if (idx != null && idx >= 0) {
                                  component.navigateToTeacherFromChart(idx);
                              }
                          },
                      }
                    : isStudentChart
                      ? {}
                      : {
                            click: (
                                _event: MouseEvent,
                                _chartContext: unknown,
                                config: { dataPointIndex?: number },
                            ) => {
                                const idx = config?.dataPointIndex;
                                if (idx != null && idx >= 0) {
                                    component.navigateToCampusFromChart(idx);
                                }
                            },
                        },
            },
            colors: ['#5FC4B6', '#F4A261'],
            fill: {
                type: 'gradient',
                gradient: {
                    type: 'vertical',
                    shade: 'light',
                    gradientToColors: ['#1F6E63', '#C14A24'],
                    inverseColors: false,
                    opacityFrom: 1,
                    opacityTo: 0.92,
                    stops: [0, 100],
                },
            },
            dataLabels: {
                enabled: true,
                formatter: function (val: number) {
                    if (val == null || !Number.isFinite(Number(val))) {
                        return '';
                    }
                    return `${Number(val)}%`;
                },
                offsetY: -22,
                style: {
                    fontSize: '11px',
                    fontWeight: 800,
                    fontFamily: chartFont,
                    colors: ['#1F6E63', '#C14A24'],
                },
            },
            plotOptions: {
                bar: {
                    horizontal: false,
                    columnWidth: `${layout.columnWidthPct}%`,
                    borderRadius: 8,
                    borderRadiusApplication: 'end',
                    dataLabels: { position: 'top' },
                },
            },
            stroke: {
                show: false,
            },
            states: {
                hover: {
                    filter: { type: 'lighten', value: 0.18 },
                },
            },
            grid: {
                strokeDashArray: 4,
                xaxis: { lines: { show: false } },
                yaxis: { lines: { show: true, opacity: 0.7 } },
                padding: {
                    top: 18,
                    right: 14,
                    bottom: 4,
                    left: 14,
                },
            },
            series: [
                { name: 'STAAR Component Score', data: componentScores },
                { name: 'Growth', data: growthVals },
            ],
            xaxis: {
                categories: categoriesSafe,
                axisBorder: { show: false },
                axisTicks: { show: false },
                tooltip: { enabled: false },
                labels: useNameLabels
                    ? {
                          rotate: 0,
                          rotateAlways: false,
                          hideOverlappingLabels: false,
                          trim: false,
                          formatter: (value: string) =>
                              value
                                  ? this.truncateChartLabel(value, nameLabelMaxChars)
                                  : '',
                          style: {
                              fontSize: '10px',
                              fontWeight: 500,
                              fontFamily: chartFont,
                              colors: '#94a3b8',
                          },
                      }
                    : {
                          rotate: 0,
                          rotateAlways: false,
                          hideOverlappingLabels: false,
                          trim: false,
                          formatter: (value: string) => value || '',
                          style: { fontSize: '11px', fontWeight: 500, colors: '#94a3b8' },
                      },
            },
            yaxis: {
                title: { text: '' },
                min: 0,
                max: 100,
                tickAmount: 5,
                labels: {
                    formatter: (value: number) => Math.round(value).toString(),
                    style: { fontSize: '10px', fontWeight: 500, colors: '#a8b3c4' },
                },
            },
            tooltip: {
                shared: true,
                intersect: false,
                followCursor: true,
                x: { show: false },
                marker: { show: false },
                custom: (opts: any) => {
                    const i = opts?.dataPointIndex;
                    if (i == null || i < 0 || i >= categoriesSafe.length) {
                        return '';
                    }
                    if (!categoriesSafe[i]) {
                        return '';
                    }
                    const series: number[][] = Array.isArray(opts?.series) ? opts.series : [];
                    const rawName = (namesSafe[i] ?? '').trim();
                    const titleText = rawName
                        ? this.escapeHtmlForTooltip(rawName)
                        : this.escapeHtmlForTooltip(categoriesSafe[i] ?? '');
                    const cs = series[0]?.[i];
                    const gr = series[1]?.[i];
                    const csStr =
                        cs == null || !Number.isFinite(cs) ? '—' : Number(cs).toFixed(1) + ' %';
                    const grStr =
                        gr == null || !Number.isFinite(gr) ? '—' : Number(gr).toFixed(1) + ' %';
                    return `<div class="rounded-xl border border-slate-700/70 bg-[#0f172a] px-3 py-2 text-xs shadow-xl">
                        <div class="font-semibold text-white max-w-[280px] whitespace-normal leading-snug">${titleText}</div>
                        <div class="mt-2 space-y-1 text-slate-300">
                          <div><span class="font-semibold text-[#5eead4]">Component</span>&nbsp; <span class="text-slate-100">${csStr}</span></div>
                          <div><span class="font-semibold text-[#fdba74]">Growth</span>&nbsp;&nbsp;<span class="text-slate-100">${grStr}</span></div>
                        </div>
                      </div>`;
                },
            },
            legend: {
                position: 'bottom',
                horizontalAlign: 'center',
                markers: {
                    size: 11,
                    shape: 'rounded',
                    radius: 5,
                    strokeWidth: 0,
                },
                labels: {
                    colors: '#475569',
                    fontSize: '12px',
                    fontWeight: 600,
                    fontFamily: chartFont,
                },
                itemMargin: { horizontal: 12 },
            },
        };
    }

    private escapeHtmlForTooltip(text: string): string {
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async initStore() {
        this.storeData
            .select((d) => d.index)
            .subscribe((d) => {
                const hasChangeTheme = this.store?.theme !== d?.theme;
                const hasChangeLayout = this.store?.layout !== d?.layout;
                const hasChangeMenu = this.store?.menu !== d?.menu;
                const hasChangeSidebar = this.store?.sidebar !== d?.sidebar;

                this.store = d;

                if (hasChangeTheme || hasChangeLayout || hasChangeMenu || hasChangeSidebar) {
                    if (this.isLoading || hasChangeTheme) {
                        this.initCharts();
                    } else {
                        setTimeout(() => {
                            this.initCharts();
                        }, 300);
                    }
                }
            });
    }

    /** Progress bar widths from KPI mock strings. */
    private syncMetricBarWidthsFromMocks(): void {
        const pct = (s: string): number => {
            const n = parseFloat(String(s).replace(/[^\d.-]/g, ''));
            if (!Number.isFinite(n)) return 0;
            return Math.max(0, Math.min(100, n));
        };
        this.componentScoreWidth = pct(this.mockComponentScore);
        this.growthWidth = pct(this.mockGrowth);
        this.appWidth = pct(this.mockApp);
        this.meetWidth = pct(this.mockMeet);
        this.masterWidth = pct(this.mockMaster);
    }

    /** Stroke-dashoffset for the KPI ring gauges (r = 30 → circumference ≈ 188.5). */
    kpiRingOffset(pct: number | null | undefined): number {
        const C = 2 * Math.PI * 30;
        const v = Number(pct);
        if (!Number.isFinite(v)) {
            return C;
        }
        return C * (1 - Math.min(100, Math.max(0, v)) / 100);
    }

    initCharts() {
        this.syncMetricBarWidthsFromMocks();
    }

    getSparklinePoints(): string {
        return Array.from({ length: 6 }, (_, i) => `${i * 20},${Math.floor(Math.random() * 20) + 10}`).join(' ');
    }
}


