import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

/**
 * Small circular progress ring (pure SVG, stroke-dasharray/dashoffset).
 * Used by summary cards on the dashboard — no chart library required.
 */
@Component({
    selector: 'app-progress-ring',
    standalone: true,
    imports: [CommonModule],
    changeDetection: ChangeDetectionStrategy.OnPush,
    template: `
        <div class="progress-ring flex select-none flex-col items-center">
            <svg
                viewBox="0 0 100 100"
                class="block"
                [style.width.px]="sizePx"
                [style.height.px]="sizePx"
                role="img"
                [attr.aria-label]="ariaLabel"
            >
                <!-- Track -->
                <circle class="ring-track" cx="50" cy="50" [attr.r]="radius" fill="none" [attr.stroke-width]="stroke" />
                <!-- Progress arc (clockwise from 12 o'clock), animated via dashoffset -->
                @if (numericValue !== null) {
                <circle
                    class="ring-arc"
                    cx="50"
                    cy="50"
                    [attr.r]="radius"
                    fill="none"
                    [attr.stroke]="color"
                    [attr.stroke-width]="stroke"
                    stroke-linecap="round"
                    [attr.stroke-dasharray]="circumference"
                    [style.strokeDashoffset]="dashOffset"
                    transform="rotate(-90 50 50)"
                />
                }
                <!-- Center text -->
                <text
                    x="50"
                    y="50"
                    text-anchor="middle"
                    dominant-baseline="central"
                    class="ring-value"
                    [attr.font-size]="centerFont"
                >{{ centerText }}</text>
            </svg>
            @if (caption) {
            <div class="mt-1 flex items-baseline gap-1 leading-none">
                <span class="ring-caption">{{ caption }}</span>
                @if (grade) {
                <span class="ring-grade" [ngClass]="gradeClass">{{ grade }}</span>
                }
            </div>
            }
        </div>
    `,
    styles: [`
        :host { display: block; }
        svg { transition: none; }
        .ring-track { stroke: #e2e8f0; }
        :host-context(.dark) .ring-track,
        :host-context(body.dark) .ring-track { stroke: #1c2b47; }
        .ring-arc { transition: stroke-dashoffset 600ms cubic-bezier(0.4, 0, 0.2, 1); }
        .ring-value {
            fill: #0f172a;
            font-weight: 800;
            letter-spacing: -0.02em;
        }
        :host-context(.dark) .ring-value,
        :host-context(body.dark) .ring-value { fill: #f1f5f9; }
        .ring-caption {
            font-size: 8px;
            font-weight: 800;
            letter-spacing: 0.12em;
            color: #94a3b8;
        }
        :host-context(.dark) .ring-caption,
        :host-context(body.dark) .ring-caption { color: #64748b; }
        .ring-grade { font-size: 10px; font-weight: 800; }
    `],
})
export class ProgressRingComponent {
    /** Percentage (0–100); null renders a track-only ring with '—' in the center. */
    @Input() value: number | null = null;
    /** Arc color (e.g. '#14b8a6', '#a32cc4'). */
    @Input() color = '#14b8a6';
    /** Ring size: 'sm' ≈ 46–48px, 'md' ≈ 52px, 'lg' ≈ 130px. */
    @Input() size: 'sm' | 'md' | 'lg' = 'md';
    /** Text inside the ring, e.g. '63.2%'. */
    @Input() centerText = '—';
    /** Tiny caption under the ring, e.g. 'COMP'. */
    @Input() caption = '';
    /** Letter grade shown next to the caption (optional). */
    @Input() grade: string | null = null;
    /** Tailwind color classes for the grade (e.g. 'text-orange-600'). */
    @Input() gradeClass = '';

    get sizePx(): number {
        return this.size === 'sm' ? 47 : this.size === 'md' ? 52 : 130;
    }
    get stroke(): number {
        // viewBox units (100 wide viewBox)
        return this.size === 'sm' ? 12.5 : this.size === 'md' ? 12.5 : 9;
    }
    get radius(): number {
        return this.size === 'sm' || this.size === 'md' ? 43.5 : 44.5;
    }
    get centerFont(): number {
        return this.size === 'sm' || this.size === 'md' ? 22 : 26;
    }
    get circumference(): number {
        return 2 * Math.PI * this.radius;
    }

    get numericValue(): number | null {
        if (this.value == null || !Number.isFinite(this.value)) {
            return null;
        }
        return Math.min(100, Math.max(0, this.value));
    }

    get dashOffset(): number {
        const v = this.numericValue;
        return v === null ? this.circumference : this.circumference * (1 - v / 100);
    }

    get ariaLabel(): string {
        return this.numericValue === null ? 'No value' : `${this.centerText}`;
    }
}
