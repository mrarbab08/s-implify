import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { Subject, forkJoin, of } from 'rxjs';
import { catchError, distinctUntilChanged, finalize, map, switchMap, tap } from 'rxjs/operators';

import { DistrictContextService } from '../../../core/services/district-context.service';
import { AdminSetupsService } from '../../../core/services/admin-setups.service';
import { FiltersService } from '../../../core/services/filters.service';
import { StudentGrowthRecordsService } from '../../../core/services/student-growth-records.service';
import { TeachersService } from '../../../core/services/teachers.service';
import { downloadCsv, printTable } from '../../../core/utils/table-export.util';
import type {
    CampusGradeItemDto,
    StudentGrowthRecordsQuery,
    Subject as SubjectOption,
    TeacherSummaryDto,
} from '../../../core/models/simplify-api.model';
import { STUDENT_BASE_COLUMNS } from '../data/student-table.mock';
import {
    STUDENT_EMERGENT_BILINGUAL_OPTIONS,
    STUDENT_ETHNICITY_OPTIONS,
    STUDENT_TEST_LANGUAGE_OPTIONS,
    STUDENT_TRISTATE_BOOL_OPTIONS,
    mapStudentTestLanguageForApi,
    studentBoolFilterLabel,
    studentTestLanguageLabel,
} from '../data/student-list-filter-options';
import { mapStudentGrowthRecordToRow } from '../utils/student-growth-record.mapper';
import { buildQuarterDiffColumnDefs } from '../utils/student-quarter-progression.util';
import type { StudentColumnDef, StudentRow } from '../models/student-table.model';

/** Filters sent to GET /api/student-growth-records. */
export interface StudentListFilters {
    campusCode: string | null;
    gradeCode: string | null;
    subjectCode: string | null;
    teacherId: string | null;
    specialEducation: boolean | null;
    economicDisadvantage: boolean | null;
    emergentBilingual: string | null;
    testLanguage: string | null;
    ethnicity: string | null;
}

const EMPTY_STUDENT_LIST_FILTERS: StudentListFilters = {
    campusCode: null,
    gradeCode: null,
    subjectCode: null,
    teacherId: null,
    specialEducation: null,
    economicDisadvantage: null,
    emergentBilingual: null,
    testLanguage: null,
    ethnicity: null,
};

export type StudentFilterChipId =
    | 'campus'
    | 'grade'
    | 'subject'
    | 'teacher'
    | 'specialEducation'
    | 'economicDisadvantage'
    | 'emergentBilingual'
    | 'testLanguage'
    | 'ethnicity';

/**
 * Server-backed state for the students datatable (GET /api/student-growth-records).
 */
@Injectable()
export class StudentsTableService {
    readonly columns = signal<StudentColumnDef[]>(structuredClone(STUDENT_BASE_COLUMNS));
    readonly diffColumnFields = signal<string[]>([]);
    readonly rows = signal<StudentRow[]>([]);
    readonly searchQuery = signal('');
    readonly loading = signal(false);
    readonly loadError = signal<string | null>(null);
    readonly totalCount = signal(0);
    readonly currentOffset = signal(0);
    readonly pageSize = signal(10);
    readonly pageSizeOptions = [10, 20, 50, 100];

    readonly filtersDraft = signal<StudentListFilters>({ ...EMPTY_STUDENT_LIST_FILTERS });
    readonly appliedFilters = signal<StudentListFilters>({ ...EMPTY_STUDENT_LIST_FILTERS });
    readonly filterTeachers = signal<TeacherSummaryDto[]>([]);
    readonly filterCampusGrades = signal<CampusGradeItemDto[]>([]);
    readonly filterSubjects = signal<SubjectOption[]>([]);
    readonly filterOptionsLoading = signal(false);
    readonly filterError = signal<string | null>(null);

    readonly tristateBoolOptions = STUDENT_TRISTATE_BOOL_OPTIONS;
    readonly emergentBilingualOptions = STUDENT_EMERGENT_BILINGUAL_OPTIONS;
    readonly ethnicityOptions = STUDENT_ETHNICITY_OPTIONS;
    readonly testLanguageOptions = STUDENT_TEST_LANGUAGE_OPTIONS;

