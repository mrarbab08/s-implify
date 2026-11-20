import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize, catchError } from 'rxjs/operators';
import { forkJoin, of } from 'rxjs';
import Swal from 'sweetalert2';
import { NgxCustomModalComponent } from 'ngx-custom-modal';
import { AdminSetupsService } from '../../../../core/services/admin-setups.service';
import { AuthService } from '../../../../core/services/auth.service';
import type {
    AcademicYear,
    AcademicYearRequest,
    Campus,
    CampusCategory,
    CampusCategoryRequest,
    CampusRequest,
    District,
    DistrictAcademy,
    DistrictAcademyRequest,
    DistrictQuarter,
    DistrictQuarterRequest,
    DistrictRequest,
    Grade,
    GradeRequest,
    State,
    StateRequest,
    Subject,
    SubjectRequest,
} from '../../../../core/models/simplify-api.model';
import { SharedModule } from '../../../../shared/shared.module';

type SetupTab =
    | 'states'
    | 'districts'
    | 'quarters'
    | 'academies'
    | 'grades'
    | 'categories'
    | 'campuses'
    | 'campusGrades'
    | 'subjects'
    | 'districtSubjects'
    | 'academicYears';

@Component({
    selector: 'app-user-setups',
    templateUrl: './user-setups.component.html',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink, SharedModule],
})
export class UserSetupsComponent implements OnInit {
    @ViewChild('setupModal') setupModal?: NgxCustomModalComponent;

    readonly quarterCodeOptions: { code: string; name: string; sortOrder: number }[] = [
        { code: 'BOY', name: 'Beginning of Year', sortOrder: 1 },
        { code: 'PA1', name: 'Progress Assessment 1', sortOrder: 2 },
        { code: 'PA2', name: 'Progress Assessment 2', sortOrder: 3 },
        { code: 'MOY', name: 'Middle of Year', sortOrder: 4 },
        { code: 'PA3', name: 'Progress Assessment 3', sortOrder: 5 },
        { code: 'PA4', name: 'Progress Assessment 4', sortOrder: 6 },
        { code: 'PA5', name: 'Progress Assessment 5', sortOrder: 7 },
        { code: 'EOY', name: 'End of Year', sortOrder: 8 },
    ];

    activeTab: SetupTab = 'states';

    states: State[] = [];
    districts: District[] = [];
    quarters: DistrictQuarter[] = [];
    academies: DistrictAcademy[] = [];
    grades: Grade[] = [];
    campusCategories: CampusCategory[] = [];
    campuses: Campus[] = [];
    campusGradeCampuses: Campus[] = [];
    subjects: Subject[] = [];
    masterSubjects: Subject[] = [];
    academicYears: AcademicYear[] = [];

    statesLoading = false;
    districtsLoading = false;
    quartersLoading = false;
    academiesLoading = false;
    gradesLoading = false;
    categoriesLoading = false;
    campusesLoading = false;
    campusGradesLoading = false;
    subjectsLoading = false;
    districtSubjectsLoading = false;
    academicYearsLoading = false;

    stateSaving = false;
    districtSaving = false;
    quarterSaving = false;
    academySaving = false;
    gradeSaving = false;
    categorySaving = false;
    campusSaving = false;
    campusGradesSaving = false;
    subjectSaving = false;
    districtSubjectsSaving = false;
    academicYearSaving = false;

    editingStateId: number | null = null;
    editingDistrictId: number | null = null;
    editingQuarterId: number | null = null;
    editingAcademyId: number | null = null;
    editingGradeId: number | null = null;
    editingCategoryId: number | null = null;
    editingCampusId: number | null = null;
    editingSubjectId: number | null = null;
    editingAcademicYearId: number | null = null;

    stateForm: StateRequest = this.emptyStateForm();
    districtForm: DistrictRequest = this.emptyDistrictForm();
    quarterForm: DistrictQuarterRequest = this.emptyQuarterForm();
    academyForm: DistrictAcademyRequest = this.emptyAcademyForm();
    gradeForm: GradeRequest = this.emptyGradeForm();
    categoryForm: CampusCategoryRequest = this.emptyCategoryForm();
    campusForm: CampusRequest = this.emptyCampusForm();
    subjectForm: SubjectRequest = this.emptySubjectForm();
    academicYearForm: AcademicYearRequest = this.emptyAcademicYearForm();

    districtFilterStateId: number | null = null;
    quarterFilterDistrictId: number | null = null;
    quarterFilterAcademicYearId: number | null = null;
    academyFilterDistrictId: number | null = null;
    campusFilterDistrictId: number | null = null;
    campusGradeFilterDistrictId: number | null = null;
    campusGradeFilterCampusId: number | null = null;
    campusGradeSearch = '';
    selectedCampusGradeIds = new Set<number>();
    savedCampusGradeIds = new Set<number>();
    subjectFilterActiveOnly = false;
    districtSubjectFilterDistrictId: number | null = null;
    districtSubjectSearch = '';
    selectedDistrictSubjectIds = new Set<number>();
    savedDistrictSubjectIds = new Set<number>();

    constructor(
        private admin: AdminSetupsService,
        private auth: AuthService,
        private cdr: ChangeDetectorRef,
    ) {}

    ngOnInit(): void {
        this.loadStates();
    }

    setupModalTitle(): string {
        const action = this.isEditingCurrentTab() ? 'Edit' : 'Add';
        const labels: Record<SetupTab, string> = {
            states: 'state',
            districts: 'district',
            quarters: 'district quarter',
            academies: 'district academy',
            grades: 'grade',
            categories: 'campus category',
            campuses: 'campus',
            campusGrades: 'campus grade',
            subjects: 'subject',
            districtSubjects: 'district subject association',
            academicYears: 'academic year',
        };
        return `${action} ${labels[this.activeTab]}`;
    }

    setupModalSubtitle(): string {
        return this.isEditingCurrentTab()
            ? 'Update the fields below and save your changes.'
            : 'Fill in the details below to create a new record.';
    }

    openSetupModal(): void {
        this.setupModal?.open();
    }

