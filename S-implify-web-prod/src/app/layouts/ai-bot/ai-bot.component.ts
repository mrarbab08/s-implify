import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { forkJoin, of, Subscription } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { ApiService } from '../../core/services/api.service';
import { GrowthAnalyticsService } from '../../core/services/growth-analytics.service';
import { AttendanceAnalyticsService } from '../../core/services/attendance-analytics.service';
import { CcmrAnalyticsService } from '../../core/services/ccmr-analytics.service';
import { DashboardAnalyticsService } from '../../core/services/dashboard-analytics.service';
import { DistrictContextService } from '../../core/services/district-context.service';
import { CCMR_DEFAULT_CREDIT_THRESHOLDS } from '../../core/models/simplify-api.model';

interface ChatLink {
    label: string;
    route: string;
}

interface ChatMessage {
    from: 'user' | 'bot';
    text: string;
    links?: ChatLink[];
}

/** Pre-computed live data kept warm in the background — answers are instant. */
interface LiveSnapshot {
    builtAt: number;
    pageKind: 'district' | 'campus' | 'teacher' | 'attendance' | 't-tess' | 'students' | 'other';
    route: string;
    pageCampus: { campusId: number | null; campusCode: string; name: string; slug: string } | null;
    counts: { districts: number; campuses: number; teachers: number };
    districtNames: string[];
    campuses: { name: string; slug: string; code: string }[];
    teachersSample: { name: string; campus: string }[];
    /** Growth analytics for the district (current filters applied). */
    overall: {
        cs: number | null; growth: number | null; app: number | null; meet: number | null; master: number | null;
        csGrade: string | null; growthGrade: string | null;
    } | null;
    campusRows: { campusName: string; campusCode: string; componentScore: number | null; growth: number | null }[];
    classrooms: { teacher: string; grade: string | null; componentScore: number | null; growth: number | null }[];
    /** Extra analytics for the page currently open (campus / teacher drill-down). */
    pageOverall: { cs: number | null; growth: number | null } | null;
    pageClassrooms: { teacher: string; grade: string | null; componentScore: number | null; growth: number | null }[];
    attendance: { averageAdaPct: number | null; totalStudents: number | null; noStudentAbsents: number | null } | null;
    campusAttendance: { campusName: string; averageAdaPct: number | null; numberStudentAbsent: number | null; estimatedMissedFinance: number | null }[];
    overallPct: { ccmrRate: number | null; graduationRate: number | null; teachers: number | null } | null;
}

@Component({
    selector: 'app-ai-bot',
    templateUrl: './ai-bot.component.html',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
})
export class AiBotComponent implements OnInit, OnDestroy {
    @ViewChild('chatBody') chatBody?: ElementRef<HTMLDivElement>;

    open = false;
    draft = '';
    typing = false;
    aiOnline = false;
    offlineNotified = false;

    messages: ChatMessage[] = [];

    quickReplies = [
        'What can you do?',
        'Analysis report of this page',
        'Give me the analysis summary for campuses',
        'Top classrooms analysis',
        'How many campuses?',
    ];

    private userName = '';
    private historyPairs: { role: 'user' | 'assistant'; content: string }[] = [];

    /** Warm live data — rebuilt in the background on load, navigation and a timer. */
    private snapshot: LiveSnapshot | null = null;
    private building = false;
    private refreshTimer: ReturnType<typeof setInterval> | null = null;
    private navSub?: Subscription;
    private externalPromptHandler?: EventListener;
    private destroySubs = () => {};

    constructor(
        private apiService: ApiService,
        private growthAnalytics: GrowthAnalyticsService,
        private attendanceAnalytics: AttendanceAnalyticsService,
        private ccmrAnalytics: CcmrAnalyticsService,
        private dashboardAnalytics: DashboardAnalyticsService,
        private districtContext: DistrictContextService,
        private router: Router,
        private cdr: ChangeDetectorRef,
    ) {
        try {
            const raw = localStorage.getItem('simplify_user');
            if (raw) {
                const u = JSON.parse(raw);
                this.userName = (u?.name || u?.Name || u?.displayName || u?.email || '').toString().split(' ')[0];
                if (/@/.test(this.userName)) {
                    const local = this.userName.split('@')[0].replace(/[._-]+/g, ' ');
                    this.userName = local.charAt(0).toUpperCase() + local.slice(1);
                }
            }
        } catch {
            this.userName = '';
        }
    }

    ngOnInit(): void {
        /** Background warm-up: crunch the live analysis continuously. */
        if (this.districtContext.bootstrapLoaded) {
            this.buildSnapshot();
        } else {
            this.districtContext.bootstrapReady$.subscribe(() => this.buildSnapshot());
        }
        this.refreshTimer = setInterval(() => this.buildSnapshot(), 45_000);
        /** Rebuild after each navigation so page reports match the page you're on. */
        this.navSub = this.router.events.subscribe((e) => {
            if (e instanceof NavigationEnd) {
                setTimeout(() => this.buildSnapshot(), 1500);
            }
        });
        /** Other buttons (Search Filters modal → Campus Comparison) hand prompts to the bot. */
        this.externalPromptHandler = ((ev: Event) => {
            const detail = (ev as CustomEvent).detail || {};
            const prompt = typeof detail.prompt === 'string' ? detail.prompt : '';
            if (!prompt) {
                return;
            }
            if (!this.open) {
                this.toggle();
            }
            setTimeout(() => this.send(prompt), 60);
        }) as EventListener;
        window.addEventListener('simplify-ai-prompt', this.externalPromptHandler);
    }

