import { Injectable, computed, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, tap } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { ROLE_IDS, roleIdFromName } from '../constants/auth-roles';
import type {
    ActiveRoleScope,
    ApiResponse,
    AuthResponseDto,
    AuthRoleItemDto,
} from '../models/simplify-api.model';

// ── Request payloads ─────────────────────────────────────────────────────────
export interface LoginPayload {
    email: string;
    password: string;
}

export interface RegisterPayload {
    email: string;
    password: string;
    displayName: string;
}

export interface ForgotPasswordPayload {
    email: string;
}

export interface ResetPasswordPayload {
    token: string;
    newPassword: string;
}

export interface SwitchRolePayload {
    userRoleAssignmentId: number;
}

/** Normalized session stored in localStorage after login / switch-role. */
export interface AuthUserData {
    userId: number;
    email: string;
    displayName: string;
    firstName?: string | null;
    lastName?: string | null;
    token: string;
    activeRole: AuthRoleItemDto | null;
    roles: AuthRoleItemDto[];
    /** Mirrors activeRole.roleName for legacy callers. */
    roleName: string;
    userRoleAssignmentId: number | null;
    stateId: number | null;
    districtId: number | null;
    campusId: number | null;
    teacherId: number | null;
}

export type AuthApiResponse = ApiResponse<AuthResponseDto>;
export type RegisterApiResponse = ApiResponse<AuthResponseDto>;

interface JwtPayload {
    sub: string;
    email: string;
    role: string;
    iat: number;
    exp: number;
}

/**
 * AuthService — CoreModule centralized authentication service.
 * Handles login, logout, token storage, role switching, and auth-state helpers.
 */
@Injectable({
    providedIn: 'root',
})
export class AuthService {
    private readonly authUrl = environment.authApiUrl;
    private readonly userKey = 'simplify_user';
    private readonly roleSelectionKey = 'simplify_role_selection_complete';
    /** Only used when `mockBusinessApis` is on in a non-production build. */
    private readonly mockEmail = 'demo@simplify.local';
    private readonly mockPassword = 'Demo@123';

    private readonly sessionSignal = signal<AuthUserData | null>(this.readStoredSession());

    /** Signal-based session for templates and computed role scope. */
    readonly session = this.sessionSignal.asReadonly();

    readonly activeRoleScope = computed((): ActiveRoleScope | null => {
        const role = this.sessionSignal()?.activeRole;
        if (!role) {
            return null;
        }
        return {
            roleId: role.roleId,
            stateId: role.stateId ?? null,
            districtId: role.districtId ?? null,
            campusId: role.campusId ?? null,
            teacherId: role.teacherId ?? null,
        };
    });

    /** True when state/district pickers should be hidden (District Admin, Principal, Teacher). */
    readonly locksDistrictSelection = computed(() => this.activeRoleScope()?.districtId != null);

    readonly isPrincipalRole = computed(() => {
        const role = this.sessionSignal()?.activeRole;
        if (!role) {
            return false;
        }
        return (roleIdFromName(role.roleName) ?? role.roleId) === ROLE_IDS.Principal;
    });

    readonly isSuperAdminRole = computed(() => {
        const role = this.sessionSignal()?.activeRole;
        if (!role) {
            return false;
        }
        return (roleIdFromName(role.roleName) ?? role.roleId) === ROLE_IDS.SuperAdmin;
    });

    readonly isTeacherRole = computed(() => {
        const role = this.sessionSignal()?.activeRole;
        if (!role) {
            return false;
        }
        return (roleIdFromName(role.roleName) ?? role.roleId) === ROLE_IDS.Teacher;
    });

    readonly isDistrictAdminRole = computed(() => {
        const role = this.sessionSignal()?.activeRole;
        if (!role) {
            return false;
        }
        return (roleIdFromName(role.roleName) ?? role.roleId) === ROLE_IDS.DistrictAdmin;
    });

    /** Super Admin / District Admin — full district scope (all campuses, all filters). */
    readonly isFullDistrictRole = computed(() => this.isSuperAdminRole() || this.isDistrictAdminRole());

    readonly isCampusScopedRole = computed(() => {
        const role = this.sessionSignal()?.activeRole;
        if (!role) {
            return false;
        }
        const kind = roleIdFromName(role.roleName) ?? role.roleId;
        return kind === ROLE_IDS.Principal || kind === ROLE_IDS.Teacher;
    });