    closeSetupModal(): void {
        this.setupModal?.close();
    }

    closeSetupModalForTab(): void {
        switch (this.activeTab) {
            case 'states':
                this.cancelStateForm();
                break;
            case 'districts':
                this.cancelDistrictForm();
                break;
            case 'quarters':
                this.cancelQuarterForm();
                break;
            case 'academies':
                this.cancelAcademyForm();
                break;
            case 'grades':
                this.cancelGradeForm();
                break;
            case 'categories':
                this.cancelCategoryForm();
                break;
            case 'campuses':
                this.cancelCampusForm();
                break;
            case 'campusGrades':
                break;
            case 'subjects':
                this.cancelSubjectForm();
                break;
            case 'districtSubjects':
                break;
            case 'academicYears':
                this.cancelAcademicYearForm();
                break;
        }
    }

    private isEditingCurrentTab(): boolean {
        switch (this.activeTab) {
            case 'states':
                return this.editingStateId != null;
            case 'districts':
                return this.editingDistrictId != null;
            case 'quarters':
                return this.editingQuarterId != null;
            case 'academies':
                return this.editingAcademyId != null;
            case 'grades':
                return this.editingGradeId != null;
            case 'categories':
                return this.editingCategoryId != null;
            case 'campuses':
                return this.editingCampusId != null;
            case 'campusGrades':
                return false;
            case 'subjects':
                return this.editingSubjectId != null;
            case 'districtSubjects':
                return false;
            case 'academicYears':
                return this.editingAcademicYearId != null;
        }
    }

    setTab(tab: SetupTab): void {
        this.activeTab = tab;
        if (tab === 'states') {
            this.loadStates();
        } else if (tab === 'districts') {
            this.loadStates();
            this.loadDistricts();
        } else if (tab === 'quarters') {
            this.loadDistrictsForScope(() => {
                this.loadAcademicYears(() => this.loadQuarters());
            });
        } else if (tab === 'academies') {
            this.loadDistrictsForScope(() => this.loadAcademies());
        } else if (tab === 'grades') {
            this.loadGrades();
        } else if (tab === 'categories') {
            this.loadCampusCategories();
        } else if (tab === 'campuses') {
            this.loadDistrictsForScope(() => {
                this.loadCampusCategories(() => this.loadCampuses());
            });
        } else if (tab === 'campusGrades') {
            this.loadGrades();
            this.loadDistrictsForScope(() => {
                if (this.campusGradeFilterDistrictId == null && this.districts.length) {
                    this.campusGradeFilterDistrictId = this.districts[0].districtId;
                }
                this.loadCampusGradeCampuses(() => this.loadCampusGradeAssociations());
            });
        } else if (tab === 'subjects') {
            this.loadSubjects();
        } else if (tab === 'districtSubjects') {
            this.loadDistrictsForScope(() => this.loadDistrictSubjectAssociations());
        } else if (tab === 'academicYears') {
            this.loadAcademicYears();
        }
    }

    loadStates(): void {
        this.statesLoading = true;
        this.cdr.markForCheck();
        this.admin
            .listStates(false)
            .pipe(
                finalize(() => {
                    this.statesLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.states = rows;
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.toastError('Failed to load states', err);
                    this.cdr.markForCheck();
                },
            });
    }

    loadDistricts(): void {
        this.districtsLoading = true;
        this.cdr.markForCheck();
        this.admin
            .listDistricts({
                stateId: this.districtFilterStateId ?? undefined,
                activeOnly: false,
            })
            .pipe(
                finalize(() => {
                    this.districtsLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.districts = rows;
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.toastError('Failed to load districts', err);
                    this.cdr.markForCheck();
                },
            });
    }

    /** District list for quarter/academy tabs. */
    loadDistrictsForScope(then?: () => void): void {
        this.admin.listDistricts({ activeOnly: false }).subscribe({
            next: (rows) => {
                this.districts = rows;
                this.cdr.markForCheck();
                then?.();
            },
            error: () => {
                this.districts = [];
                this.cdr.markForCheck();
                then?.();
            },
        });
    }

    loadQuarters(): void {
        this.quartersLoading = true;
        this.cdr.markForCheck();
        this.admin
            .listDistrictQuarters({
                districtId: this.quarterFilterDistrictId ?? undefined,
                academicYearId: this.quarterFilterAcademicYearId ?? undefined,
                activeOnly: false,
            })
            .pipe(
                finalize(() => {
                    this.quartersLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.quarters = rows;
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.toastError('Failed to load district quarters', err);
                    this.cdr.markForCheck();
                },
            });
    }

    loadAcademies(): void {
        this.academiesLoading = true;
        this.cdr.markForCheck();
        this.admin
            .listDistrictAcademies({
                districtId: this.academyFilterDistrictId ?? undefined,
                activeOnly: false,
            })
            .pipe(
                finalize(() => {
                    this.academiesLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.academies = rows;
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.toastError('Failed to load district academies', err);
                    this.cdr.markForCheck();
                },
            });
    }

    loadGrades(): void {
        this.gradesLoading = true;
        this.cdr.markForCheck();
        this.admin
            .listGrades(false)
            .pipe(
                finalize(() => {
                    this.gradesLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.grades = rows;
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.toastError('Failed to load grades', err);
                    this.cdr.markForCheck();
                },
            });
    }

    onDistrictFilterChange(): void {
        this.loadDistricts();
    }

    onQuarterFilterChange(): void {
        this.loadQuarters();
    }

    onAcademyFilterChange(): void {
        this.loadAcademies();
    }

    onCampusFilterChange(): void {
        this.loadCampuses();
    }

    onCampusGradeDistrictFilterChange(): void {
        this.campusGradeFilterCampusId = null;
        this.selectedCampusGradeIds = new Set();
        this.savedCampusGradeIds = new Set();
        if (this.campusGradeFilterDistrictId == null) {
            this.campusGradeCampuses = [];
            this.cdr.markForCheck();
            return;
        }
        this.loadCampusGradeCampuses(() => this.loadCampusGradeAssociations());
    }

    onCampusGradeCampusFilterChange(): void {
        this.loadCampusGradeAssociations();
    }