    ngOnDestroy(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        this.navSub?.unsubscribe();
        if (this.externalPromptHandler) {
            window.removeEventListener('simplify-ai-prompt', this.externalPromptHandler);
        }
    }

    toggle(): void {
        this.open = !this.open;
        if (this.open && !this.messages.length) {
            const name = this.userName ? `, ${this.userName}` : '';
            this.messages.push({
                from: 'bot',
                text:
                    `Hi${name}! 👋 I'm S-Implify AI Bot — your real-time analyst.\n\n` +
                    `I crunch the dashboard data in the background, so numbers come back instantly. ` +
                    `Ask for an analysis of campuses or classrooms, say "analysis report of this page" on any screen, or just chat with me.`,
            });
        }
        this.scrollToBottom();
    }

    close(): void {
        this.open = false;
    }

    send(text?: string): void {
        const q = (text ?? this.draft).trim();
        if (!q || this.typing) {
            return;
        }
        this.draft = '';
        this.messages.push({ from: 'user', text: q });
        this.historyPairs.push({ role: 'user', content: q });
        this.cdr.markForCheck();
        this.scrollToBottom();

        const lower = q.toLowerCase();
        /** 1) Counts — answered locally, no AI roundtrip. */
        if (this.tryCountQuestion(lower)) {
            return;
        }
        /** 2) Analysis / reports — instant, from the warm background snapshot. */
        if (this.tryAnalysisQuestion(lower)) {
            return;
        }
        /** 3) Open questions — AI, already holding the warm context. */
        this.askAi(q);
    }

    // ===== Instant local answers (nanosecond-class: data is pre-computed) =====

    private tryCountQuestion(q: string): boolean {
        const has = (...words: string[]) => words.some((w) => q.indexOf(w) > -1);
        const wantsCount = has('how many', 'count', 'number of', 'total');
        if (wantsCount && has('district')) {
            this.countAnswer('districts?activeOnly=true', 'district', 'districts');
            return true;
        }
        if ((wantsCount || has('list campus')) && has('campus') && !has('analysis', 'summary', 'report')) {
            this.campusAnswer(wantsCount || has('list'));
            return true;
        }
        if (wantsCount && has('teacher')) {
            this.countAnswer('users?roleId=4&activeOnly=true', 'teacher', 'teachers');
            return true;
        }
        return false;
    }

    private tryAnalysisQuestion(q: string): boolean {
        const has = (...words: string[]) => words.some((w) => q.indexOf(w) > -1);
        const wantsAnalysis =
            has('analysis', 'summar', 'report', 'compar', 'performance', 'insight', 'snapshot', 'how are', 'how is');
        if (!wantsAnalysis) {
            return false;
        }
        if (has('page', 'this page', 'current', 'here', 'screen', 'running', 'runtime')) {
            this.deliverFromSnapshot('page');
        } else if (has('classroom', 'teacher')) {
            this.deliverFromSnapshot('classroom');
        } else {
            this.deliverFromSnapshot('campus');
        }
        return true;
    }

    /**
     * Deliver an instant answer from the warm snapshot. If it's still being
     * crunched (e.g. asked within a second of page load), queue the reply so
     * the user never sees an error — the snapshot lands momentarily.
     */
    private deliverFromSnapshot(kind: 'page' | 'campus' | 'classroom'): void {
        if (this.snapshot) {
            const text = kind === 'page' ? this.formatPageReport(this.snapshot) : kind === 'campus' ? this.formatCampusSummary(this.snapshot) : this.formatClassroomSummary(this.snapshot);
            this.deliver(text);
            return;
        }
        // Snapshot not ready — build it now, then answer (fast local APIs).
        this.buildSnapshot(() => {
            const s = this.snapshot;
            if (s) {
                const text = kind === 'page' ? this.formatPageReport(s) : kind === 'campus' ? this.formatCampusSummary(s) : this.formatClassroomSummary(s);
                this.deliver(text);
            } else {
                this.deliver(
                    `I'm still connecting to the dashboard data (district / academic year / quarter). 🔄 Ask me again in a moment and I'll have the full analysis ready.`,
                );
            }
        });
    }

    private deliver(text: string, links?: ChatLink[]): void {
        setTimeout(() => {
            this.typing = false;
            this.messages.push({ from: 'bot', text: text, links: links });
            this.historyPairs.push({ role: 'assistant', content: text });
            this.cdr.markForCheck();
            this.scrollToBottom();
        }, 50);
    }

    // ===== Background snapshot (the "analysis runs in the background" engine) =====

