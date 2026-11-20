import type { AuthRoleItemDto, UserRoleAssignmentItemDto, UserRoleAssignmentRequest } from '../models/simplify-api.model';

/** Backend dbo.Roles ids (SuperAdmin=1 … Teacher=4). */
export const ROLE_IDS = {
    SuperAdmin: 1,
    DistrictAdmin: 2,
    Principal: 3,
    Teacher: 4,
} as const;

const ROLE_NAME_BY_ID: Record<number, string> = {
    [ROLE_IDS.SuperAdmin]: 'SuperAdmin',
    [ROLE_IDS.DistrictAdmin]: 'DistrictAdmin',
    [ROLE_IDS.Principal]: 'Principal',
    [ROLE_IDS.Teacher]: 'Teacher',
};

const ROLE_ID_BY_NAME: Record<string, number> = {
    superadmin: ROLE_IDS.SuperAdmin,
    districtadmin: ROLE_IDS.DistrictAdmin,
    principal: ROLE_IDS.Principal,
    teacher: ROLE_IDS.Teacher,
};

export type UserGroupType = 'district' | 'principle' | 'instructor';

export const USER_GROUP_TYPES: UserGroupType[] = ['district', 'principle', 'instructor'];

export function roleIdFromName(roleName: string | null | undefined): number | null {
    if (!roleName) {
        return null;
    }
    const key = roleName.replace(/\s+/g, '').toLowerCase();
    return ROLE_ID_BY_NAME[key] ?? null;
}

export function roleNameFromId(roleId: number | null | undefined): string {
    if (roleId == null) {
        return 'User';
    }
    return ROLE_NAME_BY_ID[roleId] ?? `Role ${roleId}`;
}

/** Human-readable label for header role switcher. */
export function formatRoleLabel(role: AuthRoleItemDto): string {
    const name = role.roleName || roleNameFromId(role.roleId);
    const parts: string[] = [name];
    if (role.districtId != null) {
        parts.push(`District #${role.districtId}`);
    }
    if (role.campusId != null) {
        parts.push(`Campus #${role.campusId}`);
    }
    if (role.teacherId != null) {
        parts.push(`Teacher #${role.teacherId}`);
    }
    return parts.join(' · ');
}

export interface RoleAssignmentFormScope {
    stateId: number | null;
    districtId: number | null;
    campusId?: number | null;
    teacherId?: number | null;
}

/** Human-readable label for user-create role dropdown. */
export function creatableRoleLabel(role: { roleId: number; roleName?: string | null }): string {
    const name = role.roleName?.trim();
    if (name) {
        const known: Record<string, string> = {
            DistrictAdmin: 'District admin',
            Principal: 'Principal',
            Teacher: 'Teacher',
            SuperAdmin: 'Super admin',
        };
        return known[name] ?? name;
    }
    return roleNameFromId(role.roleId);
}

/** Roles assignable when creating users via POST /api/users (SuperAdmin excluded). */
export const USER_CREATABLE_ROLES: { roleId: number; label: string }[] = [
    { roleId: ROLE_IDS.DistrictAdmin, label: 'District admin' },
    { roleId: ROLE_IDS.Principal, label: 'Principal' },
    { roleId: ROLE_IDS.Teacher, label: 'Teacher' },
];

export function parseTeacherSummaryName(teacherName: string | null | undefined): {
    firstName: string;
    lastName: string;
} {
    const trimmed = (teacherName ?? '').trim();
    if (!trimmed) {
        return { firstName: '', lastName: '' };
    }
    const comma = trimmed.indexOf(',');
    if (comma >= 0) {
        return {
            lastName: trimmed.slice(0, comma).trim(),
            firstName: trimmed.slice(comma + 1).trim(),
        };
    }
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2) {
        return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
    }
    return { firstName: trimmed, lastName: '' };
}