    get filteredCampusGradesForAssociation(): Grade[] {
        const q = this.campusGradeSearch.trim().toLowerCase();
        if (!q) {
            return this.grades;
        }
        return this.grades.filter(
            (g) =>
                g.gradeCode.toLowerCase().includes(q) ||
                (g.gradeName ?? '').toLowerCase().includes(q),
        );
    }

    get campusGradeSelectedCount(): number {
        return this.selectedCampusGradeIds.size;
    }

    get campusGradesHasUnsavedChanges(): boolean {
        if (this.selectedCampusGradeIds.size !== this.savedCampusGradeIds.size) {
            return true;
        }
        for (const id of this.selectedCampusGradeIds) {
            if (!this.savedCampusGradeIds.has(id)) {
                return true;
            }
        }
        return false;
    }

    get allFilteredCampusGradesSelected(): boolean {
        const visible = this.filteredCampusGradesForAssociation;
        return (
            visible.length > 0 &&
            visible.every((g) => this.selectedCampusGradeIds.has(g.gradeId))
        );
    }

    isCampusGradeSelected(gradeId: number): boolean {
        return this.selectedCampusGradeIds.has(gradeId);
    }

    toggleCampusGrade(gradeId: number, checked: boolean): void {
        if (checked) {
            this.selectedCampusGradeIds.add(gradeId);
        } else {
            this.selectedCampusGradeIds.delete(gradeId);
        }
        this.cdr.markForCheck();
    }

    toggleSelectAllCampusGrades(checked: boolean): void {
        for (const grade of this.filteredCampusGradesForAssociation) {
            if (checked) {
                this.selectedCampusGradeIds.add(grade.gradeId);
            } else {
                this.selectedCampusGradeIds.delete(grade.gradeId);
            }
        }
        this.cdr.markForCheck();
    }

    resetCampusGradeSelection(): void {
        this.selectedCampusGradeIds = new Set(this.savedCampusGradeIds);
        this.cdr.markForCheck();
    }

    saveCampusGradeAssociations(): void {
        const districtId = this.campusGradeFilterDistrictId;
        const campusId = this.campusGradeFilterCampusId;
        if (districtId == null) {
            this.toast('Select a district first.', 'warning');
            return;
        }
        if (campusId == null) {
            this.toast('Select a campus first.', 'warning');
            return;
        }

        this.campusGradesSaving = true;
        this.cdr.markForCheck();
        this.admin
            .syncCampusGrades({
                districtId,
                campusId,
                gradeIds: [...this.selectedCampusGradeIds],
                updatedBy: this.auditUser(),
            })
            .pipe(
                finalize(() => {
                    this.campusGradesSaving = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.savedCampusGradeIds = new Set(rows.map((r) => r.gradeId));
                    this.selectedCampusGradeIds = new Set(this.savedCampusGradeIds);
                    this.toast(
                        this.savedCampusGradeIds.size
                            ? 'Campus grades synced.'
                            : 'All campus grade associations cleared.',
                        'success',
                    );
                    this.cdr.markForCheck();
                },
                error: (err) => this.toastError('Failed to sync campus grades', err),
            });
    }

    onSubjectFilterChange(): void {
        this.loadSubjects();
    }

    onDistrictSubjectFilterChange(): void {
        this.districtSubjectSearch = '';
        this.loadDistrictSubjectAssociations();
    }

    get filteredMasterSubjects(): Subject[] {
        const q = this.districtSubjectSearch.trim().toLowerCase();
        if (!q) {
            return this.masterSubjects;
        }
        return this.masterSubjects.filter(
            (s) =>
                s.subjectCode.toLowerCase().includes(q) ||
                s.subjectName.toLowerCase().includes(q),
        );
    }

    get districtSubjectSelectedCount(): number {
        return this.selectedDistrictSubjectIds.size;
    }

    get districtSubjectsHasUnsavedChanges(): boolean {
        if (this.selectedDistrictSubjectIds.size !== this.savedDistrictSubjectIds.size) {
            return true;
        }
        for (const id of this.selectedDistrictSubjectIds) {
            if (!this.savedDistrictSubjectIds.has(id)) {
                return true;
            }
        }
        return false;
    }

    get allFilteredDistrictSubjectsSelected(): boolean {
        const visible = this.filteredMasterSubjects;
        return (
            visible.length > 0 &&
            visible.every((s) => this.selectedDistrictSubjectIds.has(s.subjectId))
        );
    }

    isDistrictSubjectSelected(subjectId: number): boolean {
        return this.selectedDistrictSubjectIds.has(subjectId);
    }

    toggleDistrictSubject(subjectId: number, checked: boolean): void {
        if (checked) {
            this.selectedDistrictSubjectIds.add(subjectId);
        } else {
            this.selectedDistrictSubjectIds.delete(subjectId);
        }
        this.cdr.markForCheck();
    }

    toggleSelectAllDistrictSubjects(checked: boolean): void {
        for (const subject of this.filteredMasterSubjects) {
            if (checked) {
                this.selectedDistrictSubjectIds.add(subject.subjectId);
            } else {
                this.selectedDistrictSubjectIds.delete(subject.subjectId);
            }
        }
        this.cdr.markForCheck();
    }

    resetDistrictSubjectSelection(): void {
        this.selectedDistrictSubjectIds = new Set(this.savedDistrictSubjectIds);
        this.cdr.markForCheck();
    }

    saveDistrictSubjectAssociations(): void {
        const districtId = this.districtSubjectFilterDistrictId;
        if (districtId == null) {
            this.toast('Select a district first.', 'warning');
            return;
        }

        this.districtSubjectsSaving = true;
        this.cdr.markForCheck();
        this.admin
            .syncDistrictSubjects({
                districtId,
                subjectIds: [...this.selectedDistrictSubjectIds],
                updatedBy: this.auditUser(),
            })
            .pipe(
                finalize(() => {
                    this.districtSubjectsSaving = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.savedDistrictSubjectIds = new Set(rows.map((r) => r.subjectId));
                    this.selectedDistrictSubjectIds = new Set(this.savedDistrictSubjectIds);
                    this.toast(
                        this.savedDistrictSubjectIds.size
                            ? 'District subjects synced.'
                            : 'All district subject associations cleared.',
                        'success',
                    );
                    this.cdr.markForCheck();
                },
                error: (err) => this.toastError('Failed to sync district subjects', err),
            });
    }