    private buildSnapshot(done?: () => void): void {
        if (this.building) {
            return;
        }
        this.building = true;
        const selection = this.districtContext.selection;
        const base = this.districtContext.baseGrowthPayload();
        const filters = this.districtContext.growthFiltersPayload();
        const route = this.router.url.split('?')[0].split('#')[0];
        const pageKind = this.pageKindFromUrl(route);
        const pageCampus = this.pageCampusFromUrl(route);

        const attendanceBody: any = {
            districtId: selection.districtId,
            academicYearId: selection.academicYearId,
            ...(pageCampus?.campusId ? { campusId: pageCampus.campusId } : {}),
        };
        const overallPctBody: any = {
            districtId: selection.districtId,
            academicYearId: selection.academicYearId,
            notLikelyCredits: CCMR_DEFAULT_CREDIT_THRESHOLDS.notLikelyCredits,
        };

        const reqs: Record<string, any> = {
            districts: this.apiService.get('districts?activeOnly=true').pipe(catchError(() => of<any>(null))),
            campuses: this.apiService.get('campuses?activeOnly=true').pipe(catchError(() => of<any>(null))),
            teachers: this.apiService.get('users?roleId=4&activeOnly=true').pipe(catchError(() => of<any>(null))),
            attendance: this.attendanceAnalytics.postDistrictAdaSummary(attendanceBody).pipe(catchError(() => of(null))),
            campusAttendance: this.attendanceAnalytics.postCampusWiseStats(attendanceBody).pipe(catchError(() => of([]))),
            overallPct: this.dashboardAnalytics.postOverallPercentages(overallPctBody).pipe(catchError(() => of(null))),
        };

        if (base) {
            const growthBody: any = { ...base, ...filters };
            const classroomsBody: any = {
                districtId: base.districtId,
                academicYearId: base.academicYearId,
                quarterCode: base.quarterCode,
                ...(base.campusCode ? { campusCode: base.campusCode } : {}),
                top: 5,
            };
            if (filters.grade?.length) {
                classroomsBody.gradeCode = filters.grade;
            }
            if (filters.subject?.length) {
                classroomsBody.subjectCode = filters.subject;
            }
            if (filters.specialEducation != null) {
                classroomsBody.specialEducation = filters.specialEducation;
            }
            if (filters.economicDisadvantage != null) {
                classroomsBody.economicDisadvantage = filters.economicDisadvantage;
            }
            if (filters.emergentBilingual != null) {
                classroomsBody.emergentBilingual = filters.emergentBilingual;
            }
            if (filters.ethnicity != null) {
                classroomsBody.ethnicity = filters.ethnicity;
            }
            if (filters.testLanguage != null) {
                classroomsBody.testLanguage = filters.testLanguage;
            }
            reqs['overall'] = this.growthAnalytics.getOverallGrowthMetrics(growthBody).pipe(catchError(() => of(null)));
            reqs['campusRows'] = this.growthAnalytics.getCampusGrowthMetrics(growthBody).pipe(catchError(() => of([])));
            reqs['classrooms'] = this.growthAnalytics.getTopClassrooms(classroomsBody).pipe(catchError(() => of([])));
            /** Page-scoped analytics for campus / teacher drill-downs. */
            if (pageCampus?.campusCode) {
                const campusScoped: any = { ...growthBody, campusCode: pageCampus.campusCode };
                if (pageKind === 'teacher') {
                    const tMatch = route.match(/\/teacher\/([^/]+)/);
                    const teacherId = tMatch ? Number(tMatch[1]) : null;
                    if (teacherId != null && Number.isFinite(teacherId)) {
                        campusScoped.teacherId = teacherId;
                    }
                }
                reqs['pageOverall'] = this.growthAnalytics.getOverallGrowthMetrics(campusScoped).pipe(catchError(() => of(null)));
                reqs['pageClassrooms'] = this.growthAnalytics
                    .getTopClassrooms({ ...classroomsBody, campusCode: pageCampus.campusCode, top: 5 })
                    .pipe(catchError(() => of([])));
            }
        }

        forkJoin(reqs).subscribe({
            next: (r: any) => {
                this.building = false;
                const dList: any[] = Array.isArray(r.districts) ? r.districts : r.districts?.data || [];
                const cList: any[] = Array.isArray(r.campuses) ? r.campuses : r.campuses?.data || [];
                const tList: any[] = Array.isArray(r.teachers) ? r.teachers : r.teachers?.data || [];
                const round = (v: any): number | null => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
                const resolvedCampus =
                    pageCampus && (pageCampus.campusCode || pageCampus.name)
                        ? pageCampus
                        : null;
                const att = r.attendance || {};
                const pct = r.overallPct || {};
                const ov = r.overall || null;
                const snap: LiveSnapshot = {
                    builtAt: Date.now(),
                    pageKind: pageKind,
                    route: route,
                    pageCampus: resolvedCampus,
                    counts: { districts: dList.length, campuses: cList.length, teachers: tList.length },
                    districtNames: dList.map((d: any) => d.name || d.Name).filter(Boolean),
                    campuses: cList
                        .filter((c: any) => c?.campusName || c?.name || c?.Name)
                        .slice(0, 15)
                        .map((c: any) => {
                            const n = c.campusName || c.name || c.Name;
                            return { name: n, slug: this.slug(n), code: c.campusCode || c.code || c.Code || '' };
                        }),
                    teachersSample: tList.slice(0, 10).map((t: any) => ({
                        name: t.name || t.Name || t.fullName || t.displayName || '',
                        campus: t.campusName || t.campus || '',
                    })),
                    overall: ov
                        ? {
                              cs: round(ov.cs), growth: round(ov.growth), app: round(ov.app),
                              meet: round(ov.meet), master: round(ov.master),
                              csGrade: ov.csGrade ?? null, growthGrade: ov.growthGrade ?? null,
                          }
                        : null,
                    campusRows: (r.campusRows || []).map((row: any) => ({
                        campusName: String(row?.campusName || row?.campusCode || '').trim(),
                        campusCode: String(row?.campusCode || ''),
                        componentScore: round(row?.componentScore),
                        growth: round(row?.growth),
                    })),
                    classrooms: (r.classrooms || []).map((t: any) => ({
                        teacher: `${t?.firstName ?? ''} ${t?.lastName ?? ''}`.trim(),
                        grade: t?.grade ?? null,
                        componentScore: round(t?.componentScore),
                        growth: round(t?.growth),
                    })),
                    pageOverall: r.pageOverall
                        ? { cs: round(r.pageOverall.cs), growth: round(r.pageOverall.growth) }
                        : null,
                    pageClassrooms: (r.pageClassrooms || []).map((t: any) => ({
                        teacher: `${t?.firstName ?? ''} ${t?.lastName ?? ''}`.trim(),
                        grade: t?.grade ?? null,
                        componentScore: round(t?.componentScore),
                        growth: round(t?.growth),
                    })),
                    attendance: selection.districtId != null
                        ? {
                              averageAdaPct: round(att.averageAdaPct),
                              totalStudents: att.totalStudents ?? null,
                              noStudentAbsents: att.noStudentAbsents ?? null,
                          }
                        : null,
                    campusAttendance: (r.campusAttendance || []).map((c: any) => ({
                        campusName: c?.campusName || '',
                        averageAdaPct: round(c?.averageAdaPct),
                        numberStudentAbsent: c?.numberStudentAbsent ?? null,
                        estimatedMissedFinance: c?.estimatedMissedFinance ?? null,
                    })),
                    overallPct: selection.districtId != null
                        ? {
                              ccmrRate: round(pct.ccmrRate),
                              graduationRate: round(pct.graduationRate),
                              teachers: round(pct.teachers),
                          }
                        : null,
                };
                this.snapshot = snap;
                this.cdr.markForCheck();
                done?.();
            },
            error: () => {
                this.building = false;
                done?.();
            },
        });
    }

