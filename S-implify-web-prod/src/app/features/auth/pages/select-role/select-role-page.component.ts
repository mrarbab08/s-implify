import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { switchMap } from 'rxjs/operators';
import { AuthService } from '../../../../core/services/auth.service';
import { DistrictContextService } from '../../../../core/services/district-context.service';
import { RolesService } from '../../../../core/services/roles.service';
import { formatRoleLabel, roleNameFromId } from '../../../../core/constants/auth-roles';
import type { AuthRoleItemDto, RoleDto } from '../../../../core/models/simplify-api.model';
import { SharedModule } from '../../../../shared/shared.module';

@Component({
    selector: 'app-select-role-page',
    templateUrl: './select-role-page.component.html',
    standalone: true,
    imports: [CommonModule, SharedModule],
})
export class SelectRolePageComponent implements OnInit {
    readonly currYear = new Date().getFullYear();

    roles: AuthRoleItemDto[] = [];
    roleCatalog: RoleDto[] = [];
    selectingId: number | null = null;
    errorMsg = '';

    constructor(
        private readonly authService: AuthService,
        private readonly districtContext: DistrictContextService,
        private readonly rolesService: RolesService,
        private readonly router: Router,
        private readonly cdr: ChangeDetectorRef,
    ) {
        this.roles = this.authService.getRoles();
    }

    ngOnInit(): void {
        this.rolesService.listRoles().subscribe({
            next: (rows) => {
                this.roleCatalog = rows;
                this.cdr.markForCheck();
            },
            error: () => {
                this.roleCatalog = [];
                this.cdr.markForCheck();
            },
        });
    }

    get userDisplayName(): string {
        return this.authService.getCurrentUser()?.displayName ?? 'User';
    }

    get userEmail(): string {
        return this.authService.getCurrentUser()?.email ?? '';
    }

    get userInitial(): string {
        const name = this.userDisplayName.trim();
        return (name[0] ?? '?').toUpperCase();
    }

    roleLabel(role: AuthRoleItemDto): string {
        return formatRoleLabel(role);
    }

    roleTitle(role: AuthRoleItemDto): string {
        return role.roleName || roleNameFromId(role.roleId);
    }

    roleDescription(role: AuthRoleItemDto): string {
        const fromAssignment = role.roleDescription?.trim();
        if (fromAssignment) {
            return fromAssignment;
        }
        return this.roleCatalog.find((item) => item.roleId === role.roleId)?.roleDescription?.trim() ?? '';
    }

    isSelecting(role: AuthRoleItemDto): boolean {
        return this.selectingId === role.userRoleAssignmentId;
    }

    /**
     * Cell classes for the FB-style role grid: thin vertical dividers between
     * columns and a horizontal divider between rows (md and up only).
     */
    roleCellClass(index: number, count: number): string {
        const parts = [
            'group flex flex-col items-center gap-3 px-4 py-7 transition hover:bg-gray-50',
            'disabled:cursor-not-allowed disabled:opacity-60',
        ];
        const cols = Math.min(count, 4);
        if (index % cols !== cols - 1 && index !== count - 1) {
            parts.push('md:border-r md:border-gray-200');
        }
        if (count > cols && index < count - (count % cols || cols)) {
            parts.push('md:border-b md:border-gray-200');
        }
        return parts.join(' ');
    }

    selectRole(role: AuthRoleItemDto): void {
        if (this.selectingId != null) {
            return;
        }
        this.errorMsg = '';
        this.selectingId = role.userRoleAssignmentId;
        this.cdr.markForCheck();

        this.authService.switchRole(role.userRoleAssignmentId).subscribe({
            next: (res) => {
                if (res?.statusCode !== 200 || !res?.data?.token) {
                    this.errorMsg = res?.message || 'Could not activate this role.';
                    this.selectingId = null;
                    this.cdr.markForCheck();
                    return;
                }
                this.authService.markRoleSelectionComplete();
                this.districtContext
                    .syncToActiveRole()
                    .pipe(switchMap(() => this.districtContext.ensureRoleDashboardRoute()))
                    .subscribe({
                    next: (route) => {
                        this.selectingId = null;
                        void this.router.navigate(route ?? ['/dashboard']);
                    },
                    error: () => {
                        this.selectingId = null;
                        void this.router.navigate(
                            this.districtContext.roleDashboardRoute() ?? ['/dashboard'],
                        );
                    },
                });
            },
            error: (err) => {
                this.errorMsg =
                    err?.error?.message || err?.message || 'Could not activate this role.';
                this.selectingId = null;
                this.cdr.markForCheck();
            },
        });
    }

    signOut(): void {
        this.authService.logout();
        this.router.navigate(['/auth/login']);
    }
}