    loadDistrictSubjectAssociations(): void {
        const districtId =
            this.districtSubjectFilterDistrictId ?? this.districts[0]?.districtId ?? null;
        if (districtId == null) {
            this.masterSubjects = [];
            this.selectedDistrictSubjectIds = new Set();
            this.savedDistrictSubjectIds = new Set();
            this.cdr.markForCheck();
            return;
        }
        if (this.districtSubjectFilterDistrictId == null) {
            this.districtSubjectFilterDistrictId = districtId;
        }

        this.districtSubjectsLoading = true;
        this.cdr.markForCheck();
        forkJoin([
            this.admin.listSubjects({ activeOnly: false }).pipe(catchError(() => of<Subject[]>([]))),
            this.admin.listDistrictSubjects(districtId).pipe(catchError(() => of([]))),
        ])
            .pipe(
                finalize(() => {
                    this.districtSubjectsLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: ([master, linked]) => {
                    this.masterSubjects = master;
                    this.savedDistrictSubjectIds = new Set(linked.map((r) => r.subjectId));
                    this.selectedDistrictSubjectIds = new Set(this.savedDistrictSubjectIds);
                    this.cdr.markForCheck();
                },
                error: (err) => this.toastError('Failed to load district subjects', err),
            });
    }

    loadCampusGradeCampuses(then?: () => void): void {
        const districtId = this.campusGradeFilterDistrictId;
        if (districtId == null) {
            this.campusGradeCampuses = [];
            this.cdr.markForCheck();
            then?.();
            return;
        }
        this.admin.listCampuses({ districtId, activeOnly: false }).subscribe({
            next: (rows) => {
                this.campusGradeCampuses = rows;
                this.cdr.markForCheck();
                then?.();
            },
            error: () => {
                this.campusGradeCampuses = [];
                this.cdr.markForCheck();
                then?.();
            },
        });
    }

    loadCampusGradeAssociations(): void {
        const districtId = this.campusGradeFilterDistrictId;
        const campusId = this.campusGradeFilterCampusId;
        if (districtId == null || campusId == null) {
            this.selectedCampusGradeIds = new Set();
            this.savedCampusGradeIds = new Set();
            this.campusGradesLoading = false;
            this.cdr.markForCheck();
            return;
        }

        this.campusGradesLoading = true;
        this.cdr.markForCheck();
        forkJoin([
            this.admin.listGrades(false).pipe(catchError(() => of<Grade[]>([]))),
            this.admin
                .listCampusGrades({ districtId, campusId, activeOnly: false })
                .pipe(catchError(() => of([]))),
        ])
            .pipe(
                finalize(() => {
                    this.campusGradesLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: ([master, linked]) => {
                    this.grades = master;
                    this.savedCampusGradeIds = new Set(linked.map((r) => r.gradeId));
                    this.selectedCampusGradeIds = new Set(this.savedCampusGradeIds);
                    this.cdr.markForCheck();
                },
                error: (err) => this.toastError('Failed to load campus grades', err),
            });
    }

    loadSubjects(): void {
        this.subjectsLoading = true;
        this.cdr.markForCheck();
        this.admin
            .listSubjects({ activeOnly: this.subjectFilterActiveOnly })
            .pipe(
                finalize(() => {
                    this.subjectsLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.subjects = rows;
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.toastError('Failed to load subjects', err);
                    this.cdr.markForCheck();
                },
            });
    }

    loadCampusCategories(then?: () => void): void {
        this.categoriesLoading = true;
        this.cdr.markForCheck();
        this.admin
            .listCampusCategories(false)
            .pipe(
                finalize(() => {
                    this.categoriesLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.campusCategories = rows;
                    this.cdr.markForCheck();
                    then?.();
                },
                error: (err) => {
                    this.toastError('Failed to load campus categories', err);
                    this.cdr.markForCheck();
                    then?.();
                },
            });
    }

    loadCampuses(): void {
        this.campusesLoading = true;
        this.cdr.markForCheck();
        this.admin
            .listCampuses({
                districtId: this.campusFilterDistrictId ?? undefined,
                activeOnly: false,
            })
            .pipe(
                finalize(() => {
                    this.campusesLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.campuses = rows;
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.toastError('Failed to load campuses', err);
                    this.cdr.markForCheck();
                },
            });
    }

    loadAcademicYears(then?: () => void): void {
        this.academicYearsLoading = true;
        this.cdr.markForCheck();
        this.admin
            .listAcademicYears(false)
            .pipe(
                finalize(() => {
                    this.academicYearsLoading = false;
                    this.cdr.markForCheck();
                    then?.();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.academicYears = rows;
                    if (this.quarterFilterAcademicYearId == null && rows.length) {
                        const defaultYear = rows.find((y) => y.isActive) ?? rows[0];
                        this.quarterFilterAcademicYearId = defaultYear.academicYearId;
                    }
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.toastError('Failed to load academic years', err);
                    this.cdr.markForCheck();
                },
            });
    }

    startCreateState(): void {
        this.editingStateId = null;
        this.stateForm = this.emptyStateForm();
        this.openSetupModal();
    }

    startEditState(row: State): void {
        this.editingStateId = row.stateId;
        this.stateForm = {
            stateCode: row.stateCode,
            stateName: row.stateName,
            isActive: row.isActive,
            updatedBy: this.auditUser(),
        };
        this.openSetupModal();
    }

    cancelStateForm(): void {
        this.editingStateId = null;
        this.stateForm = this.emptyStateForm();
        this.closeSetupModal();
    }

    saveState(): void {
        const code = this.stateForm.stateCode?.trim();
        const name = this.stateForm.stateName?.trim();
        if (!code || !name) {
            this.toast('State code and name are required.', 'warning');
            return;
        }
        const body: StateRequest = {
            stateCode: code.toUpperCase(),
            stateName: name,
            isActive: this.stateForm.isActive ?? true,
            ...(this.editingStateId == null
                ? { createdBy: this.auditUser() }
                : { updatedBy: this.auditUser() }),
        };

        this.stateSaving = true;
        this.cdr.markForCheck();
        const req$ =
            this.editingStateId == null
                ? this.admin.createState(body)
                : this.admin.updateState(this.editingStateId, body);

        req$
            .pipe(
                finalize(() => {
                    this.stateSaving = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: () => {
                    this.toast(
                        this.editingStateId == null ? 'State created.' : 'State updated.',
                        'success',
                    );
                    this.cancelStateForm();
                    this.loadStates();
                },
                error: (err) => this.toastError('Failed to save state', err),
            });
    }

    startCreateDistrict(): void {
        this.editingDistrictId = null;
        this.districtForm = this.emptyDistrictForm();
        if (this.districtFilterStateId != null) {
            this.districtForm.stateId = this.districtFilterStateId;
        }
        this.openSetupModal();
    }

    startEditDistrict(row: District): void {
        this.editingDistrictId = row.districtId;
        this.districtForm = {
            stateId: row.stateId,
            districtName: row.districtName,
            districtCode: row.districtCode ?? '',
            districtAbbreviation: row.districtAbbreviation ?? '',
            districtPhone: row.districtPhone ?? '',
            districtTimeZone: row.districtTimeZone ?? '',
            isActive: row.isActive,
            updatedBy: this.auditUser(),
        };
        this.openSetupModal();
    }

    cancelDistrictForm(): void {
        this.editingDistrictId = null;
        this.districtForm = this.emptyDistrictForm();
        this.closeSetupModal();
    }

    saveDistrict(): void {
        const name = this.districtForm.districtName?.trim();
        if (!name || !this.districtForm.stateId) {
            this.toast('State and district name are required.', 'warning');
            return;
        }
        const body: DistrictRequest = {
            stateId: this.districtForm.stateId,
            districtName: name,
            districtCode: this.districtForm.districtCode?.trim() || undefined,
            districtAbbreviation: this.districtForm.districtAbbreviation?.trim() || undefined,
            districtPhone: this.districtForm.districtPhone?.trim() || undefined,
            districtTimeZone: this.districtForm.districtTimeZone?.trim() || undefined,
            isActive: this.districtForm.isActive ?? true,
            ...(this.editingDistrictId == null
                ? { createdBy: this.auditUser() }
                : { updatedBy: this.auditUser() }),
        };

        this.districtSaving = true;
        this.cdr.markForCheck();
        const req$ =
            this.editingDistrictId == null
                ? this.admin.createDistrict(body)
                : this.admin.updateDistrict(this.editingDistrictId, body);

        req$
            .pipe(
                finalize(() => {
                    this.districtSaving = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: () => {
                    this.toast(
                        this.editingDistrictId == null ? 'District created.' : 'District updated.',
                        'success',
                    );
                    this.cancelDistrictForm();
                    this.loadDistricts();
                },
                error: (err) => this.toastError('Failed to save district', err),
            });
    }

    startCreateQuarter(): void {
        this.editingQuarterId = null;
        if (!this.academicYears.length) {
            this.loadAcademicYears();
        }
        this.quarterForm = this.emptyQuarterForm();
        if (this.quarterFilterDistrictId != null) {
            this.quarterForm.districtId = this.quarterFilterDistrictId;
        }
        this.openSetupModal();
    }

    startEditQuarter(row: DistrictQuarter): void {
        this.editingQuarterId = row.districtQuarterId;
        this.quarterForm = {
            districtId: row.districtId,
            academicYearId: row.academicYearId,
            quarterCode: row.quarterCode,
            quarterName: row.quarterName ?? '',
            startDate: row.startDate,
            endDate: row.endDate,
            sortOrder: row.sortOrder,
            isActive: row.isActive,
            updatedBy: this.auditUser(),
        };
        this.openSetupModal();
    }

    cancelQuarterForm(): void {
        this.editingQuarterId = null;
        this.quarterForm = this.emptyQuarterForm();
        this.closeSetupModal();
    }

    onQuarterCodeChange(): void {
        if (this.editingQuarterId != null) {
            return;
        }
        const selected = this.quarterCodeOptions.find((o) => o.code === this.quarterForm.quarterCode);
        if (!selected) {
            return;
        }
        this.quarterForm.quarterName = selected.name;
        this.quarterForm.sortOrder = selected.sortOrder;
        this.cdr.markForCheck();
    }

    /** Includes the current code when editing a quarter outside the standard list. */
    get quarterCodeSelectOptions(): { code: string; name: string; sortOrder: number }[] {
        const options = this.quarterCodeOptions.map((o) => ({ ...o }));
        const current = this.quarterForm.quarterCode?.trim();
        if (current && !options.some((o) => o.code === current)) {
            options.push({
                code: current,
                name: this.quarterForm.quarterName?.trim() || current,
                sortOrder: this.quarterForm.sortOrder ?? 999,
            });
        }
        return options;
    }

    saveQuarter(): void {
        const code = this.quarterForm.quarterCode?.trim();
        if (
            !code ||
            !this.quarterForm.districtId ||
            !this.quarterForm.academicYearId ||
            !this.quarterForm.startDate ||
            !this.quarterForm.endDate
        ) {
            this.toast('District, academic year, quarter code, and date range are required.', 'warning');
            return;
        }
        const body: DistrictQuarterRequest = {
            districtId: this.quarterForm.districtId,
            academicYearId: this.quarterForm.academicYearId,
            quarterCode: code.toUpperCase(),
            quarterName: this.quarterForm.quarterName?.trim() || undefined,
            startDate: this.quarterForm.startDate,
            endDate: this.quarterForm.endDate,
            sortOrder: this.quarterForm.sortOrder,
            isActive: this.quarterForm.isActive ?? true,
            ...(this.editingQuarterId == null
                ? { createdBy: this.auditUser() }
                : { updatedBy: this.auditUser() }),
        };

        this.quarterSaving = true;
        this.cdr.markForCheck();
        const req$ =
            this.editingQuarterId == null
                ? this.admin.createDistrictQuarter(body)
                : this.admin.updateDistrictQuarter(this.editingQuarterId, body);

        req$
            .pipe(
                finalize(() => {
                    this.quarterSaving = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: () => {
                    this.toast(
                        this.editingQuarterId == null ? 'District quarter created.' : 'District quarter updated.',
                        'success',
                    );
                    this.cancelQuarterForm();
                    this.loadQuarters();
                },
                error: (err) => this.toastError('Failed to save district quarter', err),
            });
    }

    startCreateAcademy(): void {
        this.editingAcademyId = null;
        this.academyForm = this.emptyAcademyForm();
        if (this.academyFilterDistrictId != null) {
            this.academyForm.districtId = this.academyFilterDistrictId;
        }
        this.openSetupModal();
    }

    startEditAcademy(row: DistrictAcademy): void {
        this.editingAcademyId = row.districtAcademyId;
        this.academyForm = {
            districtId: row.districtId,
            academyCode: row.academyCode,
            academyName: row.academyName,
            sortOrder: row.sortOrder,
            isActive: row.isActive,
            updatedBy: this.auditUser(),
        };
        this.openSetupModal();
    }

    cancelAcademyForm(): void {
        this.editingAcademyId = null;
        this.academyForm = this.emptyAcademyForm();
        this.closeSetupModal();
    }

    saveAcademy(): void {
        const code = this.academyForm.academyCode?.trim();
        const name = this.academyForm.academyName?.trim();
        if (!code || !name || !this.academyForm.districtId) {
            this.toast('District, academy code, and name are required.', 'warning');
            return;
        }
        const body: DistrictAcademyRequest = {
            districtId: this.academyForm.districtId,
            academyCode: code.toUpperCase(),
            academyName: name,
            sortOrder: this.academyForm.sortOrder,
            isActive: this.academyForm.isActive ?? true,
            ...(this.editingAcademyId == null
                ? { createdBy: this.auditUser() }
                : { updatedBy: this.auditUser() }),
        };

        this.academySaving = true;
        this.cdr.markForCheck();
        const req$ =
            this.editingAcademyId == null
                ? this.admin.createDistrictAcademy(body)
                : this.admin.updateDistrictAcademy(this.editingAcademyId, body);

        req$
            .pipe(
                finalize(() => {
                    this.academySaving = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: () => {
                    this.toast(
                        this.editingAcademyId == null ? 'District academy created.' : 'District academy updated.',
                        'success',
                    );
                    this.cancelAcademyForm();
                    this.loadAcademies();
                },
                error: (err) => this.toastError('Failed to save district academy', err),
            });
    }

    startCreateGrade(): void {
        this.editingGradeId = null;
        this.gradeForm = this.emptyGradeForm();
        this.openSetupModal();
    }

    startEditGrade(row: Grade): void {
        this.editingGradeId = row.gradeId;
        this.gradeForm = {
            gradeCode: row.gradeCode,
            gradeName: row.gradeName ?? '',
            sortOrder: row.sortOrder,
            isActive: row.isActive,
            updatedBy: this.auditUser(),
        };
        this.openSetupModal();
    }

    cancelGradeForm(): void {
        this.editingGradeId = null;
        this.gradeForm = this.emptyGradeForm();
        this.closeSetupModal();
    }

    saveGrade(): void {
        const code = this.gradeForm.gradeCode?.trim();
        if (!code) {
            this.toast('Grade code is required.', 'warning');
            return;
        }
        const body: GradeRequest = {
            gradeCode: code,
            gradeName: this.gradeForm.gradeName?.trim() || undefined,
            sortOrder: this.gradeForm.sortOrder,
            isActive: this.gradeForm.isActive ?? true,
            ...(this.editingGradeId == null
                ? { createdBy: this.auditUser() }
                : { updatedBy: this.auditUser() }),
        };

        this.gradeSaving = true;
        this.cdr.markForCheck();
        const req$ =
            this.editingGradeId == null
                ? this.admin.createGrade(body)
                : this.admin.updateGrade(this.editingGradeId, body);

        req$
            .pipe(
                finalize(() => {
                    this.gradeSaving = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: () => {
                    this.toast(
                        this.editingGradeId == null ? 'Grade created.' : 'Grade updated.',
                        'success',
                    );
                    this.cancelGradeForm();
                    this.loadGrades();
                },
                error: (err) => this.toastError('Failed to save grade', err),
            });
    }

    startCreateCategory(): void {
        this.editingCategoryId = null;
        this.categoryForm = this.emptyCategoryForm();
        this.openSetupModal();
    }

    startEditCategory(row: CampusCategory): void {
        this.editingCategoryId = row.campusCategoryId;
        this.categoryForm = {
            categoryName: row.categoryName,
            categoryCode: row.categoryCode,
            isActive: row.isActive,
            updatedBy: this.auditUser(),
        };
        this.openSetupModal();
    }

    cancelCategoryForm(): void {
        this.editingCategoryId = null;
        this.categoryForm = this.emptyCategoryForm();
        this.closeSetupModal();
    }

    saveCategory(): void {
        const name = this.categoryForm.categoryName?.trim();
        if (!name) {
            this.toast('Category name is required.', 'warning');
            return;
        }
        const body: CampusCategoryRequest = {
            categoryName: name,
            categoryCode: this.categoryForm.categoryCode?.trim() || undefined,
            isActive: this.categoryForm.isActive ?? true,
            ...(this.editingCategoryId == null
                ? { createdBy: this.auditUser() }
                : { updatedBy: this.auditUser() }),
        };

        this.categorySaving = true;
        this.cdr.markForCheck();
        const req$ =
            this.editingCategoryId == null
                ? this.admin.createCampusCategory(body)
                : this.admin.updateCampusCategory(this.editingCategoryId, body);

        req$
            .pipe(
                finalize(() => {
                    this.categorySaving = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: () => {
                    this.toast(
                        this.editingCategoryId == null ? 'Campus category created.' : 'Campus category updated.',
                        'success',
                    );
                    this.cancelCategoryForm();
                    this.loadCampusCategories();
                },
                error: (err) => this.toastError('Failed to save campus category', err),
            });
    }

    startCreateCampus(): void {
        this.editingCampusId = null;
        this.campusForm = this.emptyCampusForm();
        this.openSetupModal();
    }

    startEditCampus(row: Campus): void {
        this.editingCampusId = row.campusId;
        this.campusForm = {
            districtId: row.districtId,
            campusCategoryId: row.campusCategoryId,
            campusCode: row.campusCode,
            campusIdExternal: row.campusIdExternal,
            campusName: row.campusName,
            isActive: row.isActive,
            updatedBy: this.auditUser(),
        };
        this.openSetupModal();
    }

    cancelCampusForm(): void {
        this.editingCampusId = null;
        this.campusForm = this.emptyCampusForm();
        this.closeSetupModal();
    }

    saveCampus(): void {
        const name = this.campusForm.campusName?.trim();
        const code = this.campusForm.campusCode?.trim();
        if (!name) {
            this.toast('Campus name is required.', 'warning');
            return;
        }
        if (!code) {
            this.toast('Campus code is required.', 'warning');
            return;
        }
        if (!this.campusForm.districtId) {
            this.toast('District is required.', 'warning');
            return;
        }
        if (!this.campusForm.campusCategoryId) {
            this.toast('Campus category is required.', 'warning');
            return;
        }
        const body: CampusRequest = {
            districtId: this.campusForm.districtId,
            campusCategoryId: this.campusForm.campusCategoryId,
            campusCode: code,
            campusIdExternal: this.campusForm.campusIdExternal?.trim() || undefined,
            campusName: name,
            isActive: this.campusForm.isActive ?? true,
            ...(this.editingCampusId == null
                ? { createdBy: this.auditUser() }
                : { updatedBy: this.auditUser() }),
        };

        this.campusSaving = true;
        this.cdr.markForCheck();
        const req$ =
            this.editingCampusId == null
                ? this.admin.createCampus(body)
                : this.admin.updateCampus(this.editingCampusId, body);

        req$
            .pipe(
                finalize(() => {
                    this.campusSaving = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: () => {
                    this.toast(
                        this.editingCampusId == null ? 'Campus created.' : 'Campus updated.',
                        'success',
                    );
                    this.cancelCampusForm();
                    this.loadCampuses();
                },
                error: (err) => this.toastError('Failed to save campus', err),
            });
    }

    /** Confirm then delete a district — the backend blocks deletion while anything still references it. */
    deleteDistrict(row: District): void {
        void Swal.fire({
            title: 'Delete district?',
            html: `<b>${row.districtName}</b> will be permanently removed.<br>Deletion is blocked while campuses, teachers, quarters, users, or data still reference it.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Delete',
            confirmButtonColor: '#e7515a',
        }).then((result) => {
            if (!result.isConfirmed) {
                return;
            }
            this.admin.deleteDistrict(row.districtId).subscribe({
                next: () => {
                    this.toast('District deleted.');
                    this.loadDistricts();
                },
                error: (err) => this.toastError('Cannot delete district', err),
            });
        });
    }

    /** Confirm then delete a campus — grade associations cascade, everything else blocks. */
    deleteCampus(row: Campus): void {
        void Swal.fire({
            title: 'Delete campus?',
            html: `<b>${row.campusName}</b> and its grade associations will be permanently removed.<br>Deletion is blocked while teachers, users, or data still reference it.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Delete',
            confirmButtonColor: '#e7515a',
        }).then((result) => {
            if (!result.isConfirmed) {
                return;
            }
            this.admin.deleteCampus(row.campusId).subscribe({
                next: () => {
                    this.toast('Campus deleted.');
                    this.loadCampuses();
                    this.loadCampusGradeCampuses();
                },
                error: (err) => this.toastError('Cannot delete campus', err),
            });
        });
    }

    startCreateSubject(): void {
        this.editingSubjectId = null;
        this.subjectForm = this.emptySubjectForm();
        this.openSetupModal();
    }

    startEditSubject(row: Subject): void {
        this.editingSubjectId = row.subjectId;
        this.subjectForm = {
            subjectCode: row.subjectCode,
            subjectName: row.subjectName,
            isActive: row.isActive,
            updatedBy: this.auditUser(),
        };
        this.openSetupModal();
    }

    cancelSubjectForm(): void {
        this.editingSubjectId = null;
        this.subjectForm = this.emptySubjectForm();
        this.closeSetupModal();
    }

    saveSubject(): void {
        const code = this.subjectForm.subjectCode?.trim();
        const name = this.subjectForm.subjectName?.trim();
        if (!code || !name) {
            this.toast('Subject code and name are required.', 'warning');
            return;
        }
        const body: SubjectRequest = {
            subjectCode: code.toUpperCase(),
            subjectName: name,
            isActive: this.subjectForm.isActive ?? true,
            ...(this.editingSubjectId == null
                ? { createdBy: this.auditUser() }
                : { updatedBy: this.auditUser() }),
        };

        this.subjectSaving = true;
        this.cdr.markForCheck();
        const req$ =
            this.editingSubjectId == null
                ? this.admin.createSubject(body)
                : this.admin.updateSubject(this.editingSubjectId, body);

        req$
            .pipe(
                finalize(() => {
                    this.subjectSaving = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: () => {
                    this.toast(
                        this.editingSubjectId == null ? 'Subject created.' : 'Subject updated.',
                        'success',
                    );
                    this.cancelSubjectForm();
                    this.loadSubjects();
                },
                error: (err) => this.toastError('Failed to save subject', err),
            });
    }

    startCreateAcademicYear(): void {
        this.editingAcademicYearId = null;
        this.academicYearForm = this.emptyAcademicYearForm();
        this.openSetupModal();
    }

    startEditAcademicYear(row: AcademicYear): void {
        this.editingAcademicYearId = row.academicYearId;
        this.academicYearForm = {
            yearLabel: row.yearLabel,
            startDate: row.startDate,
            endDate: row.endDate,
            isActive: row.isActive,
            updatedBy: this.auditUser(),
        };
        this.openSetupModal();
    }

    cancelAcademicYearForm(): void {
        this.editingAcademicYearId = null;
        this.academicYearForm = this.emptyAcademicYearForm();
        this.closeSetupModal();
    }

    saveAcademicYear(): void {
        const label = this.academicYearForm.yearLabel?.trim();
        if (!label) {
            this.toast('Year label is required.', 'warning');
            return;
        }
        if (!this.academicYearForm.startDate?.trim()) {
            this.toast('Start date is required.', 'warning');
            return;
        }
        if (!this.academicYearForm.endDate?.trim()) {
            this.toast('End date is required.', 'warning');
            return;
        }
        const body: AcademicYearRequest = {
            yearLabel: label,
            startDate: this.academicYearForm.startDate,
            endDate: this.academicYearForm.endDate,
            isActive: this.academicYearForm.isActive ?? true,
            ...(this.editingAcademicYearId == null
                ? { createdBy: this.auditUser() }
                : { updatedBy: this.auditUser() }),
        };

        this.academicYearSaving = true;
        this.cdr.markForCheck();
        const req$ =
            this.editingAcademicYearId == null
                ? this.admin.createAcademicYear(body)
                : this.admin.updateAcademicYear(this.editingAcademicYearId, body);

        req$
            .pipe(
                finalize(() => {
                    this.academicYearSaving = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: () => {
                    this.toast(
                        this.editingAcademicYearId == null ? 'Academic year created.' : 'Academic year updated.',
                        'success',
                    );
                    this.cancelAcademicYearForm();
                    this.loadAcademicYears();
                },
                error: (err) => this.toastError('Failed to save academic year', err),
            });
    }

    stateName(stateId: number): string {
        return this.states.find((s) => s.stateId === stateId)?.stateName ?? String(stateId);
    }

    districtName(districtId: number): string {
        return this.districts.find((d) => d.districtId === districtId)?.districtName ?? String(districtId);
    }

    academicYearLabel(academicYearId: number): string {
        return (
            this.academicYears.find((y) => y.academicYearId === academicYearId)?.yearLabel ??
            String(academicYearId)
        );
    }

    categoryName(categoryId: number): string {
        return (
            this.campusCategories.find((c) => c.campusCategoryId === categoryId)?.categoryName ??
            String(categoryId)
        );
    }

    private emptyStateForm(): StateRequest {
        return { stateCode: '', stateName: '', isActive: true, createdBy: this.auditUser() };
    }

    private emptyDistrictForm(): DistrictRequest {
        return {
            stateId: this.districtFilterStateId ?? (this.states[0]?.stateId ?? 0),
            districtName: '',
            districtCode: '',
            districtAbbreviation: '',
            districtPhone: '',
            districtTimeZone: '',
            isActive: true,
            createdBy: this.auditUser(),
        };
    }

    private emptyQuarterForm(): DistrictQuarterRequest {
        const filteredYear = this.quarterFilterAcademicYearId;
        const defaultYear =
            (filteredYear != null
                ? this.academicYears.find((y) => y.academicYearId === filteredYear)
                : undefined) ??
            this.academicYears.find((y) => y.isActive) ??
            this.academicYears[0];
        return {
            districtId: this.quarterFilterDistrictId ?? (this.districts[0]?.districtId ?? 0),
            academicYearId: defaultYear?.academicYearId ?? 0,
            quarterCode: '',
            quarterName: '',
            startDate: '',
            endDate: '',
            sortOrder: 1,
            isActive: true,
            createdBy: this.auditUser(),
        };
    }

    private emptyAcademyForm(): DistrictAcademyRequest {
        return {
            districtId: this.academyFilterDistrictId ?? (this.districts[0]?.districtId ?? 0),
            academyCode: '',
            academyName: '',
            sortOrder: 1,
            isActive: true,
            createdBy: this.auditUser(),
        };
    }

    private emptyGradeForm(): GradeRequest {
        return { gradeCode: '', gradeName: '', sortOrder: 1, isActive: true, createdBy: this.auditUser() };
    }

    private emptyCategoryForm(): CampusCategoryRequest {
        return { categoryName: '', categoryCode: '', isActive: true, createdBy: this.auditUser() };
    }

    private emptyCampusForm(): CampusRequest {
        const firstCategory = this.campusCategories.find((c) => c.isActive) ?? this.campusCategories[0];
        return {
            districtId: this.campusFilterDistrictId ?? (this.districts[0]?.districtId ?? 0),
            campusCategoryId: firstCategory?.campusCategoryId ?? 0,
            campusCode: '',
            campusIdExternal: '',
            campusName: '',
            isActive: true,
            createdBy: this.auditUser(),
        };
    }

    private emptySubjectForm(): SubjectRequest {
        return {
            subjectCode: '',
            subjectName: '',
            isActive: true,
            createdBy: this.auditUser(),
        };
    }

    private emptyAcademicYearForm(): AcademicYearRequest {
        return { yearLabel: '', startDate: '', endDate: '', isActive: true, createdBy: this.auditUser() };
    }

    private auditUser(): string | undefined {
        return this.auth.getCurrentUser()?.email ?? undefined;
    }

    private toast(message: string, icon: 'success' | 'error' | 'warning' = 'success'): void {
        void Swal.fire({
            toast: true,
            position: 'top-end',
            icon,
            title: message,
            showConfirmButton: false,
            timer: icon === 'error' ? 6000 : 4000,
            timerProgressBar: true,
        });
    }

    private toastError(title: string, err: unknown): void {
        /**
         * The global ErrorInterceptor rethrows HTTP failures as plain `Error`s
         * carrying the backend message, so handle both shapes here.
         */
        const msg =
            err instanceof HttpErrorResponse
                ? (err.error?.message as string) || err.message
                : err instanceof Error
                  ? err.message
                  : 'Unexpected error';
        this.toast(`${title}: ${msg}`, 'error');
    }
}
