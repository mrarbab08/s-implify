import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { TranslateService } from '@ngx-translate/core';
import { $themeConfig } from '../../theme/theme.config';

/**
 * AppInitializerService (was AppService)
 * Centralized in CoreModule — initializes theme, locale, and layout
 * settings from localStorage on application startup.
 */
@Injectable({
    providedIn: 'root',
})
export class AppInitializerService {
    storeData: any;

    constructor(public translate: TranslateService, public store: Store<any>) {
        this.initStoreData();
    }

    initStoreData() {
        this.store
            .select((d: any) => d.index)
            .subscribe((d: any) => {
                this.storeData = d;
            });

        // theme
        let val: any = localStorage.getItem('theme');
        val = val || $themeConfig.theme;
        this.store.dispatch({ type: 'toggleTheme', payload: val });

        // menu — the app uses the top navigation bar; stored value ignored so a stale
        // "horizontal" from localStorage doesn't override it.
        val = $themeConfig.menu;
        this.store.dispatch({ type: 'toggleMenu', payload: val });

        // the old sidebar collapse state no longer exists — purge any stale flag
        localStorage.removeItem('sidebarCollapsed');

        // layout
        val = localStorage.getItem('layout');
        val = val || $themeConfig.layout;
        this.store.dispatch({ type: 'toggleLayout', payload: val });

        // locale / i18n
        val = localStorage.getItem('i18n_locale');
        val = val || $themeConfig.locale;
        const list = this.storeData.languageList;
        const item = list.find((i: any) => i.code === val);
        if (item) {
            this.toggleLanguage(item);
        }

        // RTL
        val = localStorage.getItem('rtlClass');
        val = val || $themeConfig.rtlClass;
        this.store.dispatch({ type: 'toggleRTL', payload: val });

        // animation
        val = localStorage.getItem('animation');
        val = val || $themeConfig.animation;
        this.store.dispatch({ type: 'toggleAnimation', payload: val });

        // navbar
        val = localStorage.getItem('navbar');
        val = val || $themeConfig.navbar;
        this.store.dispatch({ type: 'toggleNavbar', payload: val });

        // semidark
        val = localStorage.getItem('semidark');
        val = val === 'true' ? true : $themeConfig.semidark;
        this.store.dispatch({ type: 'toggleSemidark', payload: val });
    }

    toggleLanguage(item: any) {
        let lang: any = null;
        lang = 'en';
        if (item) {
            lang = item;
        } else {
            let code = this.translate.currentLang || null;
            if (!code) {
                code = localStorage.getItem('i18n_locale');
            }
            item = this.storeData.languageList.find((d: any) => d.code === code);
            if (item) {
                lang = item;
            }
        }

        if (!lang) {
            lang = this.storeData.languageList.find((d: any) => d.code === 'en');
        }

        this.translate.use(lang.code);
        this.store.dispatch({ type: 'toggleLocale', payload: lang.code });
        return lang;
    }

    changeAnimation(type = 'add') {
        if (this.storeData.animation) {
            const ele: any = document.querySelector('.animation');
            if (type === 'add') {
                ele?.classList.add('animate__animated');
                ele?.classList.add(this.storeData.animation);
            } else {
                ele?.classList.remove('animate__animated');
                ele?.classList.remove(this.storeData.animation);
            }
        }
    }
}
