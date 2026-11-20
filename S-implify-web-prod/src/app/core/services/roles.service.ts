import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ROLE_IDS } from '../constants/auth-roles';
import type { ApiResponse, RoleDto } from '../models/simplify-api.model';

@Injectable({ providedIn: 'root' })
export class RolesService {
    private readonly base = `${environment.apiUrl}/roles`;

    constructor(private http: HttpClient) {}

    /** GET /api/roles — all roles from the backend. */
    listRoles(): Observable<RoleDto[]> {
        if (environment.mockBusinessApis) {
            return of([
                { roleId: ROLE_IDS.SuperAdmin, roleName: 'SuperAdmin' },
                { roleId: ROLE_IDS.DistrictAdmin, roleName: 'DistrictAdmin' },
                { roleId: ROLE_IDS.Principal, roleName: 'Principal' },
                { roleId: ROLE_IDS.Teacher, roleName: 'Teacher' },
            ]);
        }
        return this.http.get<ApiResponse<unknown>>(this.base).pipe(map((r) => this.normalizeRoleList(r.data)));
    }

    private normalizeRoleList(raw: unknown): RoleDto[] {
        return this.coerceRoleRows(raw)
            .map((row) => this.normalizeRole(row))
            .filter((role) => Number.isFinite(role.roleId) && !!role.roleName)
            .sort((a, b) => a.roleId - b.roleId);
    }

    private coerceRoleRows(raw: unknown): unknown[] {
        if (Array.isArray(raw)) {
            return raw;
        }
        if (raw && typeof raw === 'object') {
            const obj = raw as Record<string, unknown>;
            for (const key of ['roles', 'Roles', 'items', 'Items', 'content', 'Content']) {
                const nested = obj[key];
                if (Array.isArray(nested)) {
                    return nested;
                }
            }
        }
        return [];
    }

    private normalizeRole(raw: unknown): RoleDto {
        if (raw && typeof raw === 'object' && 'roleId' in raw && 'roleName' in raw) {
            const typed = raw as RoleDto;
            return {
                roleId: Number(typed.roleId),
                roleName: String(typed.roleName ?? '').trim(),
                roleDescription: typed.roleDescription?.trim() || null,
                isActive: typed.isActive ?? null,
            };
        }

        const row = (raw ?? {}) as Record<string, unknown>;
        const roleId = Number(row['roleId'] ?? row['RoleId'] ?? row['id'] ?? row['Id']);
        const roleName = String(row['roleName'] ?? row['RoleName'] ?? row['name'] ?? row['Name'] ?? '').trim();
        const roleDescription = String(
            row['roleDescription'] ?? row['RoleDescription'] ?? row['description'] ?? row['Description'] ?? '',
        ).trim();
        const isActiveRaw = row['isActive'] ?? row['IsActive'];
        return {
            roleId,
            roleName,
            roleDescription: roleDescription || null,
            isActive: typeof isActiveRaw === 'boolean' ? isActiveRaw : null,
        };
    }
}
