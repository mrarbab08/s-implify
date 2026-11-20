import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * AuthGuard — protects routes that require authentication.
 * Redirects unauthenticated users to /auth/login.
 */
@Injectable({
    providedIn: 'root',
})
export class AuthGuard implements CanActivate {
    constructor(private authService: AuthService, private router: Router) {}

    canActivate(): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
        if (this.authService.isLoggedIn()) {
            if (this.authService.needsRoleSelection()) {
                return this.router.createUrlTree(['/auth/select-role']);
            }
            return true;
        }
        return this.router.createUrlTree(['/auth/login']);
    }
}
