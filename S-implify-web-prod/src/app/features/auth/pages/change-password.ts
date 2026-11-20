import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SharedModule } from '../../../shared/shared.module';
import { AuthService } from 'src/app/core/services/auth.service';

@Component({
    templateUrl: './change-password.html',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, SharedModule],
})
export class ChangePasswordComponent implements OnInit {
    currYear: number = new Date().getFullYear();

    token = '';
    newPassword = '';
    confirmPassword = '';
    showPassword = false;
    showConfirmPassword = false;

    isLoading = false;
    errorMsg = '';
    successMsg = '';

    constructor(
        private authService: AuthService,
        private route: ActivatedRoute,
        private router: Router,
        private cdr: ChangeDetectorRef,
    ) {}

    ngOnInit(): void {
        const tokenFromQuery = this.route.snapshot.queryParamMap.get('token');
        if (tokenFromQuery?.trim()) {
            this.token = tokenFromQuery.trim();
        } else {
            this.errorMsg = 'This reset link is missing a token. Please use the link from your email.';
        }
    }

    togglePasswordVisibility(): void {
        this.showPassword = !this.showPassword;
    }

    toggleConfirmPasswordVisibility(): void {
        this.showConfirmPassword = !this.showConfirmPassword;
    }

    onSubmit(): void {
        this.errorMsg = '';
        this.successMsg = '';

        const token = this.token.trim();
        const newPassword = this.newPassword;
        const confirmPassword = this.confirmPassword;

        if (!token) {
            this.errorMsg = 'This reset link is missing a token. Please use the link from your email.';
            return;
        }
        if (!newPassword || !confirmPassword) {
            this.errorMsg = 'Please enter and confirm your new password.';
            return;
        }
        if (newPassword.length < 6) {
            this.errorMsg = 'Password must be at least 6 characters.';
            return;
        }
        if (newPassword !== confirmPassword) {
            this.errorMsg = 'Passwords do not match.';
            return;
        }

        this.isLoading = true;
        this.authService.resetPassword({ token, newPassword }).subscribe({
            next: (res) => {
                this.isLoading = false;
                if (res?.statusCode === 200 || res?.statusCode === 201) {
                    this.successMsg = res?.message || 'Password updated successfully. You can sign in now.';
                    this.newPassword = '';
                    this.confirmPassword = '';
                    setTimeout(() => this.router.navigate(['/auth/login']), 1500);
                } else {
                    this.errorMsg = res?.message || 'Unable to reset password. Please try again.';
                }
                this.cdr.markForCheck();
            },
            error: (err) => {
                this.isLoading = false;
                this.errorMsg =
                    err?.error?.message ||
                    err?.message ||
                    'Unable to reset password. The token may be invalid or expired.';
                this.cdr.markForCheck();
            },
        });
    }
}
