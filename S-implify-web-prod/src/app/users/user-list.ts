import { ChangeDetectorRef, Component, OnInit, ViewChild } from '@angular/core';
import { NgxCustomModalComponent } from 'ngx-custom-modal';
import Swal from 'sweetalert2';
import {
    ROLE_IDS,
    buildRoleAssignmentFromRoleId,
    creatableRoleLabel,
    groupTypesLabelFromRoleAssignments,
    parseTeacherSummaryName,
    roleIdFromName,
} from '../core/constants/auth-roles';
import type {
    Campus,
    District,
    RoleDto,
    State,
    TeacherSummaryDto,
    UserItemDto,
    UserRequest,
    UserRoleAssignmentItemDto,
    UserRoleAssignmentRequest,
} from '../core/models/simplify-api.model';
import { AuthService } from '../core/services/auth.service';
import { FiltersService } from '../core/services/filters.service';
import { RolesService } from '../core/services/roles.service';
import { TeachersService } from '../core/services/teachers.service';
import { UsersService } from '../core/services/users.service';

export interface UserListRow {
    id: number;
    firstName: string;
    lastName: string;
    userName: string;
    groupType: string;
    email: string;
    stateId?: number;
    districtId?: number;
    campusId?: number;
    teacherId?: number;
    isActive: boolean;
}

@Component({
    selector: 'app-user-list',
    templateUrl: './user-list.html',
    standalone: false,
})
export class UserListComponent implements OnInit {
    @ViewChild('addUserModal') addUserModal?: NgxCustomModalComponent;

    saving = false;
    loading = false;
    loadError = '';
    statesLoading = false;
    districtsLoading = false;
    campusesLoading = false;
    teachersLoading = false;
    rolesLoading = false;
    userModalLoading = false;
    userModalMode: 'add' | 'edit' | 'view' = 'add';
    modalUserId: number | null = null;

    states: State[] = [];
    districts: District[] = [];
    campuses: Campus[] = [];
    teachers: TeacherSummaryDto[] = [];
    roles: RoleDto[] = [];

    addForm = this.emptyAddForm();

    cols: any[] = [
        { field: 'firstName', title: 'First Name' },
        { field: 'lastName', title: 'Last Name' },
        { field: 'userName', title: 'User Name' },
        { field: 'groupType', title: 'Group Type' },
        { field: 'email', title: 'Email' },
        { field: 'actions', title: 'Action', sort: false },
    ];

    rows: UserListRow[] = [];
    private editingUser: UserItemDto | null = null;

    constructor(
        private filters: FiltersService,
        private users: UsersService,
        private rolesService: RolesService,
        private teachersService: TeachersService,
        private auth: AuthService,
        private cdr: ChangeDetectorRef,
    ) {}

    ngOnInit(): void {
        this.loadUsers();
        this.loadStates();
        this.loadRoles();
    }

    openAddUserModal(): void {
        this.userModalMode = 'add';
        this.modalUserId = null;
        this.editingUser = null;
        this.userModalLoading = false;
        this.addForm = this.emptyAddForm();
        this.districts = [];
        this.campuses = [];
        this.teachers = [];
        this.loadStates();
        this.loadRoles();
        this.addUserModal?.open();
    }

    viewUser(row: UserListRow): void {
        this.openUserModal(row, 'view');
    }

    editUser(row: UserListRow): void {
        this.openUserModal(row, 'edit');
    }

    private openUserModal(row: UserListRow, mode: 'edit' | 'view'): void {
        this.userModalMode = mode;
        this.modalUserId = row.id;
        this.editingUser = null;
        this.userModalLoading = true;
        this.addForm = this.emptyAddForm();
        this.districts = [];
        this.campuses = [];
        this.teachers = [];
        this.loadRoles();

        this.users.getUser(row.id).subscribe({
            next: (user) => {
                this.editingUser = user;
                this.applyUserToForm(user);
                this.loadEditScope(user);
            },
            error: (err) => {
                this.userModalLoading = false;
                this.userModalMode = 'add';
                this.modalUserId = null;
                this.toast(err?.error?.message || err?.message || 'Could not load user.', 'error');
                this.cdr.markForCheck();
            },
        });
    }

    get isEditMode(): boolean {
        return this.userModalMode === 'edit';
    }

