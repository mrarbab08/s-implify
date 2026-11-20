import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../services/auth.service';

/** Allows access to the post-login role picker only when a choice is still required. */
@Injectable({
    providedIn: 'root',
})
export class RoleSelectionGuard implements CanActivate {
    constructor(private authService: AuthService, private router: Router) {}

    canActivate(): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
        if (!this.authService.isLoggedIn()) {
            return this.router.createUrlTree(['/auth/login']);
        }
        if (!this.authService.hasMultipleRoles()) {
            return this.router.createUrlTree(['/dashboard']);
        }
        return true;
    }
}
