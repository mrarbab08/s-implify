import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';

/**
 * GuestGuard — prevents authenticated users from accessing login/register pages.
 * Redirects already-logged-in users to the dashboard.
 */
@Injectable({
    providedIn: 'root',
})
export class GuestGuard implements CanActivate {
    constructor(private authService: AuthService, private router: Router) {}

    canActivate(): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
        if (!this.authService.isLoggedIn()) {
            return true;
        }
        if (this.authService.needsRoleSelection()) {
            return this.router.createUrlTree(['/auth/select-role']);
        }
        return this.router.createUrlTree(['/dashboard']);
    }
}
