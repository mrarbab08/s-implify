import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

/** Blocks /t-tess when the active role assignment has ttessAccess = false. */
@Injectable({
    providedIn: 'root',
})
export class TtessAccessGuard implements CanActivate {
    constructor(private authService: AuthService, private router: Router) {}

    canActivate(): boolean | UrlTree {
        if (this.authService.canAccessTtess()) {
            return true;
        }
        return this.router.createUrlTree(['/dashboard']);
    }
}