    /** False for Teacher role or when the active assignment has ttessAccess = false. */
    readonly canAccessTtess = computed(() => {
        if (this.isTeacherRole()) {
            return false;
        }
        return this.sessionSignal()?.activeRole?.ttessAccess !== false;
    });

    /** Assigned campus from activeRole for Principal / Teacher (null for other roles). */
    readonly scopedCampusId = computed((): number | null => {
        if (!this.isCampusScopedRole()) {
            return null;
        }
        return this.activeRoleScope()?.campusId ?? null;
    });

    private readonly sessionSubject = new BehaviorSubject<AuthUserData | null>(this.sessionSignal());
    /** Emits whenever login, switch-role, or logout changes the session. */
    readonly session$ = this.sessionSubject.asObservable();

    constructor(private http: HttpClient) {}

    // ── Login ─────────────────────────────────────────────────────────────────
    login(payload: LoginPayload): Observable<AuthApiResponse> {
        if (this.canUseMockAuth() && this.isMockCredential(payload.email, payload.password)) {
            const mockResponse = this.buildMockLoginResponse(payload.email);
            this.persistAuthResponse(mockResponse);
            return of(mockResponse);
        }

        return this.http.post<AuthApiResponse>(`${this.authUrl}/login`, payload).pipe(
            tap((res) => {
                this.persistAuthResponse(res);
            }),
        );
    }

    // ── Switch role ───────────────────────────────────────────────────────────
    switchRole(userRoleAssignmentId: number): Observable<AuthApiResponse> {
        const current = this.getCurrentUser();
        if (this.canUseMockAuth() && this.isMockSession(current)) {
            const mockResponse = this.buildMockSwitchRoleResponse(current!, userRoleAssignmentId);
            this.persistAuthResponse(mockResponse);
            return of(mockResponse);
        }

        const body: SwitchRolePayload = { userRoleAssignmentId };
        return this.http.post<AuthApiResponse>(`${this.authUrl}/switch-role`, body).pipe(
            tap((res) => {
                this.persistAuthResponse(res);
            }),
        );
    }

    /**
     * Re-fetch the session from GET /auth/me and re-persist it. Called once on app
     * boot so role-scope changes made after login (e.g. a role assignment being
     * re-scoped in Setups) take effect on the next reload instead of only after a
     * manual re-login. Keeps the user's currently selected role — only its scope
     * (state/district/campus) and the token are refreshed.
     */
    refreshSession(): void {
        const token = this.getToken();
        const current = this.getCurrentUser();
        if (!token || !current?.activeRole) {
            return;
        }
        this.http
            .get<AuthApiResponse>(`${this.authUrl}/me`)
            .pipe(catchError(() => of(null as AuthApiResponse | null)))
            .subscribe((res) => {
                const freshRoles = res?.data?.roles ?? [];
                if (!freshRoles.length) {
                    return;
                }
                const match =
                    freshRoles.find(
                        (r) => r.userRoleAssignmentId === current.activeRole!.userRoleAssignmentId,
                    ) ?? freshRoles.find((r) => r.roleName === current.activeRole!.roleName);
                if (!match) {
                    return;
                }
                const session: AuthUserData = {
                    ...current,
                    token: res!.data!.token ?? token,
                    activeRole: match,
                    roles: freshRoles,
                };
                localStorage.setItem(environment.tokenKey, session.token);
                localStorage.setItem(this.userKey, JSON.stringify(session));
                this.setSession(session);
            });
    }

    // ── Register ──────────────────────────────────────────────────────────────
    register(payload: RegisterPayload): Observable<RegisterApiResponse> {
        return this.http.post<RegisterApiResponse>(`${this.authUrl}/register/super-admin`, payload).pipe(
            tap((res) => {
                this.persistAuthResponse(res);
            }),
        );
    }

    // ── Forgot password ───────────────────────────────────────────────────────
    forgotPassword(payload: ForgotPasswordPayload): Observable<ApiResponse<unknown>> {
        return this.http.post<ApiResponse<unknown>>(`${this.authUrl}/forgot-password`, payload);
    }