    private pageKindFromUrl(path: string): LiveSnapshot['pageKind'] {
        if (/^\/dashboard\/campus\/[^/]+\/teacher/.test(path)) {
            return 'teacher';
        }
        if (/^\/dashboard\/campus\//.test(path)) {
            return 'campus';
        }
        if (path === '/dashboard' || path === '/' || /^\/dashboard\/category/.test(path)) {
            return 'district';
        }
        if (path.startsWith('/attendance')) {
            return 'attendance';
        }
        if (path.startsWith('/t-tess')) {
            return 't-tess';
        }
        if (path.startsWith('/students')) {
            return 'students';
        }
        return 'other';
    }

    /** Resolve the campus shown by the current route (slug or code). */
    private pageCampusFromUrl(path: string): LiveSnapshot['pageCampus'] | null {
        const m = path.match(/^\/dashboard\/campus\/([^/]+)/);
        if (!m) {
            return null;
        }
        const id = m[1].toLowerCase();
        const campus = (this.districtContext.campuses || []).find(
            (c: any) => this.districtContext.campusRouteSlug(c) === id || (c.campusCode || '').toLowerCase() === id,
        );
        const name = campus?.campusName || (campus as any)?.name || id;
        return {
            campusId: campus?.campusId ?? null,
            campusCode: campus?.campusCode || id,
            name: name,
            slug: this.slug(name),
        };
    }

    // ===== AI pipeline (open-ended questions — context is pre-warmed) =====

