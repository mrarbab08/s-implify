/** Static option lists for student growth record filters (no dedicated reference APIs). */

export const STUDENT_TRISTATE_BOOL_OPTIONS: { value: boolean; label: string }[] = [
    { value: true, label: 'Yes' },
    { value: false, label: 'No' },
];

export const STUDENT_EMERGENT_BILINGUAL_OPTIONS = [
    { value: 'First Year of Monitoring', label: 'First Year of Monitoring' },
    { value: 'Second Year of Monitoring', label: 'Second Year of Monitoring' },
    { value: 'Currently Emergent Bilingual', label: 'Currently Emergent Bilingual' },
    {
        value: 'Other Non-Emergent Bilingual Student',
        label: 'Other Non-Emergent Bilingual Student',
    },
];

export const STUDENT_ETHNICITY_OPTIONS = [
    { value: 'Asian', label: 'Asian' },
    { value: 'American Indian/Alaskan Native', label: 'American Indian/Alaskan Native' },
    { value: 'Hispanic', label: 'Hispanic' },
    { value: 'Two or More Races', label: 'Two or More Races' },
    { value: 'Black/African American', label: 'Black/African American' },
    { value: 'Native Hawaiian/Pacific Islander', label: 'Native Hawaiian/Pacific Islander' },
    { value: 'White', label: 'White' },
];

export const STUDENT_TEST_LANGUAGE_OPTIONS = [
    { value: 'ENGLISH', label: 'English' },
    { value: 'SPANISH', label: 'Spanish' },
];

export function mapStudentTestLanguageForApi(value: string | null | undefined): string | null {
    if (!value) {
        return null;
    }
    if (value === 'ENGLISH') {
        return 'English';
    }
    if (value === 'SPANISH') {
        return 'Spanish';
    }
    return value;
}

export function studentTestLanguageLabel(value: string | null | undefined): string {
    if (!value) {
        return '';
    }
    return STUDENT_TEST_LANGUAGE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function studentBoolFilterLabel(value: boolean | null | undefined): string {
    if (value === true) {
        return 'Yes';
    }
    if (value === false) {
        return 'No';
    }
    return '';
}