    get isViewMode(): boolean {
        return this.userModalMode === 'view';
    }

    get isFormReadonly(): boolean {
        return this.isViewMode;
    }

    /** Super admin scope is state-wide; district may be cleared with All. */
    get isSuperAdminRole(): boolean {
        return this.selectedRoleKinds().includes(ROLE_IDS.SuperAdmin);
    }

    /** District-wide roles do not require a campus; All clears campus scope. */
    get showCampusAllOption(): boolean {
        const kinds = this.selectedRoleKinds();
        return kinds.includes(ROLE_IDS.SuperAdmin) || kinds.includes(ROLE_IDS.DistrictAdmin);
    }

    get requiresDistrictScope(): boolean {
        return this.selectedRoleKinds().some(
            (kind) =>
                kind === ROLE_IDS.DistrictAdmin ||
                kind === ROLE_IDS.Principal ||
                kind === ROLE_IDS.Teacher,
        );
    }

    get requiresCampusScope(): boolean {
        const kinds = this.selectedRoleKinds();
        return kinds.includes(ROLE_IDS.Principal) || kinds.includes(ROLE_IDS.Teacher);
    }

    get requiresTeacherScope(): boolean {
        return this.selectedRoleKinds().includes(ROLE_IDS.Teacher);
    }

    get selectedRoleCount(): number {
        return this.addForm.roleIds.length;
    }

    get viewStatusLabel(): string {
        return this.editingUser?.isActive === false ? 'Inactive' : 'Active';
    }

    closeAddUserModal(): void {
        this.userModalMode = 'add';
        this.modalUserId = null;
        this.editingUser = null;
        this.userModalLoading = false;
        this.addUserModal?.close();
    }

    loadUsers(): void {
        this.loading = true;
        this.loadError = '';
        const activeRole = this.auth.getActiveRole();
        const districtId = this.auth.getCurrentUser()?.districtId ?? undefined;
        const opts: {
            districtId?: number;
            activeOnly: boolean;
            roleId?: number;
            userRoleAssignmentId?: number;
        } = { activeOnly: false };
        if (districtId != null) {
            opts.districtId = districtId;
        }
        if (activeRole?.roleId != null) {
            opts.roleId = activeRole.roleId;
        }
        if (activeRole?.userRoleAssignmentId != null) {
            opts.userRoleAssignmentId = activeRole.userRoleAssignmentId;
        }
        this.users.listUsers(opts).subscribe({
            next: (items) => {
                this.rows = items.map((u) => this.toRow(u));
                this.loading = false;
                this.cdr.markForCheck();
            },
            error: (err) => {
                this.rows = [];
                this.loading = false;
                this.loadError = err?.error?.message || err?.message || 'Could not load users.';
                this.cdr.markForCheck();
            },
        });
    }

    loadRoles(): void {
        this.rolesLoading = true;
        this.rolesService.listRoles().subscribe({
            next: (rows) => {
                this.roles = rows;
                this.rolesLoading = false;
                this.cdr.markForCheck();
            },
            error: () => {
                this.roles = [];
                this.rolesLoading = false;
                this.cdr.markForCheck();
            },
        });
    }

    roleLabel(role: RoleDto): string {
        return creatableRoleLabel(role);
    }

    isRoleSelected(roleId: number): boolean {
        return this.addForm.roleIds.includes(roleId);
    }

    toggleRole(roleId: number): void {
        if (this.isFormReadonly) {
            return;
        }
        if (this.isRoleSelected(roleId)) {
            this.addForm.roleIds = this.addForm.roleIds.filter((id) => id !== roleId);
        } else {
            this.addForm.roleIds = [...this.addForm.roleIds, roleId];
        }
        this.syncRoleDescriptionFields();
        this.syncRoleTtessAccessFields();
        this.onRoleChange();
    }

    isPrincipalRoleId(roleId: number): boolean {
        return roleId === ROLE_IDS.Principal;
    }

    isTtessAccessRoleId(roleId: number): boolean {
        return roleId === ROLE_IDS.Principal || roleId === ROLE_IDS.DistrictAdmin;
    }

    roleTtessAccessFor(roleId: number): boolean {
        return this.addForm.roleTtessAccess[roleId] ?? true;
    }

    setRoleTtessAccess(roleId: number, enabled: boolean): void {
        if (this.isFormReadonly) {
            return;
        }
        this.addForm.roleTtessAccess[roleId] = enabled;
    }