    private askAi(q: string): void {
        const go = (ctx: any) => {
            this.apiService
                .post('ai/chat', {
                    message: q,
                    history: this.historyPairs.slice(-8),
                    context: ctx,
                })
                .subscribe({
                    next: (data: any) => {
                        const raw = ((data && data.data && data.data.reply) || '').trim();
                        const { text, links } = this.parseReply(raw);
                        this.aiOnline = true;
                        this.typing = false;
                        this.messages.push({ from: 'bot', text: text, links: links });
                        this.historyPairs.push({ role: 'assistant', content: text });
                        this.cdr.markForCheck();
                        this.scrollToBottom();
                    },
                    error: (err: any) => {
                        this.typing = false;
                        const msgText = ((err && err.message) || '').toString();
                        const status = err && err.status;
                        if (msgText.indexOf('AI key not configured') > -1 || status === 418) {
                            if (!this.offlineNotified) {
                                this.offlineNotified = true;
                            }
                            this.brain(q.toLowerCase());
                            return;
                        }
                        this.aiOnline = false;
                        const providerFailed =
                            msgText.indexOf('AI request failed') > -1 || msgText.indexOf('Empty reply') > -1;
                        if (providerFailed) {
                            // Provider hiccup — still deliver a real numbers analysis from the warm data.
                            const kind = /classroom|teacher/.test(q.toLowerCase()) ? 'classroom' : 'campus';
                            if (this.snapshot) {
                                const summary =
                                    kind === 'classroom'
                                        ? this.formatClassroomSummary(this.snapshot)
                                        : this.formatCampusSummary(this.snapshot);
                                this.deliver(`My AI connection had a hiccup, so here's my built-in analysis instead. 🤖\n\n` + summary);
                            } else {
                                this.deliver(
                                    `My AI connection had a hiccup (the AI provider is unreachable or over quota). 😔\n\nMy built-in analysis is warming up — try again in a moment.`,
                                );
                            }
                            return;
                        }
                        this.messages.push({
                            from: 'bot',
                            text: `I couldn't reach the AI service (backend on port 8080 may be down). 😔\n\nYou can still ask me for counts and analysis summaries — those come straight from the database.`,
                        });
                        this.cdr.markForCheck();
                        this.scrollToBottom();
                    },
                });
        };
        if (this.snapshot) {
            go(this.contextFromSnapshot());
        } else {
            this.buildSnapshot(() => go(this.contextFromSnapshot()));
        }
    }

    /** Package the warm snapshot into the LLM live-context JSON (no fetching). */
    private contextFromSnapshot(): any {
        const s = this.snapshot!;
        return {
            user: { name: this.userName, role: localStorage.getItem('simplify_role_selection_complete') ? 'signed-in user' : 'guest' },
            currentRoute: s.route,
            pageKind: s.pageKind,
            pageCampus: s.pageCampus,
            counts: s.counts,
            districtNames: s.districtNames,
            campuses: s.campuses,
            teachersSample: s.teachersSample,
            analytics: s.overall
                ? {
                      districtOverall: s.overall,
                      campuses: s.campusRows,
                      topClassrooms: s.classrooms,
                      pageOverall: s.pageOverall,
                      pageClassrooms: s.pageClassrooms,
                      attendance: s.attendance,
                      campusAttendance: s.campusAttendance,
                      rates: s.overallPct,
                  }
                : { available: false, note: 'Growth analytics were not fetched — the dashboard context is not ready yet. Answer from counts only.' },
            routes: [
                '/dashboard', '/dashboard/campus/<slug>', '/dashboard/campus/<slug>/teacher/<teacherId>',
                '/t-tess', '/students', '/attendance', '/attendance/individual', '/data-uploads', '/user-setups',
            ],
        };
    }

    /** Turn "LINKS: Label|/route ;; ..." trailers into chips. */
    private parseReply(raw: string): { text: string; links?: ChatLink[] } {
        if (!raw) {
            return { text: 'Hmm, I got an empty reply.' };
        }
        const lines = raw.split('\n');
        const linkLineIdx = lines.findIndex((l) => l.trim().startsWith('LINKS:'));
        let text = raw;
        let links: ChatLink[] | undefined;
        if (linkLineIdx > -1) {
            text = lines.slice(0, linkLineIdx).join('\n').trim();
            const payload = lines[linkLineIdx].replace(/^\s*LINKS:\s*/, '').trim();
            links = payload
                .split(';;')
                .map((part) => part.trim())
                .filter(Boolean)
                .slice(0, 3)
                .map((part) => {
                    const bar = part.lastIndexOf('|');
                    if (bar === -1) {
                        return null;
                    }
                    const label = part.slice(0, bar).trim();
                    const route = part.slice(bar + 1).trim();
                    if (!route.startsWith('/')) {
                        return null;
                    }
                    return { label: label || route, route } as ChatLink;
                })
                .filter(Boolean) as ChatLink[];
        }
        return { text: text || raw, links: links && links.length ? links : undefined };
    }

    // ===== Instant formatters =====

    private pct(v: number | null): string {
        return v == null ? '—' : `${v}%`;
    }

    private formatCampusSummary(s: LiveSnapshot): string {
        const lines: string[] = [];
        if (s.overall && (s.overall.cs != null || s.overall.growth != null)) {
            lines.push(`📊 District snapshot — STAAR ${this.pct(s.overall.cs)} | Growth ${this.pct(s.overall.growth)}`);
            lines.push('');
        }
        const campuses = [...s.campusRows]
            .filter((r) => r.componentScore != null || r.growth != null)
            .sort((x, y) => (y.componentScore ?? -999) - (x.componentScore ?? -999));
        if (campuses.length) {
            lines.push('Campuses (best first):');
            for (const c of campuses) {
                lines.push(`• ${c.campusName || c.campusCode} — STAAR ${this.pct(c.componentScore)} | Growth ${this.pct(c.growth)}`);
            }
        }
        const top = campuses[0];
        const bottom = campuses[campuses.length - 1];
        if (top && bottom && top !== bottom) {
            lines.push('');
            lines.push(`${top.campusName} leads the district${top.growth != null ? ` with ${this.pct(top.growth)} growth` : ''}, while ${bottom.campusName} has the lowest component score at ${this.pct(bottom.componentScore)}.`);
        }
        return lines.join('\n');
    }

