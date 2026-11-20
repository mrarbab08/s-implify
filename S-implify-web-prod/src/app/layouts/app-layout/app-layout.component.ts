import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnDestroy, OnInit, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { debounceTime, filter, switchMap } from 'rxjs/operators';
import { fromEvent, of } from 'rxjs';

import { AppInitializerService } from '../../core/services/app-initializer.service';
import { AuthService } from '../../core/services/auth.service';
import { DistrictContextService } from '../../core/services/district-context.service';
import { LayoutSharedModule } from '../../shared/layout-shared.module';
import { FooterComponent } from '../footer/footer.component';
import { HeaderComponent } from '../header/header.component';
import { ThemeCustomizerComponent } from '../theme-customizer/theme-customizer.component';
import { AiBotComponent } from '../ai-bot/ai-bot.component';

@Component({
    selector: 'app-layout',
    templateUrl: './app-layout.component.html',
    standalone: true,
    imports: [
        CommonModule,
        RouterModule,
        TranslateModule,
        LayoutSharedModule,
        HeaderComponent,
        FooterComponent,
        ThemeCustomizerComponent,
        AiBotComponent,
    ],
})
export class AppLayout implements OnInit, OnDestroy {
    private readonly destroyRef = inject(DestroyRef);

    store: any = {};
    showTopButton = false;

    private animationElement: Element | null = null;
    private headerResizeObserver: ResizeObserver | null = null;

    private readonly onWindowScroll = (): void => {
        this.showTopButton =
            document.body.scrollTop > 50 || document.documentElement.scrollTop > 50;
    };

    private readonly onAnimationEnd = (): void => {
        this.service.changeAnimation('remove');
    };

    constructor(
        public translate: TranslateService,
        public storeData: Store<any>,
        private service: AppInitializerService,
        private router: Router,
        private districtContext: DistrictContextService,
        private auth: AuthService,
    ) {
        this.initStore();
    }

    ngOnInit(): void {
        this.districtContext
            .initialize()
            .pipe(
                switchMap(() => {
                    if (this.auth.hasFixedDistrictFromActiveRole()) {
                        return this.districtContext.syncToActiveRole();
                    }
                    return of(undefined);
                }),
                switchMap(() => {
                    if (!this.districtContext.shouldRedirectToRoleDashboard(this.router.url)) {
                        return of(null);
                    }
                    return this.districtContext.ensureRoleDashboardRoute();
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe((route) => {
                if (route?.length) {
                    void this.router.navigate(route, { replaceUrl: true });
                }
            });
        this.initAnimation();
        window.addEventListener('scroll', this.onWindowScroll);
    }

    ngOnDestroy(): void {
        window.removeEventListener('scroll', this.onWindowScroll);
        this.animationElement?.removeEventListener('animationend', this.onAnimationEnd);
        this.animationElement = null;
        this.headerResizeObserver?.disconnect();
        this.headerResizeObserver = null;
    }

    private initAnimation(): void {
        this.service.changeAnimation();
        this.router.events
            .pipe(
                filter((event): event is NavigationEnd => event instanceof NavigationEnd),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe(() => {
                this.service.changeAnimation();
                this.syncHeaderOffset();
            });

        this.router.events
            .pipe(
                filter((event): event is NavigationEnd => event instanceof NavigationEnd),
                switchMap(() => {
                    if (!this.districtContext.shouldRedirectToRoleDashboard(this.router.url)) {
                        return of(null);
                    }
                    return this.districtContext.ensureRoleDashboardRoute();
                }),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe((route) => {
                if (route?.length) {
                    void this.router.navigate(route, { replaceUrl: true });
                }
            });

        this.animationElement = document.querySelector('.animation');
        this.animationElement?.addEventListener('animationend', this.onAnimationEnd);
        this.syncHeaderOffset();
        window.setTimeout(() => this.syncHeaderOffset(), 400);
        fromEvent(window, 'resize')
            .pipe(debounceTime(120), takeUntilDestroyed(this.destroyRef))
            .subscribe(() => this.syncHeaderOffset());

        const headerBar = document.querySelector('.app-header-bar') as HTMLElement | null;
        if (headerBar && typeof ResizeObserver !== 'undefined') {
            this.headerResizeObserver = new ResizeObserver(() => this.syncHeaderOffset());
            this.headerResizeObserver.observe(headerBar);
        }
    }

    /**
     * The single top bar is fixed to the top of the viewport, so the page
     * content needs exactly its height as top padding to stay visible below it.
     */
    private syncHeaderOffset(): void {
        const headerBar = document.querySelector('.app-header-bar') as HTMLElement | null;
        const content = document.querySelector('.main-container > .main-content > .animation') as HTMLElement | null;
        if (!headerBar || !content) {
            return;
        }
        const height = Math.ceil(headerBar.getBoundingClientRect().height);
        content.style.paddingTop = `${height}px`;

        // Re-measure whenever the bar changes height (row wrapping, breakpoint switch).
        if (!this.headerResizeObserver && typeof ResizeObserver !== 'undefined') {
            this.headerResizeObserver = new ResizeObserver(() => this.syncHeaderOffset());
            this.headerResizeObserver.observe(headerBar);
        }
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