    // ── Reset password ────────────────────────────────────────────────────────
    resetPassword(payload: ResetPasswordPayload): Observable<ApiResponse<unknown>> {
        return this.http.post<ApiResponse<unknown>>(`${this.authUrl}/reset-password`, payload);
    }

    // ── Logout ────────────────────────────────────────────────────────────────
    logout(): void {
        localStorage.removeItem(environment.tokenKey);
        localStorage.removeItem(this.userKey);
        this.clearRoleSelectionComplete();
        this.setSession(null);
    }

    // ── Token helpers ─────────────────────────────────────────────────────────
    getToken(): string | null {
        return localStorage.getItem(environment.tokenKey);
    }

    isLoggedIn(): boolean {
        const token = this.getToken();
        if (!token) {
            return false;
        }

        const jwt = this.decodeToken(token);
        if (!jwt?.exp) {
            return true;
        }

        const nowInSeconds = Math.floor(Date.now() / 1000);
        const isValid = jwt.exp > nowInSeconds;
        if (!isValid) {
            this.logout();
        }

        return isValid;
    }

    getCurrentUser(): AuthUserData | null {
        return this.sessionSignal();
    }

    getActiveRoleScope(): ActiveRoleScope | null {
        return this.activeRoleScope();
    }

    hasFixedDistrictFromActiveRole(): boolean {
        return this.locksDistrictSelection();
    }

    getActiveRole(): AuthRoleItemDto | null {
        return this.getCurrentUser()?.activeRole ?? null;
    }

    getRoles(): AuthRoleItemDto[] {
        return this.getCurrentUser()?.roles ?? [];
    }

    hasMultipleRoles(): boolean {
        return this.getRoles().length > 1;
    }

    /** True when the user must pick a role before entering the app. */
    needsRoleSelection(): boolean {
        return this.hasMultipleRoles() && !this.isRoleSelectionComplete();
    }

    isRoleSelectionComplete(): boolean {
        if (!this.hasMultipleRoles()) {
            return true;
        }
        const user = this.getCurrentUser();
        if (!user?.userId) {
            return false;
        }
        return localStorage.getItem(this.roleSelectionKey) === String(user.userId);
    }

    markRoleSelectionComplete(): void {
        const user = this.getCurrentUser();
        if (user?.userId) {
            localStorage.setItem(this.roleSelectionKey, String(user.userId));
        }
    }

    clearRoleSelectionComplete(): void {
        localStorage.removeItem(this.roleSelectionKey);
    }

    /**
     * Maps API AuthResponse into a normalized session object with flat scope mirrors.
     */
    static normalizeAuthSession(data: AuthResponseDto): AuthUserData {
        const rawRoles = data.roles ?? (data.activeRole ? [data.activeRole] : []);
        const roles = rawRoles
            .map((role) => AuthService.normalizeAuthRole(role))
            .filter((role): role is AuthRoleItemDto => role != null);
        const active = data.activeRole
            ? (AuthService.normalizeAuthRole(data.activeRole) ?? roles[0] ?? null)
            : (roles[0] ?? null);

        return {
            userId: data.userId,
            email: data.email,
            displayName: data.displayName?.trim() || data.email,
            firstName: data.firstName ?? null,
            lastName: data.lastName ?? null,
            token: data.token,
            activeRole: active,
            roles,
            roleName: active?.roleName ?? '',
            userRoleAssignmentId: active?.userRoleAssignmentId ?? null,
            stateId: active?.stateId ?? null,
            districtId: active?.districtId ?? null,
            campusId: active?.campusId ?? null,
            teacherId: active?.teacherId ?? null,
        };
    }

