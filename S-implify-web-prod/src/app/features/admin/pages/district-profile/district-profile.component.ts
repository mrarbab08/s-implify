import { CommonModule } from '@angular/common';
import {
    AfterViewInit,
    ChangeDetectorRef,
    Component,
    DestroyRef,
    OnInit,
    signal,
    ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError, finalize, map, switchMap, tap } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { NgxCustomModalComponent } from 'ngx-custom-modal';
import { environment } from '../../../../../environments/environment';
import { AdminSetupsService } from '../../../../core/services/admin-setups.service';
import { AuthService } from '../../../../core/services/auth.service';
import { RolesService } from '../../../../core/services/roles.service';
import { TeacherAssessmentService } from '../../../../core/services/teacher-assessment.service';
import { UsersService } from '../../../../core/services/users.service';
import { ROLE_IDS, roleIdFromName } from '../../../../core/constants/auth-roles';
import { SharedModule } from '../../../../shared/shared.module';
import type {
    AcademicYear,
    Campus,
    CampusCategory,
    District,
    DistrictAcademy,
    DistrictQuarter,
    DistrictRequest,
    DistrictSubjectDto,
    RoleDto,
    State,
    TtessRubric,
    UserItemDto,
    UserRoleAssignmentItemDto,
    UserRoleAssignmentRequest,
} from '../../../../core/models/simplify-api.model';

interface UploadRow {
    type: string;
    label: string;
    uploadId: number | string;
    fileName: string;
    uploadedAt: string | null;
    uploadedBy: string | null;
}

interface ProfileSection {
    id: string;
    label: string;
}

@Component({
    selector: 'app-district-profile',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterLink, SharedModule],
    templateUrl: './district-profile.component.html',
    styles: [
        `
            html {
                scroll-behavior: smooth;
            }
            .section-anchor {
                scroll-margin-top: 90px;
            }
        `,
    ],
})
export class DistrictProfileComponent implements OnInit, AfterViewInit {
    private readonly api = environment.apiUrl;

    district: District | null = null;
    states: State[] = [];
    loading = true;
    loadError: string | null = null;

    // ---- related data ----
    campuses: Campus[] = [];
    campusCategories: CampusCategory[] = [];
    academies: DistrictAcademy[] = [];
    quarters: DistrictQuarter[] = [];
    subjects: DistrictSubjectDto[] = [];
    users: UserItemDto[] = [];
    roles: RoleDto[] = [];
    academicYears: AcademicYear[] = [];
    recentUploads: UploadRow[] = [];

    // ---- T-TESS rubric (T-TESS Questions section) ----
    ttessRubric: TtessRubric | null = null;
    ttessRubricLoading = false;
    ttessRubricError: string | null = null;

    // ---- basic info inline edit ----
    editing = false;
    saving = false;
    editError: string | null = null;
    editForm: {
        stateId: number | null;
        districtName: string;
        districtCode: string;
        districtAbbreviation: string;
        districtPhone: string;
        districtTimeZone: string;
        isActive: boolean;
    } = {
        stateId: null,
        districtName: '',
        districtCode: '',
        districtAbbreviation: '',
        districtPhone: '',
        districtTimeZone: '',
        isActive: true,
    };

    // ---- logo ----
    logoUploading = false;
    logoError: string | null = null;

    // ---- sidebar nav ----
    /**
     * "On this page" menu. The T-TESS Questions section only exists for users who
     * can manage the district (Super Admin / matching District Admin); everyone else
     * keeps the pre-existing read-only page.
     */
    get sections(): ProfileSection[] {
        const base: ProfileSection[] = [
            { id: 'section-basic', label: 'Basic Info' },
            { id: 'section-schools', label: 'Schools (Campuses)' },
            { id: 'section-academies', label: 'Academies' },
            { id: 'section-periods', label: 'Assessment Periods' },
        ];
        if (this.canManage) {
            base.push({ id: 'section-ttess-questions', label: 'T-TESS Questions' });
        }
        base.push(
            { id: 'section-subjects', label: 'Subjects' },
            { id: 'section-users', label: 'Users' },
            { id: 'section-uploads', label: 'Data Uploads' },
        );
        return base;
    }
    activeSection = signal('section-basic');