    private readonly pageRequest$ = new Subject<number>();
    private readonly districtContext = inject(DistrictContextService);
    private readonly adminSetups = inject(AdminSetupsService);
    private readonly studentGrowthRecords = inject(StudentGrowthRecordsService);
    private readonly filtersService = inject(FiltersService);
    private readonly teachersService = inject(TeachersService);
    private readonly route = inject(ActivatedRoute);

    bindLifecycle(destroyRef: DestroyRef): void {
        this.route.queryParamMap
            .pipe(
                map((params) => ({
                    campusCode: params.get('campusCode'),
                    teacherId: params.get('teacherId'),
                })),
                distinctUntilChanged(
                    (a, b) => a.campusCode === b.campusCode && a.teacherId === b.teacherId,
                ),
                tap((scope) => {
                    const next: StudentListFilters = { ...this.emptyFiltersForRole() };
                    if (scope.campusCode && !this.isCampusLockedByRole()) {
                        next.campusCode = scope.campusCode;
                    }
                    if (scope.teacherId) {
                        next.teacherId = scope.teacherId;
                    }
                    this.appliedFilters.set(next);
                    this.filtersDraft.set({ ...next });
                    this.currentOffset.set(0);
                    if (next.campusCode) {
                        this.loadCampusGradesForCampus(next.campusCode, destroyRef);
                        this.loadTeachersForScope(destroyRef);
                    }
                }),
                takeUntilDestroyed(destroyRef),
            )
            .subscribe(() => {
                if (this.districtContext.isGrowthContextReady()) {
                    this.requestPage(0);
                }
            });

        this.pageRequest$
            .pipe(
                switchMap((offset) => {
                    const query = this.buildRecordsQuery(offset);
                    if (!query) {
                        this.resetRows();
                        return of(null);
                    }
                    this.loading.set(true);
                    this.loadError.set(null);
                    this.currentOffset.set(offset);
                    return this.districtContext.ensureDistrictCampuses().pipe(
                        switchMap(() => this.studentGrowthRecords.listRecords(query)),
                        catchError(() => {
                            this.loadError.set('Could not load student growth records.');
                            return of(null);
                        }),
                        finalize(() => this.loading.set(false)),
                    );
                }),
                takeUntilDestroyed(destroyRef),
            )
            .subscribe((page) => {
                if (!page) {
                    if (this.loadError()) {
                        this.rows.set([]);
                        this.totalCount.set(0);
                    }
                    return;
                }
                this.applyPageColumns(page.quarterSequence);
                this.rows.set(
                    page.records.map((record) =>
                        mapStudentGrowthRecordToRow(
                            record,
                            this.districtContext.campuses,
                            page.quarterSequence,
                        ),
                    ),
                );
                this.totalCount.set(page.totalCount);
            });

        this.districtContext.selection$
            .pipe(
                distinctUntilChanged(
                    (a, b) =>
                        a.districtId === b.districtId &&
                        a.academicYearId === b.academicYearId &&
                        a.quarterCode === b.quarterCode,
                ),
                tap(() => {
                    this.currentOffset.set(0);
                    this.searchQuery.set('');
                    this.resetFilters();
                    if (!this.districtContext.isGrowthContextReady()) {
                        this.resetRows();
                    }
                }),
                takeUntilDestroyed(destroyRef),
            )
            .subscribe(() => {
                if (this.districtContext.isGrowthContextReady()) {
                    this.loadFilterOptions(destroyRef);
                    this.requestPage(0);
                }
            });
    }

    get hasActiveFilters(): boolean {
        const f = this.appliedFilters();
        return (
            f.campusCode != null ||
            f.gradeCode != null ||
            f.subjectCode != null ||
            f.teacherId != null ||
            f.specialEducation != null ||
            f.economicDisadvantage != null ||
            f.emergentBilingual != null ||
            f.testLanguage != null ||
            f.ethnicity != null
        );
    }

    get canClearFilters(): boolean {
        const draft = this.filtersDraft();
        return (
            this.hasActiveFilters ||
            draft.campusCode != null ||
            draft.gradeCode != null ||
            draft.subjectCode != null ||
            draft.teacherId != null ||
            draft.specialEducation != null ||
            draft.economicDisadvantage != null ||
            draft.emergentBilingual != null ||
            draft.testLanguage != null ||
            draft.ethnicity != null
        );
    }