    private static normalizeAuthRole(raw: AuthRoleItemDto | Record<string, unknown>): AuthRoleItemDto | null {
        const row = raw as Record<string, unknown>;
        const roleName = String(row['roleName'] ?? row['RoleName'] ?? '').trim();
        const roleId = Number(row['roleId'] ?? row['RoleId'] ?? 0);
        const userRoleAssignmentId = Number(
            row['userRoleAssignmentId'] ?? row['UserRoleAssignmentId'] ?? 0,
        );
        if (!roleName && !roleId) {
            return null;
        }

        const pickNullableId = (...keys: string[]): number | null => {
            for (const key of keys) {
                const value = row[key];
                if (value == null || value === '') {
                    continue;
                }
                const parsed = Number(value);
                if (Number.isFinite(parsed)) {
                    return parsed;
                }
            }
            return null;
        };

        const roleDescription = String(
            row['roleDescription'] ?? row['RoleDescription'] ?? row['description'] ?? row['Description'] ?? '',
        ).trim();
        const ttessAccessRaw = row['ttessAccess'] ?? row['TtessAccess'];
        const ttessAccess =
            ttessAccessRaw == null || ttessAccessRaw === ''
                ? null
                : ttessAccessRaw === true || ttessAccessRaw === 'true' || ttessAccessRaw === 1;

        return {
            userRoleAssignmentId,
            roleId,
            roleName,
            stateId: pickNullableId('stateId', 'StateId'),
            districtId: pickNullableId('districtId', 'DistrictId'),
            campusId: pickNullableId('campusId', 'CampusId'),
            teacherId: pickNullableId('teacherId', 'TeacherId'),
            roleDescription: roleDescription || null,
            ttessAccess,
        };
    }

    private persistAuthResponse(res: AuthApiResponse): void {
        if (!res?.data?.token) {
            return;
        }
        const session = AuthService.normalizeAuthSession(res.data);
        localStorage.setItem(environment.tokenKey, session.token);
        localStorage.setItem(this.userKey, JSON.stringify(session));
        if ((session.roles?.length ?? 0) > 1) {
            this.clearRoleSelectionComplete();
        } else {
            this.markRoleSelectionComplete();
        }
        this.setSession(session);
    }

    private setSession(session: AuthUserData | null): void {
        this.sessionSignal.set(session);
        this.sessionSubject.next(session);
    }

    private readStoredSession(): AuthUserData | null {
        const raw = localStorage.getItem(this.userKey);
        if (!raw) {
            return this.sessionFromTokenOnly();
        }
        try {
            const parsed = JSON.parse(raw) as Partial<AuthUserData> & AuthResponseDto;
            if (parsed.token && parsed.activeRole && parsed.userId && parsed.email) {
                const session = AuthService.normalizeAuthSession({
                    userId: parsed.userId,
                    email: parsed.email,
                    displayName: parsed.displayName ?? null,
                    firstName: parsed.firstName ?? null,
                    lastName: parsed.lastName ?? null,
                    token: parsed.token,
                    activeRole: parsed.activeRole,
                    roles: parsed.roles ?? [parsed.activeRole],
                });
                localStorage.setItem(this.userKey, JSON.stringify(session));
                return session;
            }
            if (parsed.token && parsed.roleName) {
                return this.migrateLegacySession(parsed);
            }
            if (parsed.token && parsed.userId) {
                return AuthService.normalizeAuthSession(parsed as AuthResponseDto);
            }
        } catch {
            /* fall through */
        }
        return this.sessionFromTokenOnly();
    }

    private migrateLegacySession(legacy: Partial<AuthUserData>): AuthUserData {
        const activeRole: AuthRoleItemDto = {
            userRoleAssignmentId: legacy.userRoleAssignmentId ?? 0,
            roleId: roleIdFromName(legacy.roleName) ?? ROLE_IDS.SuperAdmin,
            roleName: legacy.roleName ?? 'SuperAdmin',
            stateId: legacy.stateId ?? null,
            districtId: legacy.districtId ?? null,
            campusId: legacy.campusId ?? null,
            teacherId: legacy.teacherId ?? null,
        };
        const session: AuthUserData = {
            userId: legacy.userId ?? 0,
            email: legacy.email ?? '',
            displayName: legacy.displayName ?? legacy.email ?? '',
            token: legacy.token!,
            activeRole,
            roles: legacy.roles ?? [activeRole],
            roleName: activeRole.roleName,
            userRoleAssignmentId: activeRole.userRoleAssignmentId,
            stateId: activeRole.stateId ?? null,
            districtId: activeRole.districtId ?? null,
            campusId: activeRole.campusId ?? null,
            teacherId: activeRole.teacherId ?? null,
        };
        localStorage.setItem(this.userKey, JSON.stringify(session));
        return session;
    }

    private ensureFlatMirrors(session: AuthUserData): void {
        const active = session.activeRole;
        if (!active) {
            return;
        }
        session.roleName = active.roleName;
        session.userRoleAssignmentId = active.userRoleAssignmentId;
        session.stateId = active.stateId ?? null;
        session.districtId = active.districtId ?? null;
        session.campusId = active.campusId ?? null;
        session.teacherId = active.teacherId ?? null;
    }

