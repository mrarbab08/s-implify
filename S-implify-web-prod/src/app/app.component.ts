import { Component, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map, switchMap, tap } from 'rxjs/operators';
import { AuthService } from './core/services/auth.service';

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    standalone: true,
    imports: [RouterOutlet],
})
export class AppComponent {
    constructor() {
        const router = inject(Router);
        const activatedRoute = inject(ActivatedRoute);
        const titleService = inject(Title);
        const destroyRef = inject(DestroyRef);
        const auth = inject(AuthService);

        // Sync the cached session with the server (role scopes can change after login).
        auth.refreshSession();

        router.events
            .pipe(
                filter((event) => event instanceof NavigationEnd),
                map(() => activatedRoute),
                map((route) => {
                    while (route.firstChild) {
                        route = route.firstChild;
                    }
                    return route;
                }),
                filter((route) => route.outlet === 'primary'),
                switchMap((route) =>
                    route.data.pipe(
                        map((routeData) => {
                            const title = routeData['title'] as string | undefined;
                            return { title };
                        }),
                    ),
                ),
                tap((data) => {
                    let title = data.title;
                    title = (title ? title + ' | ' : '') + 'S-Implify';
                    titleService.setTitle(title);
                }),
                takeUntilDestroyed(destroyRef),
            )
            .subscribe();
    }
}