    get activeFilterChips(): Array<{ id: StudentFilterChipId; label: string }> {
        const chips: Array<{ id: StudentFilterChipId; label: string }> = [];
        const f = this.appliedFilters();

        if (f.campusCode) {
            const campus = this.districtContext.campuses.find((c) => c.campusCode === f.campusCode);
            chips.push({
                id: 'campus',
                label: `Campus: ${campus?.campusName || f.campusCode}`,
            });
        }
        if (f.gradeCode) {
            const grade = this.filterCampusGrades().find((g) => g.gradeCode === f.gradeCode);
            chips.push({
                id: 'grade',
                label: `Grade: ${grade?.gradeName || grade?.gradeCode || f.gradeCode}`,
            });
        }
        if (f.subjectCode) {
            const subject = this.filterSubjects().find((s) => s.subjectCode === f.subjectCode);
            chips.push({
                id: 'subject',
                label: `Subject: ${subject?.subjectName || subject?.subjectCode || f.subjectCode}`,
            });
        }
        if (f.teacherId) {
            const teacher = this.filterTeachers().find(
                (t) => this.teacherFilterValue(t) === f.teacherId,
            );
            chips.push({
                id: 'teacher',
                label: `Teacher: ${teacher ? this.teacherDisplayName(teacher) : f.teacherId}`,
            });
        }
        if (f.specialEducation != null) {
            chips.push({
                id: 'specialEducation',
                label: `Special Education: ${studentBoolFilterLabel(f.specialEducation)}`,
            });
        }
        if (f.economicDisadvantage != null) {
            chips.push({
                id: 'economicDisadvantage',
                label: `Economic Disadvantage: ${studentBoolFilterLabel(f.economicDisadvantage)}`,
            });
        }
        if (f.emergentBilingual) {
            chips.push({
                id: 'emergentBilingual',
                label: `Emergent Bilingual: ${f.emergentBilingual}`,
            });
        }
        if (f.testLanguage) {
            chips.push({
                id: 'testLanguage',
                label: `Test Language: ${studentTestLanguageLabel(f.testLanguage)}`,
            });
        }
        if (f.ethnicity) {
            chips.push({
                id: 'ethnicity',
                label: `Ethnicity: ${f.ethnicity}`,
            });
        }

        return chips;
    }

    setFilterDraftField<K extends keyof StudentListFilters>(
        field: K,
        value: StudentListFilters[K],
    ): void {
        this.filtersDraft.update((draft) => ({ ...draft, [field]: value }));
    }

    onCampusDraftChange(campusCode: string | null, destroyRef: DestroyRef): void {
        this.setFilterDraftField('campusCode', campusCode || null);
        this.setFilterDraftField('teacherId', null);
        this.setFilterDraftField('gradeCode', null);
        this.filterTeachers.set([]);
        this.filterCampusGrades.set([]);
        if (campusCode) {
            this.loadCampusGradesForCampus(campusCode, destroyRef);
            this.loadTeachersForScope(destroyRef);
        }
    }

    onGradeDraftChange(gradeCode: string | null, destroyRef: DestroyRef): void {
        this.setFilterDraftField('gradeCode', gradeCode || null);
        this.setFilterDraftField('teacherId', null);
        if (this.filtersDraft().campusCode) {
            this.loadTeachersForScope(destroyRef);
        }
    }

    onSubjectDraftChange(subjectCode: string | null, destroyRef: DestroyRef): void {
        this.setFilterDraftField('subjectCode', subjectCode || null);
        this.setFilterDraftField('teacherId', null);
        if (this.filtersDraft().campusCode) {
            this.loadTeachersForScope(destroyRef);
        }
    }

    teacherFilterValue(teacher: TeacherSummaryDto): string | null {
        const external = teacher.teacherIdExternal?.trim();
        return external || null;
    }

    teacherDisplayName(teacher: TeacherSummaryDto): string {
        return (
            teacher.teacherName?.trim() ||
            teacher.teacherIdExternal?.trim() ||
            (teacher.teacherId != null && teacher.teacherId !== ''
                ? String(teacher.teacherId)
                : '') ||
            'Unknown teacher'
        );
    }

