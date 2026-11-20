import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MenuModule } from 'headlessui-angular';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { IconModule } from './icon/icon.module';

/**
 * Lightweight shared imports for layout shells (header, sidebar, customizer).
 * Avoids pulling the full SharedModule (charts, datatables, quill, etc.) into the initial bundle.
 */
@NgModule({
    imports: [CommonModule, NgScrollbarModule, IconModule, MenuModule],
    exports: [NgScrollbarModule, IconModule, MenuModule],
})
export class LayoutSharedModule {}