    private sessionFromTokenOnly(): AuthUserData | null {
        const token = this.getToken();
        if (!token) {
            return null;
        }

        const jwt = this.decodeToken(token);
        if (!jwt) {
            return null;
        }

        const activeRole: AuthRoleItemDto = {
            userRoleAssignmentId: 0,
            roleId: roleIdFromName(jwt.role) ?? 0,
            roleName: jwt.role,
            stateId: null,
            districtId: null,
            campusId: null,
            teacherId: null,
        };

        return {
            userId: Number(jwt.sub),
            email: jwt.email,
            displayName: jwt.email,
            token,
            activeRole,
            roles: [activeRole],
            roleName: jwt.role,
            userRoleAssignmentId: null,
            stateId: null,
            districtId: null,
            campusId: null,
            teacherId: null,
        };
    }

    private decodeToken(token: string): JwtPayload | null {
        try {
            const payload = token.split('.')[1] ?? '';
            const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
            const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
            return JSON.parse(atob(padded)) as JwtPayload;
        } catch {
            return null;
        }
    }

    private canUseMockAuth(): boolean {
        return !environment.production && environment.mockBusinessApis;
    }

    private isMockCredential(email: string, password: string): boolean {
        return email.trim().toLowerCase() === this.mockEmail && password === this.mockPassword;
    }

    private isMockSession(user: AuthUserData | null): boolean {
        return user?.userId === 999 || (user?.token?.endsWith('.mock-signature') ?? false);
    }

    private buildMockLoginResponse(email: string): AuthApiResponse {
        const roles: AuthRoleItemDto[] = [
            {
                userRoleAssignmentId: 1,
                roleId: ROLE_IDS.SuperAdmin,
                roleName: 'SuperAdmin',
                stateId: 1,
                districtId: null,
                campusId: null,
                teacherId: null,
                roleDescription: 'Full platform access across all districts and campuses.',
            },
            {
                userRoleAssignmentId: 2,
                roleId: ROLE_IDS.DistrictAdmin,
                roleName: 'DistrictAdmin',
                stateId: 1,
                districtId: 1,
                campusId: null,
                teacherId: null,
                roleDescription: 'Manage users, campuses, and reports for your district.',
            },
            {
                userRoleAssignmentId: 3,
                roleId: ROLE_IDS.Principal,
                roleName: 'Principal',
                stateId: 1,
                districtId: 1,
                campusId: 1,
                teacherId: null,
                roleDescription: 'View and manage data for your assigned campus.',
                ttessAccess: true,
            },
        ];
        const activeRole = roles[0];
        const token = this.createMockToken(email, activeRole.roleName);

        return {
            statusCode: 200,
            message: 'Login successful (mock)',
            data: {
                userId: 999,
                email,
                displayName: 'Demo User',
                firstName: 'Demo',
                lastName: 'User',
                token,
                activeRole,
                roles,
            },
        };
    }

    private buildMockSwitchRoleResponse(
        current: AuthUserData,
        userRoleAssignmentId: number,
    ): AuthApiResponse {
        const roles = current.roles.length ? current.roles : (current.activeRole ? [current.activeRole] : []);
        const activeRole = roles.find((r) => r.userRoleAssignmentId === userRoleAssignmentId) ?? roles[0];
        const token = this.createMockToken(current.email, activeRole?.roleName ?? 'SuperAdmin');

        return {
            statusCode: 200,
            message: 'Role switched (mock)',
            data: {
                userId: current.userId,
                email: current.email,
                displayName: current.displayName,
                firstName: current.firstName,
                lastName: current.lastName,
                token,
                activeRole: activeRole ?? null,
                roles,
            },
        };
    }

    private createMockToken(email: string, role: string): string {
        const now = Math.floor(Date.now() / 1000);
        const payload: JwtPayload = {
            sub: '999',
            email,
            role,
            iat: now,
            exp: now + 60 * 60 * 8,
        };

        const header = { alg: 'HS256', typ: 'JWT' };
        const encodedHeader = btoa(JSON.stringify(header));
        const encodedPayload = btoa(JSON.stringify(payload));
        return `${encodedHeader}.${encodedPayload}.mock-signature`;
    }
}