    applyFilters(destroyRef: DestroyRef): void {
        this.filterError.set(null);
        const draft = this.filtersDraft();
        this.appliedFilters.set({ ...draft });
        if (draft.campusCode) {
            this.loadTeachersForScope(destroyRef);
        }
        this.requestPage(0);
    }

    clearFilters(destroyRef: DestroyRef): void {
        this.filterError.set(null);
        const defaults = this.emptyFiltersForRole();
        this.filtersDraft.set({ ...defaults });
        this.appliedFilters.set({ ...defaults });
        this.filterTeachers.set([]);
        this.filterCampusGrades.set([]);
        if (defaults.campusCode) {
            this.loadCampusGradesForCampus(defaults.campusCode, destroyRef);
            this.loadTeachersForScope(destroyRef);
        }
        if (this.districtContext.isGrowthContextReady()) {
            this.requestPage(0);
        }
    }

    removeFilterChip(id: StudentFilterChipId, destroyRef: DestroyRef): void {
        const draft = { ...this.filtersDraft() };
        switch (id) {
            case 'campus':
                if (this.isCampusLockedByRole()) {
                    return;
                }
                draft.campusCode = null;
                draft.teacherId = null;
                draft.gradeCode = null;
                this.filterTeachers.set([]);
                this.filterCampusGrades.set([]);
                break;
            case 'grade':
                draft.gradeCode = null;
                break;
            case 'subject':
                draft.subjectCode = null;
                break;
            case 'teacher':
                draft.teacherId = null;
                break;
            case 'specialEducation':
                draft.specialEducation = null;
                break;
            case 'economicDisadvantage':
                draft.economicDisadvantage = null;
                break;
            case 'emergentBilingual':
                draft.emergentBilingual = null;
                break;
            case 'testLanguage':
                draft.testLanguage = null;
                break;
            case 'ethnicity':
                draft.ethnicity = null;
                break;
        }
        this.filtersDraft.set(draft);
        this.applyFilters(destroyRef);
    }

    get totalServerPages(): number {
        const total = this.totalCount();
        if (total <= 0) {
            return 0;
        }
        return Math.ceil(total / this.pageSize());
    }

    get currentServerPage(): number {
        return Math.floor(this.currentOffset() / this.pageSize()) + 1;
    }

    get rangeStart(): number {
        return this.totalCount() === 0 ? 0 : this.currentOffset() + 1;
    }

    get rangeEnd(): number {
        return Math.min(this.currentOffset() + this.rows().length, this.totalCount());
    }

    setSearchQuery(value: string): void {
        this.searchQuery.set(value);
    }

    onColumnVisibleChange(field: string, visible: boolean): void {
        this.columns.update((cols) =>
            cols.map((c) => (c.field === field ? { ...c, hide: !visible } : c)),
        );
    }

    onPageSizeChange(raw: number | string): void {
        const size = Number(raw);
        if (!Number.isFinite(size) || size < 1 || size === this.pageSize()) {
            return;
        }
        this.pageSize.set(size);
        this.requestPage(0);
    }

    firstServerPage(): void {
        if (this.currentOffset() > 0 && !this.loading()) {
            this.requestPage(0);
        }
    }

    prevServerPage(): void {
        if (this.currentOffset() > 0 && !this.loading()) {
            this.requestPage(Math.max(0, this.currentOffset() - this.pageSize()));
        }
    }

    nextServerPage(): void {
        if (!this.loading() && this.currentOffset() + this.pageSize() < this.totalCount()) {
            this.requestPage(this.currentOffset() + this.pageSize());
        }
    }

    lastServerPage(): void {
        const totalPages = this.totalServerPages;
        if (totalPages > 0 && !this.loading()) {
            this.requestPage(Math.max(0, (totalPages - 1) * this.pageSize()));
        }
    }

    goToServerPage(page: number): void {
        if (
            this.loading() ||
            page < 1 ||
            page > this.totalServerPages ||
            page === this.currentServerPage
        ) {
            return;
        }
        this.requestPage((page - 1) * this.pageSize());
    }