    private formatClassroomSummary(s: LiveSnapshot): string {
        const lines: string[] = [];
        if (s.overall && (s.overall.cs != null || s.overall.growth != null)) {
            lines.push(`📊 District snapshot — STAAR ${this.pct(s.overall.cs)} | Growth ${this.pct(s.overall.growth)}`);
            lines.push('');
        }
        const rooms = s.classrooms.filter((t) => t.teacher);
        if (rooms.length) {
            lines.push('Top classrooms:');
            for (const t of rooms) {
                lines.push(`• ${t.teacher}${t.grade ? ` (Gr ${t.grade})` : ''} — STAAR ${this.pct(t.componentScore)} | Growth ${this.pct(t.growth)}`);
            }
            const top = rooms[0];
            lines.push('');
            lines.push(`${top.teacher}'s classroom${top.grade ? ` (grade ${top.grade})` : ''} leads with ${this.pct(top.componentScore)} STAAR and ${this.pct(top.growth)} growth.`);
        }
        return lines.join('\n');
    }

    /** "Analysis report of this page" — reflects exactly the page you're on. */
    private formatPageReport(s: LiveSnapshot): string {
        const lines: string[] = [];
        const pageLabel: Record<LiveSnapshot['pageKind'], string> = {
            district: 'Districts Overview',
            campus: s.pageCampus ? s.pageCampus.name : 'Campus dashboard',
            teacher: s.pageCampus ? `Teacher drill-down — ${s.pageCampus.name}` : 'Teacher drill-down',
            attendance: 'Attendance Summary',
            't-tess': 'T-TESS',
            students: 'Students',
            other: 'this page',
        };
        lines.push(`📄 Analysis report — ${pageLabel[s.pageKind]}`);
        lines.push(`Route: ${s.route}`);
        lines.push('');

        if (s.pageKind === 'district') {
            if (s.overall) {
                lines.push(`Growth: STAAR ${this.pct(s.overall.cs)} | Growth ${this.pct(s.overall.growth)} (APP ${this.pct(s.overall.app)} · MEET ${this.pct(s.overall.meet)} · MASTER ${this.pct(s.overall.master)})`);
            }
            const campuses = [...s.campusRows]
                .filter((r) => r.componentScore != null || r.growth != null)
                .sort((x, y) => (y.componentScore ?? -999) - (x.componentScore ?? -999));
            if (campuses.length) {
                lines.push('');
                lines.push('Campuses (best first):');
                for (const c of campuses) {
                    lines.push(`• ${c.campusName || c.campusCode} — STAAR ${this.pct(c.componentScore)} | Growth ${this.pct(c.growth)}`);
                }
            }
            if (s.attendance && s.attendance.averageAdaPct != null) {
                lines.push('');
                lines.push(`Attendance: avg ADA ${this.pct(s.attendance.averageAdaPct)}${s.attendance.totalStudents != null ? ` · ${s.attendance.totalStudents} students` : ''}`);
            }
            if (s.overallPct) {
                const parts: string[] = [];
                if (s.overallPct.ccmrRate != null) {
                    parts.push(`CCMR ${this.pct(s.overallPct.ccmrRate)}`);
                }
                if (s.overallPct.graduationRate != null) {
                    parts.push(`Grad rate ${this.pct(s.overallPct.graduationRate)}`);
                }
                if (s.overallPct.teachers != null) {
                    parts.push(`T-TESS avg ${this.pct(s.overallPct.teachers)}`);
                }
                if (parts.length) {
                    lines.push(parts.join(' · '));
                }
            }
            const topRoom = s.classrooms[0];
            if (topRoom && topRoom.teacher) {
                lines.push('');
                lines.push(`Top classroom: ${topRoom.teacher}${topRoom.grade ? ` (Gr ${topRoom.grade})` : ''} — STAAR ${this.pct(topRoom.componentScore)} | Growth ${this.pct(topRoom.growth)}`);
            }
            const topCampus = campuses[0];
            return lines.join('\n') + this.pageReportLinks(topCampus ? [{ label: '🏫 ' + topCampus.campusName, route: `/dashboard/campus/${topCampus.campusName ? this.slug(topCampus.campusName) : topCampus.campusCode}` }] : []);
        }

        if (s.pageKind === 'campus' || s.pageKind === 'teacher') {
            const src = s.pageOverall || s.overall;
            if (src && src.cs != null) {
                lines.push(`Campus KPIs: STAAR ${this.pct(src.cs)} | Growth ${this.pct(src.growth)}`);
            }
            const att = s.pageCampus?.campusId
                ? s.campusAttendance.find((c) => c.campusName && s.pageCampus?.name && c.campusName.indexOf(s.pageCampus.name) > -1)
                : null;
            if (att && att.averageAdaPct != null) {
                lines.push(`Attendance: ADA ${this.pct(att.averageAdaPct)}${att.numberStudentAbsent != null ? ` · ${att.numberStudentAbsent} students absent` : ''}`);
            }
            const rooms = (s.pageClassrooms.length ? s.pageClassrooms : s.classrooms).filter((t) => t.teacher);
            if (rooms.length && s.pageKind === 'campus') {
                lines.push('');
                lines.push('Top classrooms on this campus:');
                for (const t of rooms.slice(0, 5)) {
                    lines.push(`• ${t.teacher}${t.grade ? ` (Gr ${t.grade})` : ''} — STAAR ${this.pct(t.componentScore)} | Growth ${this.pct(t.growth)}`);
                }
            }
            if (s.pageKind === 'teacher') {
                lines.push('');
                lines.push(`This view combines ${s.pageCampus?.name ?? 'the campus'} with the selected teacher's classrooms and students.`);
            }
            return lines.join('\n') + this.pageReportLinks([{ label: '🏠 District Overview', route: '/dashboard' }]);
        }

        if (s.pageKind === 'attendance') {
            if (s.attendance && s.attendance.averageAdaPct != null) {
                lines.push(`District ADA ${this.pct(s.attendance.averageAdaPct)}${s.attendance.totalStudents != null ? ` · ${s.attendance.totalStudents} students tracked` : ''}${s.attendance.noStudentAbsents != null ? ` · ${s.attendance.noStudentAbsents} with no absences` : ''}`);
            }
            const rows = s.campusAttendance
                .filter((c) => c.campusName && c.averageAdaPct != null)
                .sort((x, y) => (y.averageAdaPct ?? -999) - (x.averageAdaPct ?? -999));
            if (rows.length) {
                lines.push('');
                lines.push('Campus ADA (best first):');
                for (const c of rows) {
                    lines.push(`• ${c.campusName} — ADA ${this.pct(c.averageAdaPct)}${c.estimatedMissedFinance != null ? ` · est. missed $${c.estimatedMissedFinance}` : ''}`);
                }
                lines.push('');
                lines.push(`${rows[rows.length - 1].campusName} needs the most attention at ${this.pct(rows[rows.length - 1].averageAdaPct)} ADA.`);
            }
            return lines.join('\n') + this.pageReportLinks([{ label: '📈 District Overview', route: '/dashboard' }]);
        }

        if (s.pageKind === 't-tess') {
            if (s.overallPct && s.overallPct.teachers != null) {
                lines.push(`District average T-TESS score: ${this.pct(s.overallPct.teachers)}`);
            }
            lines.push(`Teachers tracked: ${s.counts.teachers}`);
            lines.push('');
            lines.push('Detailed evaluation charts are on the page itself.');
            return lines.join('\n') + this.pageReportLinks([{ label: '📈 District Overview', route: '/dashboard' }]);
        }

        if (s.pageKind === 'students') {
            if (s.attendance && s.attendance.totalStudents != null) {
                lines.push(`Students tracked district-wide: ${s.attendance.totalStudents}`);
            }
            lines.push(`Campuses: ${s.counts.campuses} · Teachers: ${s.counts.teachers}`);
            return lines.join('\n') + this.pageReportLinks([{ label: '📈 District Overview', route: '/dashboard' }]);
        }

        lines.push(`Campuses: ${s.counts.campuses} · Teachers: ${s.counts.teachers}`);
        lines.push('');
        lines.push('Ask me for the campus or classroom analysis and I\'ll pull the live numbers.');
        return lines.join('\n') + this.pageReportLinks([{ label: '📈 District Overview', route: '/dashboard' }]);
    }