    roleDescriptionFor(roleId: number): string {
        return this.addForm.roleDescriptions[roleId] ?? '';
    }

    setRoleDescription(roleId: number, value: string): void {
        this.addForm.roleDescriptions[roleId] = value;
    }

    loadStates(): void {
        this.statesLoading = true;
        this.filters.listStates(true).subscribe({
            next: (rows) => {
                this.states = rows;
                this.statesLoading = false;
                if (rows.length && !this.addForm.stateId) {
                    this.addForm.stateId = rows[0].stateId;
                    this.onStateChange();
                }
                this.cdr.markForCheck();
            },
            error: () => {
                this.states = [];
                this.statesLoading = false;
                this.cdr.markForCheck();
            },
        });
    }

    onStateChange(): void {
        this.addForm.districtId = null;
        this.resetCampusAndTeacher();
        this.districts = [];
        if (this.addForm.stateId == null) {
            this.cdr.markForCheck();
            return;
        }
        this.districtsLoading = true;
        this.filters.listDistricts({ stateId: this.addForm.stateId, activeOnly: true }).subscribe({
            next: (rows) => {
                this.districts = rows;
                this.districtsLoading = false;
                if (rows.length) {
                    if (this.isSuperAdminRole && !this.requiresDistrictScope) {
                        this.addForm.districtId = null;
                        this.resetCampusAndTeacher();
                    } else {
                        this.addForm.districtId = rows[0].districtId;
                        this.onDistrictChange();
                    }
                }
                this.cdr.markForCheck();
            },
            error: () => {
                this.districts = [];
                this.districtsLoading = false;
                this.cdr.markForCheck();
            },
        });
    }

    onDistrictChange(): void {
        this.resetCampusAndTeacher();
        if (this.addForm.districtId == null) {
            this.cdr.markForCheck();
            return;
        }
        this.campusesLoading = true;
        this.filters.listCampuses({ districtId: this.addForm.districtId, activeOnly: true }).subscribe({
            next: (rows) => {
                this.campuses = rows;
                this.campusesLoading = false;
                this.cdr.markForCheck();
            },
            error: () => {
                this.campuses = [];
                this.campusesLoading = false;
                this.cdr.markForCheck();
            },
        });
    }

    onCampusChange(): void {
        this.addForm.teacherId = null;
        this.addForm.firstName = '';
        this.addForm.lastName = '';
        this.teachers = [];
        const campus = this.selectedCampus();
        if (!campus || this.addForm.districtId == null) {
            this.cdr.markForCheck();
            return;
        }
        this.teachersLoading = true;
        this.teachersService.listTeachersByCampus(this.addForm.districtId, campus.campusCode).subscribe({
            next: (rows) => {
                this.teachers = rows;
                this.teachersLoading = false;
                this.cdr.markForCheck();
            },
            error: () => {
                this.teachers = [];
                this.teachersLoading = false;
                this.cdr.markForCheck();
            },
        });
    }

    onTeacherChange(): void {
        const selectedId = this.addForm.teacherId;
        const teacher = this.teachers.find(
            (t) => t.teacherId != null && String(t.teacherId) === String(selectedId),
        );
        if (!teacher) {
            this.addForm.firstName = '';
            this.addForm.lastName = '';
            this.cdr.markForCheck();
            return;
        }
        if (teacher.firstName?.trim() || teacher.lastName?.trim()) {
            this.addForm.firstName = teacher.firstName?.trim() ?? '';
            this.addForm.lastName = teacher.lastName?.trim() ?? '';
        } else {
            const { firstName, lastName } = parseTeacherSummaryName(teacher.teacherName);
            this.addForm.firstName = firstName;
            this.addForm.lastName = lastName;
        }
        this.cdr.markForCheck();
    }

    teacherDisplayName(teacher: TeacherSummaryDto): string {
        return (
            teacher.teacherName?.trim() ||
            [teacher.firstName, teacher.lastName].filter(Boolean).join(' ').trim() ||
            teacher.teacherIdExternal?.trim() ||
            (teacher.teacherId != null ? String(teacher.teacherId) : '') ||
            'Unknown teacher'
        );
    }