    get visiblePageNumbers(): number[] {
        const total = this.totalServerPages;
        if (total <= 0) {
            return [];
        }
        const windowSize = 5;
        let start = Math.max(1, this.currentServerPage - Math.floor(windowSize / 2));
        let end = Math.min(total, start + windowSize - 1);
        start = Math.max(1, end - windowSize + 1);
        return Array.from({ length: end - start + 1 }, (_, i) => start + i);
    }

    exportTable(kind: 'csv' | 'print'): void {
        const cols = this.columns().map((c) => ({ field: c.field, title: c.title, hide: c.hide }));
        const title = 'Students';
        const rows = this.rows();
        if (!rows.length) {
            return;
        }
        if (kind === 'csv') {
            downloadCsv('students', cols, rows);
        } else {
            printTable(title, cols, rows);
        }
    }

    quarterDiffValue(row: StudentRow, field: string): number | null {
        const value = row[field];
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }

    private loadFilterOptions(destroyRef: DestroyRef): void {
        const districtId = this.districtContext.selection.districtId;
        if (districtId == null) {
            this.filterSubjects.set([]);
            return;
        }

        this.filterOptionsLoading.set(true);
        forkJoin([
            this.districtContext.ensureDistrictCampuses(),
            this.filtersService.listSubjects({ activeOnly: true }).pipe(
                catchError(() => of<SubjectOption[]>([])),
            ),
        ])
            .pipe(
                tap(([, subjects]) => {
                    this.filterSubjects.set(subjects);
                    this.applyRoleDefaultCampusIfNeeded(destroyRef);
                    const applied = this.appliedFilters();
                    if (applied.campusCode) {
                        this.filtersDraft.set({ ...applied });
                        this.loadCampusGradesForCampus(applied.campusCode, destroyRef);
                        this.loadTeachersForScope(destroyRef);
                    }
                }),
                finalize(() => this.filterOptionsLoading.set(false)),
                takeUntilDestroyed(destroyRef),
            )
            .subscribe();
    }

    private loadCampusGradesForCampus(campusCode: string, destroyRef: DestroyRef): void {
        const districtId = this.districtContext.selection.districtId;
        const trimmed = campusCode?.trim();
        if (districtId == null || !trimmed) {
            this.filterCampusGrades.set([]);
            return;
        }

        const campus = this.districtContext.campuses.find((c) => c.campusCode === trimmed);
        if (!campus?.campusId) {
            this.filterCampusGrades.set([]);
            return;
        }

        this.adminSetups
            .listCampusGrades({
                districtId,
                campusId: campus.campusId,
                activeOnly: false,
            })
            .pipe(
                catchError(() => of<CampusGradeItemDto[]>([])),
                takeUntilDestroyed(destroyRef),
            )
            .subscribe((rows) => {
                this.filterCampusGrades.set(rows);
                const gradeCode = this.filtersDraft().gradeCode;
                if (gradeCode && !rows.some((row) => row.gradeCode === gradeCode)) {
                    this.filtersDraft.update((f) => ({ ...f, gradeCode: null }));
                    this.appliedFilters.update((f) => ({ ...f, gradeCode: null }));
                }
            });
    }

    private loadTeachersForScope(destroyRef: DestroyRef): void {
        const base = this.districtContext.baseGrowthPayload();
        const draft = this.filtersDraft();
        const campusCode = draft.campusCode?.trim();
        if (!base || !campusCode) {
            this.filterTeachers.set([]);
            return;
        }

        this.teachersService
            .listTeachersByScope({
                districtId: base.districtId,
                academicYearId: base.academicYearId,
                campusCode,
                gradeCode: draft.gradeCode,
                subjectCode: draft.subjectCode,
            })
            .pipe(
                catchError(() => of<TeacherSummaryDto[]>([])),
                takeUntilDestroyed(destroyRef),
            )
            .subscribe((rows) => {
                this.filterTeachers.set(rows);
                const selectedTeacherId = this.filtersDraft().teacherId?.trim();
                if (!selectedTeacherId) {
                    return;
                }

                if (rows.some((t) => this.teacherFilterValue(t) === selectedTeacherId)) {
                    return;
                }

                const matchedByInternalId = rows.find(
                    (t) => t.teacherId != null && String(t.teacherId) === selectedTeacherId,
                );
                const externalTeacherId = matchedByInternalId?.teacherIdExternal?.trim();
                if (externalTeacherId) {
                    this.filtersDraft.update((f) => ({ ...f, teacherId: externalTeacherId }));
                    this.appliedFilters.update((f) => ({ ...f, teacherId: externalTeacherId }));
                    if (this.districtContext.isGrowthContextReady()) {
                        this.requestPage(0);
                    }
                    return;
                }

                this.filtersDraft.update((f) => ({ ...f, teacherId: null }));
                this.appliedFilters.update((f) => ({ ...f, teacherId: null }));
            });
    }

