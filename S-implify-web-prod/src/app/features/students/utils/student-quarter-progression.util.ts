import type { StudentGrowthRecordResponse } from '../../../core/models/simplify-api.model';
import type { StudentColumnDef } from '../models/student-table.model';

export const DEFAULT_QUARTER_SEQUENCE = ['BOY', 'PA1', 'MOY', 'EOY'] as const;

export interface QuarterDiffPair {
    laterCode: string;
    earlierCode: string;
    field: string;
    title: string;
}

/** Stable field key for a later-minus-earlier quarter delta column. */
export function quarterDiffField(laterCode: string, earlierCode: string): string {
    return `diff_${laterCode}_${earlierCode}`;
}

/** Normalize API quarter sequence; fall back to BOY → EOY when absent. */
export function normalizeQuarterSequence(sequence?: string[] | null): string[] {
    const cleaned = (sequence ?? [])
        .map((code) => code?.trim())
        .filter((code): code is string => !!code);
    return cleaned.length >= 2 ? cleaned : [...DEFAULT_QUARTER_SEQUENCE];
}

/** Consecutive quarter pairs from last to first (EOY-MOY, MOY-PA1, PA1-BOY, …). */
export function buildQuarterDiffPairs(sequence: string[]): QuarterDiffPair[] {
    const normalized = normalizeQuarterSequence(sequence);
    const pairs: QuarterDiffPair[] = [];
    for (let i = normalized.length - 1; i >= 1; i--) {
        const laterCode = normalized[i];
        const earlierCode = normalized[i - 1];
        pairs.push({
            laterCode,
            earlierCode,
            field: quarterDiffField(laterCode, earlierCode),
            title: `${laterCode}-${earlierCode}`,
        });
    }
    return pairs;
}

export function buildQuarterDiffColumnDefs(sequence?: string[] | null): StudentColumnDef[] {
    return buildQuarterDiffPairs(normalizeQuarterSequence(sequence)).map((pair) => ({
        field: pair.field,
        title: pair.title,
        filter: true,
        search: true,
    }));
}

/** Collect quarter scores from progression steps and the active quarter on the record. */
export function quarterScoresFromRecord(
    record: StudentGrowthRecordResponse,
): Record<string, number | null> {
    const scores: Record<string, number | null> = {};

    for (const step of record.quarterScoreProgression ?? []) {
        const earlier = step.earlierQuarterCode?.trim();
        const later = step.laterQuarterCode?.trim();
        if (earlier) {
            scores[earlier] = toNullableNumber(step.earlierQuarterScore);
        }
        if (later) {
            scores[later] = toNullableNumber(step.laterQuarterScore);
        }
    }

    const active = record.quarterCode?.trim();
    if (active && record.quarterScore != null && Number.isFinite(record.quarterScore)) {
        scores[active] = record.quarterScore;
    }

    return scores;
}

export function computeQuarterDiff(
    laterScore: number | null | undefined,
    earlierScore: number | null | undefined,
): number | null {
    if (
        laterScore == null ||
        earlierScore == null ||
        !Number.isFinite(laterScore) ||
        !Number.isFinite(earlierScore)
    ) {
        return null;
    }
    return Number((laterScore - earlierScore).toFixed(1));
}

/** Map each EOY-MOY-style pair to a row field value. */
export function quarterDiffValuesFromRecord(
    record: StudentGrowthRecordResponse,
    sequence?: string[] | null,
): Record<string, number | null> {
    const scores = quarterScoresFromRecord(record);
    const values: Record<string, number | null> = {};

    for (const pair of buildQuarterDiffPairs(normalizeQuarterSequence(sequence))) {
        values[pair.field] = computeQuarterDiff(scores[pair.laterCode], scores[pair.earlierCode]);
    }

    return values;
}

function toNullableNumber(value: number | null | undefined): number | null {
    return value != null && Number.isFinite(value) ? value : null;
}
