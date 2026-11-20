import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import type { ApiResponse, UserItemDto, UserRequest, UserRoleAssignmentRequest } from '../models/simplify-api.model';

@Injectable({ providedIn: 'root' })
export class UsersService {
    private readonly base = `${environment.apiUrl}/users`;

    constructor(private http: HttpClient) {}

    /** Shape body for POST/PUT /api/users (Swagger: UserRequest). */
    normalizeUserRequest(body: UserRequest): UserRequest {
        return {
            email: body.email,
            isActive: body.isActive,
            displayName: body.displayName ?? null,
            firstName: body.firstName ?? null,
            lastName: body.lastName ?? null,
            ...(body.password ? { password: body.password } : {}),
            roleAssignments: body.roleAssignments?.map((a) => this.normalizeRoleAssignment(a)) ?? null,
            ...(body.createdBy ? { createdBy: body.createdBy } : {}),
            ...(body.updatedBy ? { updatedBy: body.updatedBy } : {}),
        };
    }

    normalizeRoleAssignment(assignment: UserRoleAssignmentRequest): UserRoleAssignmentRequest {
        return {
            roleId: assignment.roleId,
            stateId: assignment.stateId ?? null,
            districtId: assignment.districtId ?? null,
            campusId: assignment.campusId ?? null,
            teacherId: assignment.teacherId ?? null,
            isActive: assignment.isActive ?? true,
            ...(assignment.roleDescription?.trim()
                ? { roleDescription: assignment.roleDescription.trim() }
                : {}),
            ...(assignment.ttessAccess != null ? { ttessAccess: assignment.ttessAccess } : {}),
        };
    }

    listUsers(options?: {
        districtId?: number;
        activeOnly?: boolean;
        roleId?: number;
        userRoleAssignmentId?: number;
    }): Observable<UserItemDto[]> {
        let params = new HttpParams();
        if (options?.districtId != null) {
            params = params.set('districtId', String(options.districtId));
        }
        if (options?.activeOnly != null) {
            params = params.set('activeOnly', String(options.activeOnly));
        }
        if (options?.roleId != null) {
            params = params.set('roleId', String(options.roleId));
        }
        if (options?.userRoleAssignmentId != null) {
            params = params.set('userRoleAssignmentId', String(options.userRoleAssignmentId));
        }
        return this.http
            .get<ApiResponse<UserItemDto[]>>(this.base, { params })
            .pipe(map((r) => r.data ?? []));
    }

    getUser(id: number): Observable<UserItemDto> {
        return this.http
            .get<ApiResponse<UserItemDto>>(`${this.base}/${id}`)
            .pipe(map((r) => r.data));
    }

    createUser(body: UserRequest): Observable<UserItemDto> {
        return this.http
            .post<ApiResponse<UserItemDto>>(this.base, this.normalizeUserRequest(body))
            .pipe(map((r) => r.data));
    }

    updateUser(id: number, body: UserRequest): Observable<UserItemDto> {
        return this.http
            .put<ApiResponse<UserItemDto>>(`${this.base}/${id}`, this.normalizeUserRequest(body))
            .pipe(map((r) => r.data));
    }

    deleteUser(id: number): Observable<void> {
        return this.http.delete<ApiResponse<void>>(`${this.base}/${id}`).pipe(map(() => undefined));
    }
}
