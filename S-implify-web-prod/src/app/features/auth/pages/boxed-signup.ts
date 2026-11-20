import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { AppInitializerService } from 'src/app/core/services/app-initializer.service';
import { SharedModule } from '../../../shared/shared.module';
import { AuthService } from 'src/app/core/services/auth.service';

@Component({
    templateUrl: './boxed-signup.html',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, SharedModule],
})
export class BoxedSignupComponent {
    store: any;
    currYear: number = new Date().getFullYear();

    displayName = '';
    email = '';
    password = '';
    confirmPassword = '';
    showPassword = false;
    showConfirm = false;

    isLoading = false;
    errorMsg = '';
    successMsg = '';

    constructor(
        public translate: TranslateService,
        public storeData: Store<any>,
        public router: Router,
        private appSetting: AppInitializerService,
        private authService: AuthService,
    ) {
        this.initStore();
    }

    async initStore() {
        this.storeData.select((d: any) => d.index).subscribe((d: any) => {
            this.store = d;
        });
    }

    togglePassword() {
        this.showPassword = !this.showPassword;
    }

    toggleConfirmPassword() {
        this.showConfirm = !this.showConfirm;
    }

    onSubmit() {
        this.errorMsg = '';
        this.successMsg = '';
        const displayName = this.displayName.trim();
        const email = this.email.trim().toLowerCase();
        const password = this.password;
        const confirmPassword = this.confirmPassword;

        if (!displayName || !email || !password || !confirmPassword) {
            this.errorMsg = 'Please fill in all required fields.';
            return;
        }

        if (password !== confirmPassword) {
            this.errorMsg = 'Passwords do not match.';
            return;
        }

        if (password.length < 6) {
            this.errorMsg = 'Password must be at least 6 characters.';
            return;
        }

        this.isLoading = true;

        this.authService.register({ email, password, displayName }).subscribe({
            next: (res) => {
                this.isLoading = false;
                if (res?.statusCode === 200 || res?.statusCode === 201) {
                    this.successMsg = 'Account created! Redirecting to dashboard…';
                    this.displayName = displayName;
                    this.email = email;
                    setTimeout(() => this.router.navigate(['/']), 1200);
                } else {
                    this.errorMsg = res?.message || 'Registration failed. Please try again.';
                }
            },
            error: (err) => {
                this.isLoading = false;
                this.errorMsg =
                    err?.error?.message ||
                    err?.message ||
                    'Registration failed. Please try again.';
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
