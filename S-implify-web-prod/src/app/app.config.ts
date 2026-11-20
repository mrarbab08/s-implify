import { HttpBackend, HttpClient } from '@angular/common/http';
import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { StoreModule } from '@ngrx/store';
import { TranslateLoader, TranslateModule } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';
import { provideScrollbarOptions } from 'ngx-scrollbar';
import { provideHighlightOptions } from 'ngx-highlightjs';

import { routes } from './app.routes';
import { coreProviders } from './core/core.config';
import { indexReducer } from './store/index.reducer';

export function httpLoaderFactory(httpHandler: HttpBackend): TranslateHttpLoader {
    return new TranslateHttpLoader(new HttpClient(httpHandler));
}

export const appConfig: ApplicationConfig = {
    providers: [
        provideZoneChangeDetection({ eventCoalescing: true }),
        ...coreProviders,
        provideRouter(routes),
        provideScrollbarOptions({
            visibility: 'hover',
            appearance: 'compact',
        }),
        provideHighlightOptions({
            coreLibraryLoader: () => import('highlight.js/lib/core'),
            languages: {
                json: () => import('highlight.js/lib/languages/json'),
                typescript: () => import('highlight.js/lib/languages/typescript'),
                xml: () => import('highlight.js/lib/languages/xml'),
            },
        }),
        importProvidersFrom(
            StoreModule.forRoot({ index: indexReducer }),
            TranslateModule.forRoot({
                loader: {
                    provide: TranslateLoader,
                    useFactory: httpLoaderFactory,
                    deps: [HttpBackend],
                },
            }),
        ),
    ],
};