    private pageReportLinks(links: ChatLink[]): string {
        if (!links.length) {
            return '';
        }
        return '\n\n' + links.map((l) => `[${l.label.replace(/^\W+/, '')}] → ${l.route}`).join(' · ');
    }

    // ===== Local rules fallback (used when AI is not configured/unreachable) =====

    private brain(q: string): void {
        const finish = (text: string, links?: ChatLink[]) => {
            setTimeout(() => {
                this.typing = false;
                this.messages.push({ from: 'bot', text: text, links: links });
                this.historyPairs.push({ role: 'assistant', content: text });
                this.cdr.markForCheck();
                this.scrollToBottom();
            }, 60);
        };

        const has = (...words: string[]) => words.some((w) => q.indexOf(w) > -1);

        if (/^(hi|hello|hey|salam|good (morning|afternoon|evening))\b/.test(q) && q.length < 25) {
            return finish(`Hello${this.userName ? ' ' + this.userName : ''}! 😊 How can I help you with the S-Implify portal today?`);
        }
        if (has('what can you do', 'help', 'capabilit', 'who are you', 'what do you do')) {
            return finish(
                `I'm your built-in assistant. I can:\n` +
                    `• 📊 Report live counts — districts, campuses & teachers\n` +
                    `• 📈 Analyze — campus & classroom summaries with real numbers\n` +
                    `• 📄 Report the page you're on ("analysis report of this page")\n` +
                    `• 🧭 Navigate — Data Uploads, User Setups, T-TESS, Students, Attendance\n\nJust ask in plain words!`,
            );
        }
        if (this.tryAnalysisQuestion(q)) {
            return;
        }
        if (this.tryCountQuestion(q)) {
            return;
        }
        if (has('data upload', 'upload')) {
            return finish(`Here's the Data Uploads page — you can drop in your campus data files there.`, [
                { label: '📂 Open Data Uploads', route: '/data-uploads' },
            ]);
        }
        if (has('user setup', 'setup', 'user set')) {
            return finish(`User Setups is where accounts, roles and campus assignments are managed.`, [
                { label: '⚙️ Open User Setups', route: '/user-setups' },
            ]);
        }
        if (has('t-tess', 'ttess', 't tess', 'teacher page', 'teachers page')) {
            return finish(`Sure — the T-TESS page has teacher evaluation insights.`, [
                { label: '👩‍🏫 Go to T-TESS', route: '/t-tess' },
            ]);
        }
        if (has('student')) {
            if (has('individual')) {
                return finish(`Individual Attendance shows a single student's attendance record.`, [
                    { label: '🗓️ Individual Attendance', route: '/attendance/individual' },
                ]);
            }
            return finish(`The Students page lists every student across your campuses.`, [
                { label: '🎓 Open Students', route: '/students' },
            ]);
        }
        if (has('attendance')) {
            return finish(`Attendance Summary shows campus-wide attendance at a glance.`, [
                { label: '🗓️ Open Attendance Summary', route: '/attendance' },
            ]);
        }
        if (has('campus') && has('dashboard', 'open', 'show', 'drill')) {
            return finish(`Campus dashboards live under the Districts page — open it, click the Districts card, then pick a campus. Or use one of the campuses I've listed right here!`, [
                { label: '📊 Go to Districts Overview', route: '/dashboard' },
            ]);
        }
        if (has('score', 'staar', 'kpi', 'component', 'growth chart', 'charts')) {
            return finish(`STAAR Component Scores, Growth %s, and the Campuses Overview chart all sit on the main dashboard. The Districts / Campuses / Teachers cards at the top are clickable and open detailed popups!`, [
                { label: '📈 Open Dashboard', route: '/dashboard' },
            ]);
        }
        if (has('dashboard', 'home', 'overview', 'district')) {
            return finish(`Here's the home I know best — the Districts Overview dashboard.`, [
                { label: '🏠 Go to Dashboard', route: '/dashboard' },
            ]);
        }
        if (has('thank')) {
            return finish(`You're most welcome! 🙌 Anything else?`);
        }
        if (has('bye', 'goodbye', 'see you')) {
            return finish(`Goodbye${this.userName ? ' ' + this.userName : ''}! 👋 I'll be right here whenever you need me.`);
        }
        return finish(
            `I answered from my built-in rules, but I don't have a match for that one. Try: "How many teachers?", "Analysis report of this page", or "Go to Data Uploads".`,
        );
    }