    private readonly uploadTypes: Array<{ type: string; label: string }> = [
        { type: 'growth-sheet', label: 'Growth sheet' },
        { type: 'rawscores-uploads', label: 'Rawscores' },
        { type: 'campus-attendance', label: 'Campus attendance' },
        { type: 'teacher-assessment', label: 'T-TESS' },
        { type: 'student-standards', label: 'Student standards' },
        { type: 'individual-attendance', label: 'Individual attendance' },
        { type: 'ccmr', label: 'CCMR' },
    ];

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private http: HttpClient,
        private setups: AdminSetupsService,
        private usersService: UsersService,
        private auth: AuthService,
        private rolesService: RolesService,
        private teacherAssessment: TeacherAssessmentService,
        private cdr: ChangeDetectorRef,
        private destroyRef: DestroyRef,
    ) {}

    /** True for Super Admin, or a District Admin whose assignment matches the open district. */
    get canManage(): boolean {
        const role = this.auth.getCurrentUser()?.activeRole;
        if (!role) return false;
        const roleId = roleIdFromName(role.roleName) ?? role.roleId;
        if (roleId === ROLE_IDS.SuperAdmin) return true;
        if (roleId === ROLE_IDS.DistrictAdmin) {
            return role.districtId == null || Number(role.districtId) === Number(this.district?.districtId);
        }
        return false;
    }

    ngOnInit(): void {
        this.route.paramMap
            .pipe(
                map((params) => Number(params.get('districtId'))),
                switchMap((districtId) => {
                    if (!Number.isFinite(districtId) || districtId <= 0) {
                        this.loadError = 'No district selected.';
                        this.loading = false;
                        return of(null);
                    }
                    return this.loadProfile(districtId);
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe(() => this.cdr.markForCheck());
    }

    ngAfterViewInit(): void {
        // Highlight the sidebar entry while the user scrolls through sections.
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        this.activeSection.set(entry.target.id);
                    }
                }
            },
            { rootMargin: '-90px 0px -70% 0px', threshold: 0 },
        );
        for (const s of this.sections) {
            const el = document.getElementById(s.id);
            if (el) {
                observer.observe(el);
            }
        }
        this.destroyRef.onDestroy(() => observer.disconnect());
    }

    private loadProfile(districtId: number) {
        this.loading = true;
        this.loadError = null;
        this.ttessRubricLoading = true;
        return forkJoin({
            district: this.setups.getDistrict(districtId).pipe(
                catchError(() => of(null)),
                tap((d) => (this.district = d)),
            ),
            states: this.setups.listStates().pipe(catchError(() => of([] as State[]))),
            campuses: this.setups
                .listCampuses({ districtId, activeOnly: false })
                .pipe(catchError(() => of([] as Campus[]))),
            campusCategories: this.setups
                .listCampusCategories()
                .pipe(catchError(() => of([] as CampusCategory[]))),
            academies: this.setups
                .listDistrictAcademies({ districtId, activeOnly: false })
                .pipe(catchError(() => of([] as DistrictAcademy[]))),
            quarters: this.setups
                .listDistrictQuarters({ districtId, activeOnly: false })
                .pipe(catchError(() => of([] as DistrictQuarter[]))),
            subjects: this.setups
                .listDistrictSubjects(districtId)
                .pipe(catchError(() => of([] as DistrictSubjectDto[]))),
            users: this.usersService
                .listUsers({ districtId })
                .pipe(catchError(() => of([] as UserItemDto[]))),
            roles: this.rolesService.listRoles().pipe(catchError(() => of([] as RoleDto[]))),
            academicYears: this.setups
                .listAcademicYears()
                .pipe(catchError(() => of([] as AcademicYear[]))),
            ttessRubric: this.teacherAssessment.getTtessRubric(districtId).pipe(
                tap((r) => this.applyTtessRubric(r)),
                catchError(() => {
                    this.ttessRubricError = 'T-TESS rubric could not be loaded.';
                    return of(null as TtessRubric | null);
                }),
            ),
            uploads: this.loadRecentUploads(districtId),
        }).pipe(
            map(({ states, campuses, campusCategories, academies, quarters, subjects, users, roles, academicYears, uploads }) => {
                this.states = states;
                this.campuses = campuses;
                this.campusCategories = campusCategories;
                this.academies = academies;
                this.quarters = quarters;
                this.subjects = subjects;
                this.users = users;
                this.roles = roles;
                this.academicYears = academicYears;
                this.recentUploads = uploads;
                this.ttessRubricLoading = false;
                if (!this.district) {
                    this.loadError = 'District not found.';
                }
            }),
            finalize(() => {
                this.loading = false;
                this.cdr.markForCheck();
            }),
        );
    }

    /** Collects the latest uploads across every upload flow for this district. */
    private loadRecentUploads(districtId: number) {
        return forkJoin(
            this.uploadTypes.map((t) =>
                this.http
                    .get<ApiResponseShape>(`${this.api}/${t.type}/uploads`, {
                        params: { districtId: String(districtId) },
                    })
                    .pipe(
                        map((r) => (Array.isArray(r?.data) ? r.data : [])),
                        map((rows: Array<Record<string, unknown>>) =>
                            rows.map((u) => ({
                                type: t.type,
                                label: t.label,
                                uploadId: (u['uploadId'] ?? u['id'] ?? '') as number | string,
                                fileName:
                                    (u['fileName'] as string) ||
                                    (u['originalFileName'] as string) ||
                                    '—',
                                uploadedAt: (u['uploadedAt'] as string) ?? null,
                                uploadedBy: (u['uploadedBy'] as string) ?? null,
                            })),
                        ),
                        catchError(() => of([] as UploadRow[])),
                    ),
                ),
        ).pipe(
            map((groups) => {
                const all = groups.flat();
                all.sort((a, b) => (b.uploadedAt || '').localeCompare(a.uploadedAt || ''));
                return all.slice(0, 15);
            }),
        );
    }

    // ---------------- basic info editing ----------------

    startEdit(): void {
        if (!this.district) return;
        this.editForm = {
            stateId: this.district.stateId,
            districtName: this.district.districtName ?? '',
            districtCode: this.district.districtCode ?? '',
            districtAbbreviation: this.district.districtAbbreviation ?? '',
            districtPhone: this.district.districtPhone ?? '',
            districtTimeZone: this.district.districtTimeZone ?? '',
            isActive: !!this.district.isActive,
        };
        this.editError = null;
        this.editing = true;
        this.cdr.markForCheck();
    }

    cancelEdit(): void {
        this.editing = false;
        this.editError = null;
        this.cdr.markForCheck();
    }

    saveEdit(): void {
        if (!this.district) return;
        const name = this.editForm.districtName.trim();
        if (!name) {
            this.editError = 'District name is required.';
            return;
        }
        if (this.editForm.stateId == null) {
            this.editError = 'State is required.';
            return;
        }
        this.saving = true;
        this.editError = null;
        const body: DistrictRequest = {
            stateId: Number(this.editForm.stateId),
            districtName: name,
            districtCode: this.editForm.districtCode.trim() || undefined,
            districtAbbreviation: this.editForm.districtAbbreviation.trim() || undefined,
            districtPhone: this.editForm.districtPhone.trim() || undefined,
            districtLogo: this.district.districtLogo ?? undefined,
            districtTimeZone: this.editForm.districtTimeZone.trim() || undefined,
            isActive: this.editForm.isActive,
        };
        this.setups
            .updateDistrict(this.district.districtId, body)
            .pipe(finalize(() => {
                this.saving = false;
                this.cdr.markForCheck();
            }))
            .subscribe({
                next: (updated) => {
                    this.district = updated;
                    this.editing = false;
                    this.cdr.markForCheck();
                },
                error: (err: HttpErrorResponse) => {
                    this.editError =
                        err?.error?.message || 'Could not save the district. Please try again.';
                    this.cdr.markForCheck();
                },
            });
    }

    // ---------------- logo ----------------

    get logoUrl(): string | null {
        const logo = this.district?.districtLogo;
        if (!logo) return null;
        return logo.startsWith('http') ? logo : `${this.api.replace(/\/api$/, '')}${logo}`;
    }

    get initials(): string {
        const name = (this.district?.districtName || '').trim();
        if (!name) return 'D';
        const words = name.split(/\s+/).filter((w) => /[a-zA-Z0-9]/.test(w));
        if (words.length >= 2) {
            return (words[0][0] + words[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    }

    onLogoChosen(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files && input.files[0];
        input.value = '';
        if (!file || !this.district) return;
        this.logoUploading = true;
        this.logoError = null;
        const fd = new FormData();
        fd.append('logo', file, file.name);
        this.http
            .post<ApiResponseShape>(`${this.api}/districts/${this.district.districtId}/logo`, fd)
            .pipe(finalize(() => {
                this.logoUploading = false;
                this.cdr.markForCheck();
            }))
            .subscribe({
                next: (r) => {
                    if (this.district && r?.data?.district) {
                        this.district = r.data.district as District;
                    }
                    this.cdr.markForCheck();
                },
                error: (err: HttpErrorResponse) => {
                    this.logoError =
                        err?.error?.message || 'Logo upload failed. Please try a PNG/JPG image.';
                    this.cdr.markForCheck();
                },
            });
    }

    removeLogo(): void {
        if (!this.district) return;
        this.logoUploading = true;
        this.logoError = null;
        this.http
            .delete<ApiResponseShape>(`${this.api}/districts/${this.district.districtId}/logo`)
            .pipe(finalize(() => {
                this.logoUploading = false;
                this.cdr.markForCheck();
            }))
            .subscribe({
                next: () => {
                    if (this.district) {
                        this.district = { ...this.district, districtLogo: undefined };
                    }
                    this.cdr.markForCheck();
                },
                error: (err: HttpErrorResponse) => {
                    this.logoError = err?.error?.message || 'Could not remove the logo.';
                    this.cdr.markForCheck();
                },
            });
    }

    // ================= Section management (Add / Edit / Activate / Deactivate) =================

    /** User email for createdBy/updatedBy stamps (matches the portal's audit convention). */
    private get actor(): string {
        const user = this.auth.getCurrentUser();
        return user?.email || user?.displayName || 'district-profile';
    }

    private toast(message: string, icon: 'success' | 'error' = 'success'): void {
        void Swal.fire({
            toast: true,
            position: 'top-end',
            icon,
            title: message,
            showConfirmButton: false,
            timer: 3500,
            timerProgressBar: true,
        });
    }

    // ---------------- campuses ----------------

    @ViewChild('campusModal') campusModal?: NgxCustomModalComponent;
    campusEditingId: number | null = null;
    campusSaving = false;
    campusError: string | null = null;
    campusForm: {
        campusName: string;
        campusCode: string;
        campusCategoryId: number | null;
        campusAddress: string;
        campusPhone: string;
        principalName: string;
        isActive: boolean;
    } = {
        campusName: '',
        campusCode: '',
        campusCategoryId: null,
        campusAddress: '',
        campusPhone: '',
        principalName: '',
        isActive: true,
    };

    openCampusModal(campus: Campus | null): void {
        this.campusEditingId = campus ? campus.campusId : null;
        this.campusForm = {
            campusName: campus?.campusName ?? '',
            campusCode: campus?.campusCode ?? '',
            campusCategoryId: campus?.campusCategoryId ?? (this.campusCategories[0]?.campusCategoryId ?? null),
            campusAddress: campus?.campusAddress ?? '',
            campusPhone: campus?.campusPhone ?? '',
            principalName: campus?.principalName ?? '',
            isActive: campus ? !!campus.isActive : true,
        };
        this.campusError = null;
        this.campusModal?.open();
        this.cdr.markForCheck();
    }

    closeCampusModal(): void {
        this.campusModal?.close();
    }

    saveCampus(): void {
        if (!this.district) return;
        const name = this.campusForm.campusName.trim();
        const code = this.campusForm.campusCode.trim().toUpperCase();
        if (!name) {
            this.campusError = 'Campus name is required.';
            return;
        }
        if (!code) {
            this.campusError = 'Campus code is required.';
            return;
        }
        if (this.campusForm.campusCategoryId == null) {
            this.campusError = 'Campus category is required.';
            return;
        }
        this.campusSaving = true;
        this.campusError = null;
        const body = {
            districtId: this.district.districtId,
            campusCategoryId: Number(this.campusForm.campusCategoryId),
            campusCode: code,
            campusName: name,
            campusAddress: this.campusForm.campusAddress.trim() || null,
            campusPhone: this.campusForm.campusPhone.trim() || null,
            principalName: this.campusForm.principalName.trim() || null,
            isActive: this.campusForm.isActive,
        };
        const request$ = this.campusEditingId
            ? this.setups.updateCampus(this.campusEditingId, { ...body, updatedBy: this.actor })
            : this.setups.createCampus({ ...body, createdBy: this.actor });
        request$
            .pipe(finalize(() => {
                this.campusSaving = false;
                this.cdr.markForCheck();
            }))
            .subscribe({
                next: () => {
                    this.closeCampusModal();
                    this.toast(this.campusEditingId ? 'Campus updated' : 'Campus added');
                    this.reloadCampuses();
                },
                error: (err: HttpErrorResponse) => {
                    this.campusError = err?.error?.message || 'Could not save the campus.';
                    this.cdr.markForCheck();
                },
            });
    }

    toggleCampus(campus: Campus): void {
        this.setups
            .updateCampus(campus.campusId, {
                districtId: campus.districtId,
                campusCategoryId: campus.campusCategoryId,
                campusCode: campus.campusCode,
                campusName: campus.campusName,
                isActive: !campus.isActive,
                updatedBy: this.actor,
            })
            .subscribe({
                next: () => {
                    this.toast(`Campus ${campus.isActive ? 'deactivated' : 'activated'}`);
                    this.reloadCampuses();
                },
                error: (err: HttpErrorResponse) => this.toast(err?.error?.message || 'Could not update the campus.', 'error'),
            });
    }

    private reloadCampuses(): void {
        if (!this.district) return;
        this.setups
            .listCampuses({ districtId: this.district.districtId, activeOnly: false })
            .pipe(catchError(() => of([] as Campus[])))
            .subscribe((rows) => {
                this.campuses = rows;
                this.cdr.markForCheck();
            });
    }

    // ---------------- academies ----------------

    @ViewChild('academyModal') academyModal?: NgxCustomModalComponent;
    academyEditingId: number | null = null;
    academySaving = false;
    academyError: string | null = null;
    academyForm: {
        academyCode: string;
        academyName: string;
        sortOrder: number | null;
        isActive: boolean;
    } = {
        academyCode: '',
        academyName: '',
        sortOrder: null,
        isActive: true,
    };

    openAcademyModal(academy: DistrictAcademy | null): void {
        this.academyEditingId = academy ? academy.districtAcademyId : null;
        this.academyForm = {
            academyCode: academy?.academyCode ?? '',
            academyName: academy?.academyName ?? '',
            sortOrder: academy?.sortOrder ?? null,
            isActive: academy ? !!academy.isActive : true,
        };
        this.academyError = null;
        this.academyModal?.open();
        this.cdr.markForCheck();
    }

    closeAcademyModal(): void {
        this.academyModal?.close();
    }

    saveAcademy(): void {
        if (!this.district) return;
        const code = this.academyForm.academyCode.trim();
        const name = this.academyForm.academyName.trim();
        if (!code) {
            this.academyError = 'Academy code is required.';
            return;
        }
        if (!name) {
            this.academyError = 'Academy name is required.';
            return;
        }
        this.academySaving = true;
        this.academyError = null;
        const body = {
            districtId: this.district.districtId,
            academyCode: code,
            academyName: name,
            sortOrder: this.academyForm.sortOrder != null ? Number(this.academyForm.sortOrder) : undefined,
            isActive: this.academyForm.isActive,
        };
        const request$ = this.academyEditingId
            ? this.setups.updateDistrictAcademy(this.academyEditingId, { ...body, updatedBy: this.actor })
            : this.setups.createDistrictAcademy({ ...body, createdBy: this.actor });
        request$
            .pipe(finalize(() => {
                this.academySaving = false;
                this.cdr.markForCheck();
            }))
            .subscribe({
                next: () => {
                    this.closeAcademyModal();
                    this.toast(this.academyEditingId ? 'Academy updated' : 'Academy added');
                    this.reloadAcademies();
                },
                error: (err: HttpErrorResponse) => {
                    this.academyError = err?.error?.message || 'Could not save the academy.';
                    this.cdr.markForCheck();
                },
            });
    }

    toggleAcademy(academy: DistrictAcademy): void {
        this.setups
            .updateDistrictAcademy(academy.districtAcademyId, {
                districtId: academy.districtId,
                academyCode: academy.academyCode,
                academyName: academy.academyName,
                sortOrder: academy.sortOrder,
                isActive: !academy.isActive,
                updatedBy: this.actor,
            })
            .subscribe({
                next: () => {
                    this.toast(`Academy ${academy.isActive ? 'deactivated' : 'activated'}`);
                    this.reloadAcademies();
                },
                error: (err: HttpErrorResponse) => this.toast(err?.error?.message || 'Could not update the academy.', 'error'),
            });
    }

    private reloadAcademies(): void {
        if (!this.district) return;
        this.setups
            .listDistrictAcademies({ districtId: this.district.districtId, activeOnly: false })
            .pipe(catchError(() => of([] as DistrictAcademy[])))
            .subscribe((rows) => {
                this.academies = rows;
                this.cdr.markForCheck();
            });
    }

    // ---------------- assessment periods ----------------

    @ViewChild('periodModal') periodModal?: NgxCustomModalComponent;
    periodEditingId: number | null = null;
    periodSaving = false;
    periodError: string | null = null;
    periodForm: {
        quarterCode: string;
        quarterName: string;
        startDate: string;
        endDate: string;
        academicYearId: number | null;
        isCurrentWindow: boolean;
        isActive: boolean;
    } = {
        quarterCode: '',
        quarterName: '',
        startDate: '',
        endDate: '',
        academicYearId: null,
        isCurrentWindow: false,
        isActive: true,
    };

    yearLabel(academicYearId: number | null): string {
        const y = this.academicYears.find((x) => x.academicYearId === academicYearId);
        return y ? y.yearLabel : academicYearId != null ? `Year ${academicYearId}` : '—';
    }

    openPeriodModal(quarter: DistrictQuarter | null): void {
        this.periodEditingId = quarter ? quarter.districtQuarterId : null;
        this.periodForm = {
            quarterCode: quarter?.quarterCode ?? '',
            quarterName: quarter?.quarterName ?? '',
            startDate: quarter?.startDate ?? '',
            endDate: quarter?.endDate ?? '',
            academicYearId: quarter?.academicYearId ?? (this.academicYears[0]?.academicYearId ?? null),
            isCurrentWindow: !!quarter?.isCurrentWindow,
            isActive: quarter ? !!quarter.isActive : true,
        };
        this.periodError = null;
        this.periodModal?.open();
        this.cdr.markForCheck();
    }

    closePeriodModal(): void {
        this.periodModal?.close();
    }

    savePeriod(): void {
        if (!this.district) return;
        const code = this.periodForm.quarterCode.trim().toUpperCase();
        if (!code) {
            this.periodError = 'Period code is required.';
            return;
        }
        if (!this.periodForm.startDate) {
            this.periodError = 'Start date is required.';
            return;
        }
        if (!this.periodForm.endDate) {
            this.periodError = 'End date is required.';
            return;
        }
        if (this.periodForm.academicYearId == null) {
            this.periodError = 'School year is required.';
            return;
        }
        if (this.periodForm.endDate < this.periodForm.startDate) {
            this.periodError = 'End date must be on or after the start date.';
            return;
        }
        this.periodSaving = true;
        this.periodError = null;
        const body = {
            districtId: this.district.districtId,
            academicYearId: Number(this.periodForm.academicYearId),
            quarterCode: code,
            quarterName: this.periodForm.quarterName.trim() || code,
            startDate: this.periodForm.startDate,
            endDate: this.periodForm.endDate,
            isCurrentWindow: this.periodForm.isCurrentWindow,
            isActive: this.periodForm.isActive,
        };
        const request$ = this.periodEditingId
            ? this.setups.updateDistrictQuarter(this.periodEditingId, { ...body, updatedBy: this.actor })
            : this.setups.createDistrictQuarter({ ...body, createdBy: this.actor });
        request$
            .pipe(finalize(() => {
                this.periodSaving = false;
                this.cdr.markForCheck();
            }))
            .subscribe({
                next: () => {
                    this.closePeriodModal();
                    this.toast(this.periodEditingId ? 'Assessment period updated' : 'Assessment period added');
                    this.reloadQuarters();
                },
                error: (err: HttpErrorResponse) => {
                    this.periodError = err?.error?.message || 'Could not save the period.';
                    this.cdr.markForCheck();
                },
            });
    }

    togglePeriod(quarter: DistrictQuarter): void {
        this.setups
            .updateDistrictQuarter(quarter.districtQuarterId, {
                districtId: quarter.districtId,
                academicYearId: quarter.academicYearId,
                quarterCode: quarter.quarterCode,
                quarterName: quarter.quarterName,
                startDate: quarter.startDate,
                endDate: quarter.endDate,
                isCurrentWindow: !!quarter.isCurrentWindow,
                isActive: !quarter.isActive,
                updatedBy: this.actor,
            })
            .subscribe({
                next: () => {
                    this.toast(`Period ${quarter.isActive ? 'deactivated' : 'activated'}`);
                    this.reloadQuarters();
                },
                error: (err: HttpErrorResponse) => this.toast(err?.error?.message || 'Could not update the period.', 'error'),
            });
    }

    private reloadQuarters(): void {
        if (!this.district) return;
        this.setups
            .listDistrictQuarters({ districtId: this.district.districtId, activeOnly: false })
            .pipe(catchError(() => of([] as DistrictQuarter[])))
            .subscribe((rows) => {
                this.quarters = rows;
                this.cdr.markForCheck();
            });
    }

    // ---------------- subjects ----------------

    @ViewChild('subjectModal') subjectModal?: NgxCustomModalComponent;
    subjectEditingSubjectId: number | null = null;
    subjectEditingLinkActive = true;
    subjectSaving = false;
    subjectError: string | null = null;
    subjectForm: {
        subjectName: string;
        subjectCode: string;
        isActive: boolean;
    } = {
        subjectName: '',
        subjectCode: '',
        isActive: true,
    };

    openSubjectModal(subject: DistrictSubjectDto | null): void {
        this.subjectEditingSubjectId = subject ? subject.subjectId : null;
        this.subjectEditingLinkActive = subject ? subject.isActive !== false : true;
        this.subjectForm = {
            subjectName: subject?.subjectName ?? '',
            subjectCode: subject?.subjectCode ?? '',
            isActive: this.subjectEditingLinkActive,
        };
        this.subjectError = null;
        this.subjectModal?.open();
        this.cdr.markForCheck();
    }

    closeSubjectModal(): void {
        this.subjectModal?.close();
    }

    saveSubject(): void {
        if (!this.district) return;
        const name = this.subjectForm.subjectName.trim();
        const code = this.subjectForm.subjectCode.trim().toUpperCase();
        if (!name) {
            this.subjectError = 'Subject name is required.';
            return;
        }
        if (!code) {
            this.subjectError = 'Subject code is required.';
            return;
        }
        this.subjectSaving = true;
        this.subjectError = null;
        const districtId = this.district.districtId;
        const editing = this.subjectEditingSubjectId;
        /**
         * Subjects are stored in the shared subjects table (portal convention) and
         * linked per district through district_subjects — Add creates the subject
         * and links it to THIS district only; Edit updates the record and keeps
         * the district link status in sync.
         */
        const request$ = editing
            ? this.setups.updateSubject(editing, {
                  subjectCode: code,
                  subjectName: name,
                  isActive: true,
                  updatedBy: this.actor,
              })
            : this.setups.createSubject({ subjectCode: code, subjectName: name, createdBy: this.actor });
        request$
            .pipe(
                // The generic POST envelope returns data as a single-row array — normalize.
                map((subject: { subjectId: number }) =>
                    Array.isArray(subject) ? (subject[0] as { subjectId: number }) : subject,
                ),
                switchMap((subject: { subjectId: number }) => {
                    if (editing) {
                        // Update the district link status to match the form.
                        const link = (this.subjects.find((s) => s.subjectId === editing) ?? null);
                        if (link?.districtSubjectId && link.isActive !== this.subjectForm.isActive) {
                            return this.http
                                .put<ApiResponseShape>(`${this.api}/district-subjects/${link.districtSubjectId}`, {
                                    isActive: this.subjectForm.isActive,
                                    updatedBy: this.actor,
                                })
                                .pipe(map(() => subject));
                        }
                        return of(subject);
                    }
                    return this.http
                        .post<ApiResponseShape>(`${this.api}/district-subjects`, {
                            districtId,
                            subjectId: subject.subjectId,
                            isActive: this.subjectForm.isActive,
                            createdBy: this.actor,
                        })
                        .pipe(map(() => subject));
                }),
                finalize(() => {
                    this.subjectSaving = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: () => {
                    this.closeSubjectModal();
                    this.toast(editing ? 'Subject updated' : 'Subject added');
                    this.reloadSubjects();
                },
                error: (err: HttpErrorResponse) => {
                    this.subjectError = err?.error?.message || 'Could not save the subject.';
                    this.cdr.markForCheck();
                },
            });
    }

    toggleSubject(subject: DistrictSubjectDto): void {
        if (!subject.districtSubjectId) return;
        this.http
            .put<ApiResponseShape>(`${this.api}/district-subjects/${subject.districtSubjectId}`, {
                isActive: subject.isActive === false,
                updatedBy: this.actor,
            })
            .subscribe({
                next: () => {
                    this.toast(`Subject ${subject.isActive === false ? 'activated' : 'deactivated'}`);
                    this.reloadSubjects();
                },
                error: (err: HttpErrorResponse) => this.toast(err?.error?.message || 'Could not update the subject.', 'error'),
            });
    }

    private reloadSubjects(): void {
        if (!this.district) return;
        this.setups
            .listDistrictSubjects(this.district.districtId)
            .pipe(catchError(() => of([] as DistrictSubjectDto[])))
            .subscribe((rows) => {
                this.subjects = rows;
                this.cdr.markForCheck();
            });
    }

    // ---------------- users ----------------

    @ViewChild('userModal') userModal?: NgxCustomModalComponent;
    @ViewChild('resetPasswordModal') resetPasswordModal?: NgxCustomModalComponent;
    userEditingId: number | null = null;
    userEditingSource: UserItemDto | null = null;
    userSaving = false;
    userError: string | null = null;
    userForm: {
        firstName: string;
        lastName: string;
        email: string;
        roleId: number | null;
        campusId: number | null;
        isActive: boolean;
        password: string;
    } = {
        firstName: '',
        lastName: '',
        email: '',
        roleId: ROLE_IDS.Teacher,
        campusId: null,
        isActive: true,
        password: '',
    };
    /** Role ids that need a campus assignment (Principal / Teacher). */
    readonly campusRequiredRoleIds: number[] = [ROLE_IDS.Principal, ROLE_IDS.Teacher];

    openUserModal(user: UserItemDto | null): void {
        this.userEditingId = user ? user.userId : null;
        this.userEditingSource = user;
        const assignment = user ? this.districtAssignment(user) : null;
        this.userForm = {
            firstName: user?.firstName ?? '',
            lastName: user?.lastName ?? '',
            email: user?.email ?? '',
            roleId: assignment?.roleId ?? ROLE_IDS.Teacher,
            campusId: assignment?.campusId ?? null,
            isActive: user ? !!user.isActive : true,
            password: '',
        };
        this.userError = null;
        this.userModal?.open();
        this.cdr.markForCheck();
    }

    closeUserModal(): void {
        this.userModal?.close();
    }

    /** The user's active role assignment inside the OPEN district (never another district's). */
    private districtAssignment(user: UserItemDto): UserRoleAssignmentItemDto | null {
        if (!this.district) return null;
        return (user.roleAssignments ?? []).find(
            (a) => Number(a.districtId) === Number(this.district!.districtId) && a.isActive !== false,
        ) ?? null;
    }

    roleName(roleId: number | null): string {
        return this.roles.find((r) => r.roleId === roleId)?.roleName ?? `Role ${roleId ?? '—'}`;
    }

    campusName(campusId: number | null): string {
        if (campusId == null) return '—';
        return this.campuses.find((c) => c.campusId === campusId)?.campusName ?? `Campus ${campusId}`;
    }

    userAssignmentCampus(user: UserItemDto): string {
        const a = this.districtAssignment(user);
        return a?.campusId != null ? this.campusName(a.campusId) : '—';
    }

    userAssignmentRole(user: UserItemDto): string {
        const a = this.districtAssignment(user);
        return a ? this.roleName(a.roleId) : this.roleNames(user);
    }

    saveUser(): void {
        if (!this.district) return;
        const firstName = this.userForm.firstName.trim();
        const lastName = this.userForm.lastName.trim();
        const email = this.userForm.email.trim();
        const roleId = this.userForm.roleId;
        if (!firstName && !lastName) {
            this.userError = 'Name is required.';
            return;
        }
        if (!email) {
            this.userError = 'Email is required.';
            return;
        }
        if (roleId == null) {
            this.userError = 'Role is required.';
            return;
        }
        const needsCampus = this.campusRequiredRoleIds.includes(roleId);
        if (needsCampus && this.userForm.campusId == null) {
            this.userError = 'Campus assignment is required for this role.';
            return;
        }
        if (!this.userEditingId && !this.userForm.password.trim()) {
            this.userError = 'Password is required for a new user.';
            return;
        }
        this.userSaving = true;
        this.userError = null;
        const districtId = this.district.districtId;
        const stateId = this.district.stateId;
        const assignment: UserRoleAssignmentRequest = {
            roleId: Number(roleId),
            stateId,
            districtId,
            campusId: needsCampus ? Number(this.userForm.campusId) : null,
            teacherId: null,
            isActive: true,
        };
        const editing = this.userEditingId;
        const buildRequest = (extraAssignments: UserRoleAssignmentRequest[]) => ({
            email,
            firstName,
            lastName,
            displayName: `${firstName} ${lastName}`.trim() || email,
            isActive: this.userForm.isActive,
            password: !editing && this.userForm.password.trim() ? this.userForm.password.trim() : undefined,
            roleAssignments: [assignment, ...extraAssignments],
            createdBy: this.actor,
            updatedBy: this.actor,
        });
        const request$ = editing
            ? of(this.userEditingSource).pipe(
                  map((existing) => {
                      if (!existing) {
                          throw new Error('User not found.');
                      }
                      // Keep the user's other (non-edited) assignments untouched.
                      const others = (existing.roleAssignments ?? [])
                          .filter((a) => a.isActive !== false && Number(a.districtId) !== Number(districtId))
                          .map((a) => ({ ...a }));
                      return buildRequest(others);
                  }),
                  switchMap((body) => this.usersService.updateUser(editing, body)),
              )
            : of(null).pipe(map(() => buildRequest([])), switchMap((body) => this.usersService.createUser(body)));
        request$
            .pipe(finalize(() => {
                this.userSaving = false;
                this.cdr.markForCheck();
            }))
            .subscribe({
                next: () => {
                    this.closeUserModal();
                    this.toast(editing ? 'User updated' : 'User added');
                    this.reloadUsers();
                },
                error: (err: HttpErrorResponse) => {
                    this.userError = err?.error?.message || 'Could not save the user.';
                    this.cdr.markForCheck();
                },
            });
    }

    toggleUser(user: UserItemDto): void {
        this.usersService
            .updateUser(user.userId, {
                email: user.email,
                firstName: user.firstName ?? '',
                lastName: user.lastName ?? '',
                displayName: user.displayName ?? user.email,
                isActive: !user.isActive,
                roleAssignments: (user.roleAssignments ?? [])
                    .filter((a) => a.isActive !== false)
                    .map((a) => ({ ...a, isActive: true })),
                updatedBy: this.actor,
            })
            .subscribe({
                next: () => {
                    this.toast(`User ${user.isActive ? 'deactivated' : 'activated'}`);
                    this.reloadUsers();
                },
                error: (err: HttpErrorResponse) => this.toast(err?.error?.message || 'Could not update the user.', 'error'),
            });
    }

    // ---- reset password (uses the portal's existing forgot/reset flow; never shows passwords) ----

    resetPasswordUser: UserItemDto | null = null;
    resetPasswordSaving = false;
    resetPasswordError: string | null = null;
    resetPasswordForm = { newPassword: '', confirmPassword: '' };

    openResetPasswordModal(user: UserItemDto): void {
        this.resetPasswordUser = user;
        this.resetPasswordForm = { newPassword: '', confirmPassword: '' };
        this.resetPasswordError = null;
        this.resetPasswordModal?.open();
        this.cdr.markForCheck();
    }

    closeResetPasswordModal(): void {
        this.resetPasswordModal?.close();
    }

    saveResetPassword(): void {
        const user = this.resetPasswordUser;
        if (!user) return;
        const newPassword = this.resetPasswordForm.newPassword;
        if (!newPassword || newPassword.length < 6) {
            this.resetPasswordError = 'New password must be at least 6 characters.';
            return;
        }
        if (newPassword !== this.resetPasswordForm.confirmPassword) {
            this.resetPasswordError = 'Passwords do not match.';
            return;
        }
        this.resetPasswordSaving = true;
        this.resetPasswordError = null;
        /**
         * Follows the portal's existing password flow: POST /auth/forgot-password
         * issues a reset token for the user's email, then POST /auth/reset-password
         * sets the new password with that token. Existing passwords are never
         * displayed or returned.
         */
        this.auth
            .forgotPassword({ email: user.email })
            .pipe(
                switchMap((r) => {
                    const token = (r?.data as { resetToken?: string } | null)?.resetToken;
                    if (!token) {
                        throw new Error('Could not issue a reset token for this account.');
                    }
                    return this.auth.resetPassword({ token, newPassword });
                }),
                finalize(() => {
                    this.resetPasswordSaving = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: () => {
                    this.closeResetPasswordModal();
                    this.toast(`Password reset for ${user.email}`);
                },
                error: (err: HttpErrorResponse | Error) => {
                    this.resetPasswordError =
                        (err as HttpErrorResponse)?.error?.message ||
                        (err as Error)?.message ||
                        'Could not reset the password.';
                    this.cdr.markForCheck();
                },
            });
    }

    private reloadUsers(): void {
        if (!this.district) return;
        this.usersService
            .listUsers({ districtId: this.district.districtId })
            .pipe(catchError(() => of([] as UserItemDto[])))
            .subscribe((rows) => {
                this.users = rows;
                this.cdr.markForCheck();
            });
    }

    // ---------------- T-TESS Questions ----------------

    @ViewChild('ttessQuestionModal') ttessQuestionModal?: NgxCustomModalComponent;
    ttessQuestionEditingId: number | null = null;
    ttessQuestionSaving = false;
    ttessQuestionError: string | null = null;
    ttessQuestionForm: {
        ttessDomainId: number | null;
        questionCode: string;
        questionText: string;
        isActive: boolean;
    } = {
        ttessDomainId: null,
        questionCode: '',
        questionText: '',
        isActive: true,
    };
    /** Domain currently being renamed inline (ttessDomainId). */
    ttessDomainEditingId: number | null = null;
    ttessDomainEditName = '';
    ttessDomainSaving = false;
    /** Editable copies of the rating options (label + point value). */
    ttessOptionsDraft: Array<{ ttessOptionId: number; optionLabel: string; pointValue: number | string }> = [];
    ttessOptionsSaving = false;
    ttessOptionsError: string | null = null;
    /** True while a rubric mutation (question move / toggle) is in flight. */
    ttessRubricBusy = false;

    private applyTtessRubric(rubric: TtessRubric | null): void {
        this.ttessRubric = rubric;
        this.ttessOptionsDraft = (rubric?.options ?? []).map((o) => ({
            ttessOptionId: o.ttessOptionId,
            optionLabel: o.optionLabel,
            pointValue: o.pointValue,
        }));
        this.cdr.markForCheck();
    }

    reloadTtessRubric(): void {
        if (!this.district) return;
        this.teacherAssessment
            .getTtessRubric(this.district.districtId)
            .pipe(catchError(() => of(null as TtessRubric | null)))
            .subscribe((rubric) => this.applyTtessRubric(rubric));
    }

    startTtessDomainEdit(domain: { ttessDomainId: number; domainName: string }): void {
        this.ttessDomainEditingId = domain.ttessDomainId;
        this.ttessDomainEditName = domain.domainName;
        this.cdr.markForCheck();
    }

    cancelTtessDomainEdit(): void {
        this.ttessDomainEditingId = null;
        this.ttessDomainEditName = '';
        this.cdr.markForCheck();
    }

    saveTtessDomain(domain: { ttessDomainId: number }): void {
        const name = this.ttessDomainEditName.trim();
        if (!name) return;
        this.ttessDomainSaving = true;
        this.cdr.markForCheck();
        this.teacherAssessment
            .updateTtessDomain(domain.ttessDomainId, name, this.actor)
            .pipe(finalize(() => {
                this.ttessDomainSaving = false;
                this.cdr.markForCheck();
            }))
            .subscribe({
                next: (rubric) => {
                    this.cancelTtessDomainEdit();
                    this.applyTtessRubric(rubric);
                    this.toast('Domain name updated');
                },
                error: (err: HttpErrorResponse) => this.toast(err?.error?.message || 'Could not update the domain.', 'error'),
            });
    }

    openTtessQuestionModal(domainId: number, question: { ttessQuestionId: number; questionCode: string; questionText: string; isActive: boolean } | null): void {
        this.ttessQuestionEditingId = question ? question.ttessQuestionId : null;
        this.ttessQuestionForm = {
            ttessDomainId: domainId,
            questionCode: question?.questionCode ?? '',
            questionText: question?.questionText ?? '',
            isActive: question ? !!question.isActive : true,
        };
        this.ttessQuestionError = null;
        this.ttessQuestionModal?.open();
        this.cdr.markForCheck();
    }

    closeTtessQuestionModal(): void {
        this.ttessQuestionModal?.close();
    }

    saveTtessQuestion(): void {
        if (!this.district) return;
        const code = this.ttessQuestionForm.questionCode.trim();
        const text = this.ttessQuestionForm.questionText.trim();
        if (!this.ttessQuestionForm.ttessDomainId) {
            this.ttessQuestionError = 'Domain is required.';
            return;
        }
        if (!code) {
            this.ttessQuestionError = 'Question code is required.';
            return;
        }
        if (!text) {
            this.ttessQuestionError = 'Question text is required.';
            return;
        }
        this.ttessQuestionSaving = true;
        this.ttessQuestionError = null;
        const editing = this.ttessQuestionEditingId;
        const request$ = editing
            ? this.teacherAssessment.updateTtessQuestion(editing, {
                  questionCode: code,
                  questionText: text,
                  isActive: this.ttessQuestionForm.isActive,
                  updatedBy: this.actor,
              })
            : this.teacherAssessment.createTtessQuestion({
                  districtId: this.district.districtId,
                  ttessDomainId: this.ttessQuestionForm.ttessDomainId,
                  questionCode: code,
                  questionText: text,
                  createdBy: this.actor,
              });
        request$
            .pipe(finalize(() => {
                this.ttessQuestionSaving = false;
                this.cdr.markForCheck();
            }))
            .subscribe({
                next: (rubric) => {
                    this.closeTtessQuestionModal();
                    this.applyTtessRubric(rubric);
                    this.toast(editing ? 'Question updated' : 'Question added');
                },
                error: (err: HttpErrorResponse) => {
                    this.ttessQuestionError = err?.error?.message || 'Could not save the question.';
                    this.cdr.markForCheck();
                },
            });
    }

    toggleTtessQuestion(question: { ttessQuestionId: number; questionCode: string; isActive: boolean }): void {
        this.ttessRubricBusy = true;
        this.cdr.markForCheck();
        this.teacherAssessment
            .updateTtessQuestion(question.ttessQuestionId, { isActive: !question.isActive, updatedBy: this.actor })
            .pipe(finalize(() => {
                this.ttessRubricBusy = false;
                this.cdr.markForCheck();
            }))
            .subscribe({
                next: (rubric) => {
                    this.applyTtessRubric(rubric);
                    this.toast(`Question ${question.isActive ? 'deactivated' : 'activated'}`);
                },
                error: (err: HttpErrorResponse) => this.toast(err?.error?.message || 'Could not update the question.', 'error'),
            });
    }

    /** Move a question up/down within its domain (sends the domain's full id order). */
    moveTtessQuestion(domain: { questions: Array<{ ttessQuestionId: number }> }, index: number, direction: -1 | 1): void {
        if (!this.district) return;
        const target = index + direction;
        if (target < 0 || target >= domain.questions.length) return;
        const ids = domain.questions.map((q) => q.ttessQuestionId);
        [ids[index], ids[target]] = [ids[target], ids[index]];
        this.ttessRubricBusy = true;
        this.cdr.markForCheck();
        this.teacherAssessment
            .reorderTtessQuestions(this.district.districtId, ids, this.actor)
            .pipe(finalize(() => {
                this.ttessRubricBusy = false;
                this.cdr.markForCheck();
            }))
            .subscribe({
                next: (rubric) => this.applyTtessRubric(rubric),
                error: (err: HttpErrorResponse) => this.toast(err?.error?.message || 'Could not reorder the questions.', 'error'),
            });
    }

    saveTtessOptions(): void {
        if (!this.district) return;
        const options = this.ttessOptionsDraft.map((o) => ({
            ttessOptionId: o.ttessOptionId,
            optionLabel: String(o.optionLabel).trim(),
            pointValue: Number(o.pointValue),
        }));
        if (options.some((o) => !o.optionLabel || !Number.isFinite(o.pointValue) || o.pointValue < 0)) {
            this.ttessOptionsError = 'Every option needs a label and a point value of 0 or more.';
            this.cdr.markForCheck();
            return;
        }
        const values = options.map((o) => o.pointValue);
        if (new Set(values).size !== values.length) {
            this.ttessOptionsError = 'Point values must be unique.';
            this.cdr.markForCheck();
            return;
        }
        this.ttessOptionsSaving = true;
        this.ttessOptionsError = null;
        this.cdr.markForCheck();
        this.teacherAssessment
            .updateTtessOptions(this.district.districtId, options, this.actor)
            .pipe(finalize(() => {
                this.ttessOptionsSaving = false;
                this.cdr.markForCheck();
            }))
            .subscribe({
                next: (rubric) => {
                    this.applyTtessRubric(rubric);
                    this.toast('Rating scale updated');
                },
                error: (err: HttpErrorResponse) => {
                    this.ttessOptionsError = err?.error?.message || 'Could not update the rating scale.';
                    this.cdr.markForCheck();
                },
            });
    }

    // ---------------- helpers ----------------

    scrollTo(sectionId: string, event: Event): void {
        event.preventDefault();
        this.activeSection.set(sectionId);
        const el = document.getElementById(sectionId);
        if (el) {
            const y = el.getBoundingClientRect().top + (window.scrollY || document.documentElement.scrollTop) - 90;
            window.scrollTo({ top: Math.max(0, y), behavior: 'instant' });
        }
    }

    stateName(stateId: number): string {
        const s = this.states.find((x) => x.stateId === stateId);
        return s ? `${s.stateName} (${s.stateCode})` : `State ${stateId}`;
    }

    categoryName(categoryId: number): string {
        const c = this.campusCategories.find((x) => x.campusCategoryId === categoryId);
        return c?.categoryName ?? '—';
    }

    roleNames(user: UserItemDto): string {
        const roles = (user.roleAssignments ?? [])
            .map((ra) => ra.roleName)
            .filter((n): n is string => !!n);
        return roles.length ? roles.join(', ') : '—';
    }

    userLabel(user: UserItemDto): string {
        return user.displayName || [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email;
    }

    goBack(): void {
        this.router.navigate(['/user-setups']);
    }
}

interface ApiResponseShape {
    statusCode: number;
    message: string;
    data?: any;
}