    onRoleChange(): void {
        const kinds = this.selectedRoleKinds();
        if (kinds.includes(ROLE_IDS.SuperAdmin) && !this.requiresDistrictScope) {
            this.addForm.districtId = null;
            this.resetCampusAndTeacher(false);
        } else if (
            kinds.includes(ROLE_IDS.DistrictAdmin) &&
            !this.requiresCampusScope &&
            !this.requiresTeacherScope
        ) {
            this.addForm.campusId = null;
            this.addForm.teacherId = null;
            this.teachers = [];
        }
        if (!kinds.includes(ROLE_IDS.Teacher) && this.addForm.teacherId != null) {
            this.addForm.teacherId = null;
        }
        this.cdr.markForCheck();
    }

    selectedRoles(): RoleDto[] {
        return this.roles.filter((role) => this.addForm.roleIds.includes(role.roleId));
    }

    private selectedRoleKinds(): number[] {
        return this.selectedRoles().map((role) => roleIdFromName(role.roleName) ?? role.roleId);
    }

    saveUser(): void {
        const firstName = this.addForm.firstName.trim();
        const lastName = this.addForm.lastName.trim();
        const userName = this.addForm.userName.trim();
        const email = this.addForm.email.trim();
        const password = this.addForm.password;
        const confirmPassword = this.addForm.confirmPassword;

        const roleIds = this.addForm.roleIds;
        if (!roleIds.length) {
            this.toast('Select at least one group type.', 'warning');
            return;
        }

        const selectedRoles = this.selectedRoles();
        const kinds = this.selectedRoleKinds();

        if (kinds.includes(ROLE_IDS.SuperAdmin) && !this.addForm.stateId) {
            this.toast('Select a state.', 'warning');
            return;
        }
        if (this.requiresDistrictScope && (!this.addForm.stateId || !this.addForm.districtId)) {
            this.toast('Select a state and district for the selected group types.', 'warning');
            return;
        }
        if (this.requiresCampusScope && !this.addForm.campusId) {
            this.toast('Select a campus for the selected group types.', 'warning');
            return;
        }
        if (this.requiresTeacherScope && !this.addForm.teacherId) {
            this.toast('Select a teacher for the teacher role.', 'warning');
            return;
        }
        if (!firstName || !lastName || !userName || !email) {
            this.toast('First name, last name, username, and email are required.', 'warning');
            return;
        }
        if (!this.isEditMode) {
            if (!password || password.length < 6) {
                this.toast('Password must be at least 6 characters.', 'warning');
                return;
            }
            if (password !== confirmPassword) {
                this.toast('Passwords do not match.', 'warning');
                return;
            }
        } else if (password || confirmPassword) {
            if (password.length < 6) {
                this.toast('Password must be at least 6 characters.', 'warning');
                return;
            }
            if (password !== confirmPassword) {
                this.toast('Passwords do not match.', 'warning');
                return;
            }
        }

        const scope = {
            stateId: this.addForm.stateId,
            districtId: this.addForm.districtId,
            campusId: this.addForm.campusId,
            teacherId: this.coerceId(this.addForm.teacherId),
        };
        const builtAssignments: UserRoleAssignmentRequest[] = [];

        for (const role of selectedRoles) {
            const assignment = buildRoleAssignmentFromRoleId(
                role.roleId,
                scope,
                role.roleName,
            );
            if (!assignment) {
                this.toast(`Could not build role assignment for ${this.roleLabel(role)}.`, 'warning');
                return;
            }
            const roleDescription = (this.addForm.roleDescriptions[role.roleId] ?? '').trim();
            if (roleDescription) {
                assignment.roleDescription = roleDescription;
            }
            if (this.isTtessAccessRoleId(role.roleId)) {
                assignment.ttessAccess = this.roleTtessAccessFor(role.roleId);
            }
            builtAssignments.push(assignment);
        }

        this.saving = true;
        this.cdr.markForCheck();

        const actor = this.auth.getCurrentUser()?.email;
        const roleAssignments = this.isEditMode
            ? this.buildRoleAssignmentsForSave(builtAssignments)
            : builtAssignments.map((a) => this.users.normalizeRoleAssignment(a));

        const payload: UserRequest = {
            email,
            displayName: userName,
            firstName,
            lastName,
            isActive: this.editingUser?.isActive ?? true,
            roleAssignments,
            ...(password ? { password } : {}),
        };

        if (this.isEditMode) {
            payload.createdBy = this.editingUser?.createdBy ?? actor ?? null;
            payload.updatedBy = actor ?? null;
        } else {
            payload.createdBy = actor ?? null;
        }

        const request$ = this.isEditMode
            ? this.users.updateUser(this.modalUserId!, payload)
            : this.users.createUser(payload);

        request$.subscribe({
            next: (saved) => {
                const updatedRow = this.toRow(saved);
                if (this.isEditMode) {
                    this.rows = this.rows.map((r) => (r.id === updatedRow.id ? updatedRow : r));
                    this.toast('User updated.', 'success');
                } else {
                    this.rows = [updatedRow, ...this.rows];
                    this.toast('User created.', 'success');
                }
                this.saving = false;
                this.closeAddUserModal();
                this.cdr.markForCheck();
            },
            error: (err) => {
                this.saving = false;
                this.toast(
                    err?.error?.message || err?.message || (this.isEditMode ? 'Could not update user.' : 'Could not create user.'),
                    'error',
                );
                this.cdr.markForCheck();
            },
        });
    }

