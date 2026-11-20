import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ChangeDetectorRef, Component } from '@angular/core';
import { SharedModule } from '../../../shared/shared.module';
import { AuthService } from 'src/app/core/services/auth.service';

@Component({
    templateUrl: './boxed-password-reset.html',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, SharedModule],
})
export class BoxedPasswordResetComponent {
    currYear: number = new Date().getFullYear();

    email = '';
    isLoading = false;
    errorMsg = '';
    successMsg = '';

    constructor(
        private authService: AuthService,
        private cdr: ChangeDetectorRef,
    ) {}

    onSubmit(): void {
        this.errorMsg = '';
        this.successMsg = '';
        const email = this.email.trim().toLowerCase();

        if (!email) {
            this.errorMsg = 'Please enter your email.';
            return;
        }

        this.isLoading = true;
        this.authService.forgotPassword({ email }).subscribe({
            next: (res) => {
                this.isLoading = false;
                if (res?.statusCode === 200 || res?.statusCode === 201) {
                    this.successMsg =
                        res?.message ||
                        'If an account exists for that email, a reset link has been sent.';
                    this.email = '';
                } else {
                    this.errorMsg = res?.message || 'Unable to send reset email. Please try again.';
                }
                this.cdr.markForCheck();
            },
            error: (err) => {
                this.isLoading = false;
                this.errorMsg =
                    err?.error?.message ||
                    err?.message ||
                    'Unable to send reset email. Please try again.';
                this.cdr.markForCheck();
            },
        });
    }
}
