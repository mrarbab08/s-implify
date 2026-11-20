import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ChangeDetectorRef, Component } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { AppInitializerService } from 'src/app/core/services/app-initializer.service';
import { SharedModule } from '../../../shared/shared.module';
import { AuthService } from 'src/app/core/services/auth.service';

@Component({
    templateUrl: './boxed-signin.html',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, SharedModule],
})
export class BoxedSigninComponent {
    store: any;
    currYear: number = new Date().getFullYear();

    email = '';
    password = '';
    showPassword = false;
    rememberMe = false;
    socialHint = '';

    isLoading = false;
    errorMsg = '';
    successMsg = '';

    private socialTimeout: ReturnType<typeof setTimeout> | null = null;

    onGoogleSignIn(): void {
        this.showSocialHint('Google sign-in is coming soon — please use your email and password for now.');
    }

    onFacebookSignIn(): void {
        this.showSocialHint('Facebook sign-in is coming soon — please use your email and password for now.');
    }

    private showSocialHint(message: string): void {
        this.socialHint = message;
        this.errorMsg = '';
        if (this.socialTimeout) {
            clearTimeout(this.socialTimeout);
        }
        this.socialTimeout = setTimeout(() => (this.socialHint = ''), 5000);
    }

    constructor(
        public translate: TranslateService,
        public storeData: Store<any>,
        public router: Router,
        private appSetting: AppInitializerService,
        private authService: AuthService,
        private cdr: ChangeDetectorRef,
    ) {
        this.initStore();
    }

    async initStore() {
        this.storeData.select((d: any) => d.index).subscribe((d: any) => {
            this.store = d;
        });
    }

    togglePasswordVisibility() {
        this.showPassword = !this.showPassword;
    }

    onSubmit() {
        this.errorMsg = '';
        this.successMsg = '';
        this.socialHint = '';
        const email = this.email.trim().toLowerCase();
        const password = this.password;

        if (!email || !password) {
            this.errorMsg = 'Please fill in both email and password.';
            return;
        }

        this.isLoading = true;

        this.authService.login({ email, password }).subscribe({
            next: (res) => {
                this.isLoading = false;
                if (res?.statusCode === 200 && res?.data?.token) {
                    this.email = email;
                    this.successMsg = this.authService.needsRoleSelection()
                        ? 'Sign in successful. Choose your role…'
                        : `Welcome back, ${res.data.displayName}!`;
                    const destination = this.authService.needsRoleSelection()
                        ? '/auth/select-role'
                        : '/';
                    setTimeout(() => this.router.navigate([destination]), this.authService.needsRoleSelection() ? 400 : 800);
                } else {
                    this.errorMsg = res?.message || 'Login failed. Please try again.';
                }
            },
            error: (err) => {
                this.isLoading = false;
                const msg =
                    err?.error?.message ||
                    err?.message ||
                    'Login failed. Check your credentials and try again.';

                setTimeout(() => {
                    this.errorMsg = msg;
                    this.cdr.detectChanges();
                }, 0);
            },
        });
    }

    changeLanguage(item: any) {
        this.translate.use(item.code);
        this.appSetting.toggleLanguage(item);
        if (this.store.locale?.toLowerCase() === 'ae') {
            this.storeData.dispatch({ type: 'toggleRTL', payload: 'rtl' });
        } else {
            this.storeData.dispatch({ type: 'toggleRTL', payload: 'ltr' });
        }
        window.location.reload();
    }
}
