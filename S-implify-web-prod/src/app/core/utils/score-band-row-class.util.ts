/** Row accent class for score bands (≤63 red, 64–74 yellow, >74 green). */
export type ScoreBandRowClass = '' | 'score-row-danger' | 'score-row-warning' | 'score-row-success';

export function scoreBandRowClass(score: number | null | undefined): ScoreBandRowClass {
    if (score == null || !Number.isFinite(score)) {
        return '';
    }
    if (score < 64) {
        return 'score-row-danger';
    }
    if (score <= 74) {
        return 'score-row-warning';
    }
    return 'score-row-success';
}

/** Row accent by Total PIA (≤89% red, 90–95% yellow, >95% green). */
export function normalizePiaPercent(pia: number): number {
    if (!Number.isFinite(pia)) {
        return NaN;
    }
    if (pia > 0 && pia <= 1) {
        return pia * 100;
    }
    return pia;
}

export function piaBandRowClass(pia: number | null | undefined): ScoreBandRowClass {
    if (pia == null || !Number.isFinite(pia)) {
        return '';
    }
    const pct = normalizePiaPercent(pia);
    if (!Number.isFinite(pct)) {
        return '';
    }
    if (pct <= 89) {
        return 'score-row-danger';
    }
    if (pct > 95) {
        return 'score-row-success';
    }
    if (pct >= 90) {
        return 'score-row-warning';
    }
    return 'score-row-danger';
}
