import type { Campus, Grade, GrowthFilters, Subject } from '../models/simplify-api.model';

export type GrowthFilterChipId = string;

const BOOL_LABELS: Record<'true' | 'false', string> = {
    true: 'Yes',
    false: 'No',
};

const TEST_LANGUAGE_LABELS: Record<string, string> = {
    ENGLISH: 'English',
    SPANISH: 'Spanish',
};

function boolFilterLabel(value: boolean): string {
    return BOOL_LABELS[String(value) as 'true' | 'false'];
}

function testLanguageLabel(value: string): string {
    const key = value.trim().toUpperCase();
    return TEST_LANGUAGE_LABELS[key] ?? value;
}

/** Human-readable chips for applied dashboard search filters. */
export function buildGrowthFilterChips(
    filters: GrowthFilters,
    grades: Grade[],
    subjects: Subject[],
    campuses?: Campus[],
): Array<{ id: GrowthFilterChipId; label: string }> {
    const chips: Array<{ id: GrowthFilterChipId; label: string }> = [];

    if (filters.campusId != null) {
        const campus = campuses?.find((c) => c.campusId === filters.campusId);
        chips.push({
            id: 'campus',
            label: `Campus: ${campus?.campusName || campus?.campusCode || filters.campusId}`,
        });
    }

    for (const code of filters.grades) {
        const grade = grades.find((g) => g.gradeCode === code);
        chips.push({
            id: `grade:${code}`,
            label: `Grade: ${grade?.gradeName || grade?.gradeCode || code}`,
        });
    }

    for (const code of filters.subjects) {
        const subject = subjects.find((s) => s.subjectCode === code);
        chips.push({
            id: `subject:${code}`,
            label: `Subject: ${subject?.subjectName || subject?.subjectCode || code}`,
        });
    }

    if (filters.specialEducation != null) {
        chips.push({
            id: 'specialEducation',
            label: `Special Education: ${boolFilterLabel(filters.specialEducation)}`,
        });
    }

    if (filters.economicDisadvantage != null) {
        chips.push({
            id: 'economicDisadvantage',
            label: `Economic Disadvantage: ${boolFilterLabel(filters.economicDisadvantage)}`,
        });
    }

    if (filters.emergentBilingual) {
        chips.push({
            id: 'emergentBilingual',
            label: `Emergent Bilingual: ${filters.emergentBilingual}`,
        });
    }

    if (filters.ethnicity) {
        chips.push({
            id: 'ethnicity',
            label: `Ethnicity: ${filters.ethnicity}`,
        });
    }

    if (filters.testLanguage) {
        chips.push({
            id: 'testLanguage',
            label: `Test Language: ${testLanguageLabel(filters.testLanguage)}`,
        });
    }

    return chips;
}

/** Returns filters with one chip removed (immutable). */
export function removeGrowthFilterChip(filters: GrowthFilters, id: GrowthFilterChipId): GrowthFilters {
    if (id.startsWith('grade:')) {
        const code = id.slice('grade:'.length);
        return {
            ...filters,
            grades: filters.grades.filter((g) => g !== code),
        };
    }
    if (id.startsWith('subject:')) {
        const code = id.slice('subject:'.length);
        return {
            ...filters,
            subjects: filters.subjects.filter((s) => s !== code),
        };
    }

    switch (id) {
        case 'campus':
            return { ...filters, campusId: null };
        case 'specialEducation':
            return { ...filters, specialEducation: null };
        case 'economicDisadvantage':
            return { ...filters, economicDisadvantage: null };
        case 'emergentBilingual':
            return { ...filters, emergentBilingual: null };
        case 'ethnicity':
            return { ...filters, ethnicity: null };
        case 'testLanguage':
            return { ...filters, testLanguage: null };
        default:
            return filters;
    }
}
