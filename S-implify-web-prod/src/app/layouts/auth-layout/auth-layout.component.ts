import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterModule } from '@angular/router';
import { Store } from '@ngrx/store';

@Component({
    selector: 'auth-layout',
    templateUrl: './auth-layout.component.html',
    standalone: true,
    imports: [CommonModule, RouterModule],
})
export class AuthLayout implements OnInit, OnDestroy {
    private readonly destroyRef = inject(DestroyRef);

    store: any = {};
    showTopButton = false;

    private readonly onWindowScroll = (): void => {
        this.showTopButton =
            document.body.scrollTop > 50 || document.documentElement.scrollTop > 50;
    };

    constructor(public storeData: Store<any>) {
        this.initStore();
    }

    ngOnInit(): void {
        window.addEventListener('scroll', this.onWindowScroll);
    }

    ngOnDestroy(): void {
        window.removeEventListener('scroll', this.onWindowScroll);
    }

    private initStore(): void {
        this.storeData
            .select((d: any) => d.index)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe((d: any) => {
                this.store = d;
            });
    }

    goToTop(): void {
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
    }
}