    private resetFilters(): void {
        const defaults = this.emptyFiltersForRole();
        this.filtersDraft.set({ ...defaults });
        this.appliedFilters.set({ ...defaults });
        this.filterTeachers.set([]);
        this.filterCampusGrades.set([]);
        this.filterError.set(null);
    }

    /** Campus code from active role (Principal / Teacher), once district campuses are loaded. */
    private resolveRoleCampusCode(): string | null {
        const scope = this.districtContext.roleScopePayload();
        if (scope.campusCode) {
            return scope.campusCode;
        }
        if (scope.campusId != null) {
            return this.districtContext.findCampusById(scope.campusId)?.campusCode ?? null;
        }
        return null;
    }

    private isCampusLockedByRole(): boolean {
        return this.resolveRoleCampusCode() != null;
    }

    private emptyFiltersForRole(): StudentListFilters {
        return {
            ...EMPTY_STUDENT_LIST_FILTERS,
            campusCode: this.resolveRoleCampusCode(),
        };
    }

    private applyRoleDefaultCampusIfNeeded(destroyRef: DestroyRef): void {
        const scopedCode = this.resolveRoleCampusCode();
        if (!scopedCode) {
            return;
        }
        const applied = this.appliedFilters();
        if (applied.campusCode === scopedCode) {
            return;
        }
        const next: StudentListFilters = {
            ...applied,
            campusCode: scopedCode,
            gradeCode: null,
            teacherId: null,
        };
        this.appliedFilters.set(next);
        this.filtersDraft.set({ ...next });
        this.loadCampusGradesForCampus(scopedCode, destroyRef);
        this.loadTeachersForScope(destroyRef);
    }

    private applyPageColumns(quarterSequence?: string[] | null): void {
        const diffCols = buildQuarterDiffColumnDefs(quarterSequence);
        const previousHide = new Map(this.columns().map((col) => [col.field, col.hide]));

        const base = STUDENT_BASE_COLUMNS.map((col) => ({
            ...col,
            search: col.search !== false,
            hide: previousHide.get(col.field) ?? col.hide,
        }));
        const dynamic = diffCols.map((col) => ({
            ...col,
            search: col.search !== false,
            hide: previousHide.get(col.field) ?? false,
        }));

        this.columns.set([...base, ...dynamic]);
        this.diffColumnFields.set(diffCols.map((col) => col.field));
    }

    private requestPage(offset: number): void {
        this.pageRequest$.next(offset);
    }

    private resetRows(): void {
        this.rows.set([]);
        this.totalCount.set(0);
        this.loadError.set(null);
        this.currentOffset.set(0);
        this.columns.set(structuredClone(STUDENT_BASE_COLUMNS));
        this.diffColumnFields.set([]);
    }

    private buildRecordsQuery(offset: number): StudentGrowthRecordsQuery | null {
        const base = this.districtContext.baseGrowthPayload();
        if (!base) {
            return null;
        }
        const f = this.appliedFilters();
        const campusCode = f.campusCode ?? this.resolveRoleCampusCode();

        return {
            districtId: base.districtId,
            academicYearId: base.academicYearId,
            quarterCode: base.quarterCode,
            offset,
            limit: this.pageSize(),
            campusCode,
            gradeCode: f.gradeCode,
            subjectCode: f.subjectCode,
            teacherId: f.teacherId,
            specialEducation: f.specialEducation,
            economicDisadvantage: f.economicDisadvantage,
            emergentBilingual: f.emergentBilingual,
            testLanguage: mapStudentTestLanguageForApi(f.testLanguage),
            ethnicity: f.ethnicity,
        };
    }
}