    deleteUser(row: UserListRow): void {
        void Swal.fire({
            title: 'Remove user?',
            text: `${row.firstName} ${row.lastName} will be deactivated.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Remove',
            cancelButtonText: 'Cancel',
            customClass: { confirmButton: 'btn btn-danger', cancelButton: 'btn btn-outline-danger ltr:ml-3 rtl:mr-3' },
            buttonsStyling: false,
        }).then((result) => {
            if (!result.isConfirmed) {
                return;
            }
            this.users.deleteUser(row.id).subscribe({
                next: () => {
                    this.rows = this.rows.filter((r) => r.id !== row.id);
                    this.toast('User removed.', 'success');
                    this.cdr.markForCheck();
                },
                error: (err) => {
                    this.toast(err?.error?.message || err?.message || 'Could not remove user.', 'error');
                    this.cdr.markForCheck();
                },
            });
        });
    }

    private selectedCampus(): Campus | undefined {
        return this.campuses.find((c) => c.campusId === this.addForm.campusId);
    }

    private activeRoleAssignments(user: UserItemDto): UserRoleAssignmentItemDto[] {
        return user.roleAssignments?.filter((a) => a.isActive !== false) ?? user.roleAssignments ?? [];
    }

    private assignmentRoleKind(assignment: UserRoleAssignmentItemDto): number | null {
        return roleIdFromName(assignment.roleName) ?? assignment.roleId ?? null;
    }

    /** Merge district/campus/teacher scope from all active role assignments for edit form. */
    private resolveEditScope(user: UserItemDto): {
        stateId: number | null;
        districtId: number | null;
        campusId: number | null;
        teacherId: number | string | null;
    } {
        const active = this.activeRoleAssignments(user);
        if (!active.length) {
            return { stateId: null, districtId: null, campusId: null, teacherId: null };
        }

        const teacherAssignment = active.find(
            (a) => this.assignmentRoleKind(a) === ROLE_IDS.Teacher,
        );
        const principalAssignment = active.find(
            (a) => this.assignmentRoleKind(a) === ROLE_IDS.Principal,
        );

        let stateId: number | null = null;
        let districtId: number | null = null;
        let campusId: number | null = null;
        let teacherId: number | string | null = null;

        for (const assignment of active) {
            stateId = this.coerceId(assignment.stateId) ?? stateId;
            districtId = this.coerceId(assignment.districtId) ?? districtId;
            campusId = this.coerceId(assignment.campusId) ?? campusId;
            if (assignment.teacherId != null) {
                teacherId = assignment.teacherId;
            }
        }

        if (teacherAssignment) {
            stateId = this.coerceId(teacherAssignment.stateId) ?? stateId;
            districtId = this.coerceId(teacherAssignment.districtId) ?? districtId;
            campusId = this.coerceId(teacherAssignment.campusId) ?? campusId;
            if (teacherAssignment.teacherId != null) {
                teacherId = teacherAssignment.teacherId;
            }
        } else if (principalAssignment) {
            stateId = this.coerceId(principalAssignment.stateId) ?? stateId;
            districtId = this.coerceId(principalAssignment.districtId) ?? districtId;
            campusId = this.coerceId(principalAssignment.campusId) ?? campusId;
        }

        return { stateId, districtId, campusId, teacherId };
    }

    private coerceId(value: unknown): number | null {
        if (value == null || value === '') {
            return null;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    private matchTeacherIdInList(
        savedId: number | string,
        teachers: TeacherSummaryDto[],
    ): number | string | null {
        const saved = String(savedId);
        const match = teachers.find((t) => t.teacherId != null && String(t.teacherId) === saved);
        return match?.teacherId ?? savedId;
    }

    private applyUserToForm(user: UserItemDto): void {
        const scope = this.resolveEditScope(user);
        const activeAssignments = this.activeRoleAssignments(user);
        const roleDescriptions: Record<number, string> = {};
        const roleTtessAccess: Record<number, boolean> = {};
        for (const item of activeAssignments) {
            roleDescriptions[item.roleId] = item.roleDescription?.trim() ?? '';
            if (this.isTtessAccessRoleId(item.roleId)) {
                roleTtessAccess[item.roleId] = item.ttessAccess !== false;
            }
        }
        const localPart = user.email?.split('@')[0] ?? '';
        this.addForm = {
            stateId: scope.stateId,
            districtId: scope.districtId,
            campusId: scope.campusId,
            teacherId: scope.teacherId,
            roleIds: activeAssignments.map((a) => a.roleId),
            roleDescriptions,
            roleTtessAccess,
            firstName: user.firstName?.trim() ?? '',
            lastName: user.lastName?.trim() ?? '',
            userName: user.displayName?.trim() || localPart,
            email: user.email ?? '',
            password: '',
            confirmPassword: '',
        };
    }

    private syncRoleTtessAccessFields(): void {
        for (const roleId of this.addForm.roleIds) {
            if (!this.isTtessAccessRoleId(roleId)) {
                continue;
            }
            if (this.addForm.roleTtessAccess[roleId] != null) {
                continue;
            }
            const fromUser = this.editingUser?.roleAssignments?.find((a) => a.roleId === roleId);
            this.addForm.roleTtessAccess[roleId] = fromUser?.ttessAccess !== false;
        }
        for (const roleId of Object.keys(this.addForm.roleTtessAccess).map(Number)) {
            if (!this.addForm.roleIds.includes(roleId)) {
                delete this.addForm.roleTtessAccess[roleId];
            }
        }
    }

    private syncRoleDescriptionFields(): void {
        for (const roleId of this.addForm.roleIds) {
            if (this.addForm.roleDescriptions[roleId] != null) {
                continue;
            }
            const fromUser = this.editingUser?.roleAssignments?.find((a) => a.roleId === roleId);
            const fromCatalog = this.roles.find((r) => r.roleId === roleId);
            this.addForm.roleDescriptions[roleId] =
                fromUser?.roleDescription?.trim() ?? fromCatalog?.roleDescription?.trim() ?? '';
        }
        for (const roleId of Object.keys(this.addForm.roleDescriptions).map(Number)) {
            if (!this.addForm.roleIds.includes(roleId)) {
                delete this.addForm.roleDescriptions[roleId];
            }
        }
    }

    private loadEditScope(user: UserItemDto): void {
        const scope = this.resolveEditScope(user);
        const { stateId, districtId, campusId, teacherId } = scope;
        const shouldLoadTeachers = this.requiresTeacherScope || teacherId != null;

        this.statesLoading = true;
        this.filters.listStates(false).subscribe({
            next: (states) => {
                this.states = states;
                this.statesLoading = false;
                if (stateId != null) {
                    this.addForm.stateId = stateId;
                }
                if (stateId == null) {
                    this.finishOpenEditModal();
                    return;
                }
                this.districtsLoading = true;
                this.filters.listDistricts({ stateId, activeOnly: false }).subscribe({
                    next: (districts) => {
                        this.districts = districts;
                        this.districtsLoading = false;
                        if (districtId != null) {
                            this.addForm.districtId = districtId;
                        }
                        if (districtId == null) {
                            this.finishOpenEditModal();
                            return;
                        }
                        this.campusesLoading = true;
                        this.filters.listCampuses({ districtId, activeOnly: false }).subscribe({
                            next: (campuses) => {
                                this.campuses = campuses;
                                this.campusesLoading = false;
                                if (campusId != null) {
                                    this.addForm.campusId = campusId;
                                }
                                if (!shouldLoadTeachers || campusId == null) {
                                    this.finishOpenEditModal();
                                    return;
                                }
                                const campus = campuses.find(
                                    (c) => this.coerceId(c.campusId) === campusId,
                                );
                                if (!campus?.campusCode) {
                                    this.finishOpenEditModal();
                                    return;
                                }
                                this.teachersLoading = true;
                                this.teachersService
                                    .listTeachersByCampus(districtId, campus.campusCode)
                                    .subscribe({
                                        next: (teachers) => {
                                            this.teachers = teachers;
                                            this.teachersLoading = false;
                                            if (teacherId != null) {
                                                this.addForm.teacherId = this.matchTeacherIdInList(
                                                    teacherId,
                                                    teachers,
                                                );
                                            }
                                            this.finishOpenEditModal();
                                        },
                                        error: () => {
                                            this.teachers = [];
                                            this.teachersLoading = false;
                                            this.finishOpenEditModal();
                                        },
                                    });
                            },
                            error: () => {
                                this.campuses = [];
                                this.campusesLoading = false;
                                this.finishOpenEditModal();
                            },
                        });
                    },
                    error: () => {
                        this.districts = [];
                        this.districtsLoading = false;
                        this.finishOpenEditModal();
                    },
                });
            },
            error: () => {
                this.states = [];
                this.statesLoading = false;
                this.finishOpenEditModal();
            },
        });
    }

    private finishOpenEditModal(): void {
        this.userModalLoading = false;
        this.addUserModal?.open();
        this.cdr.markForCheck();
    }

    private buildRoleAssignmentsForSave(
        built: UserRoleAssignmentRequest[],
    ): UserRoleAssignmentRequest[] {
        const existing = this.editingUser?.roleAssignments ?? [];
        const selectedRoleIds = new Set(built.map((a) => a.roleId));
        const builtByRoleId = new Map(built.map((a) => [a.roleId, a]));
        const result: UserRoleAssignmentRequest[] = [];

        for (const assignment of existing) {
            const { userRoleAssignmentId, roleName, createdAt, updatedAt, ...rest } = assignment;
            if (selectedRoleIds.has(assignment.roleId)) {
                result.push(
                    this.users.normalizeRoleAssignment({
                        ...builtByRoleId.get(assignment.roleId)!,
                        isActive: assignment.isActive ?? true,
                    }),
                );
                builtByRoleId.delete(assignment.roleId);
            } else if (assignment.isActive !== false) {
                result.push(this.users.normalizeRoleAssignment({ ...rest, isActive: false }));
            }
        }

        for (const assignment of builtByRoleId.values()) {
            result.push(this.users.normalizeRoleAssignment(assignment));
        }

        return result.length ? result : built.map((a) => this.users.normalizeRoleAssignment(a));
    }

    private resetCampusAndTeacher(clearNames = true): void {
        this.addForm.campusId = null;
        this.addForm.teacherId = null;
        if (clearNames) {
            this.addForm.firstName = '';
            this.addForm.lastName = '';
        }
        this.campuses = [];
        this.teachers = [];
    }

    private toRow(user: UserItemDto): UserListRow {
        const scope = this.resolveEditScope(user);
        const localPart = user.email?.split('@')[0] ?? '';
        return {
            id: user.userId,
            firstName: user.firstName?.trim() || user.displayName?.trim() || localPart,
            lastName: user.lastName?.trim() || '',
            userName: user.displayName?.trim() || localPart,
            groupType: groupTypesLabelFromRoleAssignments(user.roleAssignments),
            email: user.email,
            stateId: scope.stateId ?? undefined,
            districtId: scope.districtId ?? undefined,
            campusId: scope.campusId ?? undefined,
            teacherId: this.coerceId(scope.teacherId) ?? undefined,
            isActive: user.isActive,
        };
    }

    private emptyAddForm() {
        return {
            stateId: null as number | null,
            districtId: null as number | null,
            campusId: null as number | null,
            teacherId: null as number | string | null,
            roleIds: [] as number[],
            roleDescriptions: {} as Record<number, string>,
            roleTtessAccess: {} as Record<number, boolean>,
            firstName: '',
            lastName: '',
            userName: '',
            email: '',
            password: '',
            confirmPassword: '',
        };
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
}