/** Builds a single role assignment for POST /api/users from API role id + name. */
export function buildRoleAssignmentFromRoleId(
    roleId: number,
    scope: RoleAssignmentFormScope,
    roleName?: string | null,
): UserRoleAssignmentRequest | null {
    const kind = roleIdFromName(roleName) ?? roleId;

    switch (kind) {
        case ROLE_IDS.SuperAdmin:
            return {
                roleId,
                stateId: scope.stateId ?? undefined,
                isActive: true,
            };
        case ROLE_IDS.DistrictAdmin:
            if (scope.districtId == null) {
                return null;
            }
            return {
                roleId,
                stateId: scope.stateId ?? undefined,
                districtId: scope.districtId,
                isActive: true,
            };
        case ROLE_IDS.Principal:
            if (scope.districtId == null || scope.campusId == null) {
                return null;
            }
            return {
                roleId,
                stateId: scope.stateId ?? undefined,
                districtId: scope.districtId,
                campusId: scope.campusId,
                isActive: true,
            };
        case ROLE_IDS.Teacher:
            if (
                scope.stateId == null ||
                scope.districtId == null ||
                scope.campusId == null ||
                scope.teacherId == null
            ) {
                return null;
            }
            return {
                roleId,
                stateId: scope.stateId,
                districtId: scope.districtId,
                campusId: scope.campusId,
                teacherId: scope.teacherId,
                isActive: true,
            };
        default:
            return {
                roleId,
                stateId: scope.stateId ?? undefined,
                districtId: scope.districtId ?? undefined,
                campusId: scope.campusId ?? undefined,
                teacherId: scope.teacherId ?? undefined,
                isActive: true,
            };
    }
}

/** Maps legacy user-list group type to a single role assignment for POST /api/users. */
export function buildRoleAssignmentForGroup(
    groupType: UserGroupType,
    scope: RoleAssignmentFormScope,
): UserRoleAssignmentRequest | null {
    switch (groupType) {
        case 'district':
            if (scope.districtId == null) {
                return null;
            }
            return {
                roleId: ROLE_IDS.DistrictAdmin,
                stateId: scope.stateId ?? undefined,
                districtId: scope.districtId,
                isActive: true,
            };
        case 'principle':
            if (scope.districtId == null || scope.campusId == null) {
                return null;
            }
            return {
                roleId: ROLE_IDS.Principal,
                stateId: scope.stateId ?? undefined,
                districtId: scope.districtId,
                campusId: scope.campusId,
                isActive: true,
            };
        case 'instructor':
            if (
                scope.stateId == null ||
                scope.districtId == null ||
                scope.campusId == null ||
                scope.teacherId == null
            ) {
                return null;
            }
            return {
                roleId: ROLE_IDS.Teacher,
                stateId: scope.stateId,
                districtId: scope.districtId,
                campusId: scope.campusId,
                teacherId: scope.teacherId,
                isActive: true,
            };
        default:
            return null;
    }
}

export function groupTypeFromRoleName(roleName: string | null | undefined): UserGroupType {
    const id = roleIdFromName(roleName);
    if (id === ROLE_IDS.Principal) {
        return 'principle';
    }
    if (id === ROLE_IDS.Teacher) {
        return 'instructor';
    }
    return 'district';
}

/** Comma-separated role/group labels for user list from all assignments. */
export function groupTypesLabelFromRoleAssignments(
    assignments: Pick<UserRoleAssignmentItemDto, 'roleName' | 'roleId' | 'isActive'>[] | null | undefined,
): string {
    if (!assignments?.length) {
        return '—';
    }
    const labels: string[] = [];
    const seen = new Set<string>();
    for (const assignment of assignments) {
        if (assignment.isActive === false) {
            continue;
        }
        const roleName = assignment.roleName?.trim() || roleNameFromId(assignment.roleId);
        const key = roleName.replace(/\s+/g, '').toLowerCase();
        if (!key || seen.has(key)) {
            continue;
        }
        seen.add(key);
        labels.push(creatableRoleLabel({ roleId: assignment.roleId, roleName: assignment.roleName }));
    }
    return labels.length ? labels.join(', ') : '—';
}