    private countAnswer(url: string, singular: string, plural: string): void {
        this.apiService.get(url).subscribe({
            next: (data: any) => {
                const list = Array.isArray(data) ? data : data?.data || [];
                const n = list.length;
                this.deliver(
                    n === 0
                        ? `I checked the database — there are currently no ${plural} registered.`
                        : n === 1
                          ? `There is ${n} active ${singular}.`
                          : `There are ${n} active ${plural} in the district right now. ✅`,
                );
            },
            error: () => {
                this.deliver(`I couldn't reach the ${plural} API just now. 😔 Make sure the backend (port 8080) is running, then ask me again.`);
            },
        });
    }

    private campusAnswer(list: boolean): void {
        this.apiService.get('campuses?activeOnly=true').subscribe({
            next: (data: any) => {
                const listData: any[] = Array.isArray(data) ? data : data?.data || [];
                const n = listData.length;
                const text = list
                    ? n === 1
                        ? `Here is the 1 active campus — tap it to open its dashboard. 🏫`
                        : `Here are the ${n} active campuses — tap one to jump straight to its dashboard. 🏫`
                    : n === 1
                      ? `There is 1 active campus right now.`
                      : `There are ${n} active campuses right now. ✅`;
                const links: ChatLink[] = list
                    ? listData
                          .filter((c: any) => c?.campusName || c?.name || c?.Name)
                          .slice(0, 8)
                          .map((c: any) => ({
                              label: c.campusName || c.name || c.Name || 'Campus',
                              route: `/dashboard/campus/${this.slug(c.campusName || c.name || c.Name || '')}`,
                          }))
                    : [];
                this.deliver(text, links.length ? links : undefined);
            },
            error: () => {
                this.deliver(`I couldn't reach the campuses API just now. 😔 Make sure the backend (port 8080) is running, then ask me again.`);
            },
        });
    }

    /** Same slug rule as DistrictContextService.campusRouteSlug. */
    private slug(name: string): string {
        return (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    }

    private scrollToBottom(): void {
        setTimeout(() => {
            const el = this.chatBody?.nativeElement;
            if (el) {
                el.scrollTop = el.scrollHeight;
            }
        }, 60);
    }
}
