import type {
    AcademicYear,
    Campus,
    CampusCategory,
    CampusCategoryGrowthMetricsResponse,
    CampusGrowthMetricsResponse,
    CampusAttendanceRecordDto,
    CampusWiseAttendanceStatDto,
    District,
    DistrictAcademy,
    DistrictAttendanceSummaryDto,
    DistrictQuarter,
    Grade,
    GrowthOverallMetricsResponse,
    IndividualCampusAttendanceStatsDto,
    IndividualStudentAttendanceStatsDto,
    LowestAdaCampusSnapshotDto,
    MonthlyAttendanceStatDto,
    State,
    Subject,
    CampusGradeItemDto,
    TeacherAssessmentRecordResponse,
    TeacherGrowthMetricsResponse,
    TeacherStudentGrowthMetricsResponse,
    TopStudentItemDto,
    TopTeacherItemDto,
    CcmrAcademyMonthlyGradRateDto,
    CcmrAcademyRecordDto,
    CcmrAcademyStatsItemDto,
    CcmrDistrictMonthRateDto,
    DistrictOverallPercentagesResponse,
    StudentQuarterMobilityResponse,
} from '../models/simplify-api.model';

/* ── Reference / district context ─────────────────────────────────────────── */

export const MOCK_STATES: State[] = [
    { stateId: 1, stateCode: 'TX', stateName: 'Texas', isActive: true },
];

export const MOCK_DISTRICTS: District[] = [
    {
        districtId: 1,
        stateId: 1,
        districtName: 'Sheldon ISD (demo)',
        districtCode: 'SHE',
        isActive: true,
    },
];

export const MOCK_ACADEMIC_YEARS: AcademicYear[] = [
    {
        academicYearId: 1,
        yearLabel: '2025-2026',
        startDate: '2025-08-15',
        endDate: '2026-05-30',
        isActive: true,
    },
    {
        academicYearId: 2,
        yearLabel: '2024-2025',
        startDate: '2024-08-15',
        endDate: '2025-05-30',
        isActive: true,
    },
];

const MOCK_DISTRICT_ACADEMIES: DistrictAcademy[] = [
    { districtAcademyId: 1, districtId: 1, academyCode: 'ECH', academyName: 'Early College High', sortOrder: 1, isActive: true },
    { districtAcademyId: 2, districtId: 1, academyCode: 'FBL', academyName: 'Future Business Leaders', sortOrder: 2, isActive: true },
];

export function mockDistrictAcademiesFor(districtId: number): DistrictAcademy[] {
    return MOCK_DISTRICT_ACADEMIES.filter((a) => a.districtId === districtId);
}

export function mockDistrictQuartersFor(districtId: number): DistrictQuarter[] {
    return [
        {
            districtQuarterId: 1,
            districtId,
            academicYearId: 1,
            quarterCode: 'Q1',
            quarterName: 'Quarter 1',
            startDate: '2025-08-15',
            endDate: '2025-10-31',
            sortOrder: 1,
            isActive: true,
        },
        {
            districtQuarterId: 2,
            districtId,
            academicYearId: 1,
            quarterCode: 'Q2',
            quarterName: 'Quarter 2',
            startDate: '2025-11-01',
            endDate: '2026-01-31',
            sortOrder: 2,
            isActive: true,
        },
        {
            districtQuarterId: 3,
            districtId,
            academicYearId: 1,
            quarterCode: 'Q3',
            quarterName: 'Quarter 3',
            startDate: '2026-02-01',
            endDate: '2026-06-30',
            sortOrder: 3,
            isActive: true,
        },
        {
            districtQuarterId: 4,
            districtId,
            academicYearId: 1,
            quarterCode: 'Q4',
            quarterName: 'Quarter 4',
            startDate: '2026-07-01',
            endDate: '2026-08-14',
            sortOrder: 4,
            isActive: true,
        },
    ];
}

export function mockCampusesFor(districtId: number): Campus[] {
    return [
        { campusId: 1, districtId, campusCategoryId: 1, campusCode: 'HMC', campusName: 'H.M. Carroll Elementary', isActive: true },
        { campusId: 2, districtId, campusCategoryId: 1, campusCode: 'MON', campusName: 'Monahan Elementary', isActive: true },
        { campusId: 3, districtId, campusCategoryId: 2, campusCode: 'KMS', campusName: 'C.E. King Middle', isActive: true },
        { campusId: 4, districtId, campusCategoryId: 3, campusCode: 'CKH', campusName: 'C.E. King High', isActive: true },
    ];
}

export const MOCK_CAMPUS_CATEGORIES: CampusCategory[] = [
    { campusCategoryId: 1, categoryName: 'Elementary', categoryCode: 'ELEM', isActive: true },
    { campusCategoryId: 2, categoryName: 'Middle School', categoryCode: 'MID', isActive: true },
    { campusCategoryId: 3, categoryName: 'High School', categoryCode: 'HS', isActive: true },
];

export const MOCK_GRADES: Grade[] = [
    { gradeId: 1, gradeCode: '03', gradeName: '3rd', sortOrder: 3, isActive: true },
    { gradeId: 2, gradeCode: '05', gradeName: '5th', sortOrder: 5, isActive: true },
    { gradeId: 3, gradeCode: '08', gradeName: '8th', sortOrder: 8, isActive: true },
];

export const MOCK_SUBJECTS: Subject[] = [
    { subjectId: 1, subjectCode: 'MATH', subjectName: 'Mathematics', isActive: true },
    { subjectId: 2, subjectCode: 'RLA', subjectName: 'Reading & Language Arts', isActive: true },
    { subjectId: 3, subjectCode: 'SCI', subjectName: 'Science', isActive: true },
];

/** districtId → subjectIds (mock district-subject associations). */
export const MOCK_DISTRICT_SUBJECT_IDS = new Map<number, number[]>([[1, [1, 2]]]);

export const MOCK_CAMPUS_GRADES: CampusGradeItemDto[] = [
    {
        campusGradeId: 1,
        districtId: 1,
        campusId: 1,
        campusCode: 'HMC',
        campusName: 'H.M. Carroll Elementary',
        gradeId: 1,
        gradeCode: '03',
        gradeName: '3rd',
        isActive: true,
    },
    {
        campusGradeId: 2,
        districtId: 1,
        campusId: 1,
        campusCode: 'HMC',
        campusName: 'H.M. Carroll Elementary',
        gradeId: 2,
        gradeCode: '05',
        gradeName: '5th',
        isActive: true,
    },
    {
        campusGradeId: 3,
        districtId: 1,
        campusId: 3,
        campusCode: 'KMS',
        campusName: 'C.E. King Middle',
        gradeId: 3,
        gradeCode: '08',
        gradeName: '8th',
        isActive: true,
    },
];

export function mockCampusGradesFor(districtId?: number, campusId?: number): CampusGradeItemDto[] {
    let rows = [...MOCK_CAMPUS_GRADES];
    if (districtId != null) {
        rows = rows.filter((r) => r.districtId === districtId);
    }
    if (campusId != null) {
        rows = rows.filter((r) => r.campusId === campusId);
    }
    return rows;
}

/* ── Growth analytics ───────────────────────────────────────────────────────── */

export const MOCK_GROWTH_OVERALL: GrowthOverallMetricsResponse = {
    app: 63.8,
    meet: 33.0,
    master: 9.0,
    cs: 35.3,
    growth: 52.0,
    csGrade: null,
    growthGrade: null,
    gradesByCategory: [
        {
            campusCategoryId: 1,
            categoryCode: 'ES',
            categoryName: 'ELEMENTARY SCHOOL',
            cs: 34.2,
            csGrade: 'D',
            growth: 55.1,
            growthGrade: 'C',
        },
        {
            campusCategoryId: 2,
            categoryCode: 'MS',
            categoryName: 'MIDDLE SCHOOL',
            cs: 38.5,
            csGrade: 'D',
            growth: 48.0,
            growthGrade: 'D',
        },
        {
            campusCategoryId: 3,
            categoryCode: 'HS',
            categoryName: 'HIGH SCHOOL',
            cs: 31.0,
            csGrade: 'F',
            growth: 45.2,
            growthGrade: 'D',
        },
    ],
};

export const MOCK_CAMPUS_GROWTH_ROWS: CampusGrowthMetricsResponse[] = [
    { campusId: 1, campusCode: 'HMC', campusName: 'H.M. Carroll Elementary', componentScore: 32.6, growth: 57.6 },
    { campusId: 2, campusCode: 'MON', campusName: 'Monahan Elementary', componentScore: 27.3, growth: 49.3 },
    { campusId: 3, campusCode: 'NMS', campusName: 'Null Middle School', componentScore: 45.0, growth: 64.5 },
    { campusId: 4, campusCode: 'RWE', campusName: 'Royalwood Elementary', componentScore: 39.3, growth: 59.2 },
    { campusId: 5, campusCode: 'KAS', campusName: 'KASE', componentScore: 3.0, growth: 8.3 },
];

export const MOCK_CAMPUS_CATEGORY_GROWTH: CampusCategoryGrowthMetricsResponse[] = [
    { campusCategoryId: 1, campusCategoryName: 'Elementary', componentScore: 34.2, growth: 55.1 },
    { campusCategoryId: 2, campusCategoryName: 'Middle School', componentScore: 38.5, growth: 48.0 },
    { campusCategoryId: 3, campusCategoryName: 'High School', componentScore: 31.0, growth: 45.2 },
];

/** When mockBusinessApis is on, filter MOCK_CAMPUS_GROWTH_ROWS by campusCategoryId (matches MOCK_CAMPUS_GROWTH_ROWS campusIds). */
export const MOCK_CAMPUS_IDS_BY_CATEGORY: Record<number, number[]> = {
    1: [1, 2, 4],
    2: [3],
    3: [5],
};

export const MOCK_TEACHER_GROWTH: TeacherGrowthMetricsResponse[] = [
    { teacherId: 1, firstName: 'Sonia', lastName: 'Salinas', componentScore: 88, growth: 12.5 },
    { teacherId: 2, firstName: 'Gloria', lastName: 'Leal', componentScore: 85, growth: 9.0 },
    { teacherId: 3, firstName: 'Maria', lastName: 'Luna', componentScore: 82, growth: 7.1 },
];

export const MOCK_TOP_TEACHERS: (TopTeacherItemDto & { campusCategoryCode?: string })[] = [
    { rank: 1, teacherId: 1, firstName: 'Sonia', lastName: 'Salinas', teacherName: 'Sonia Salinas', subject: 'ELA', summativeScore: 96.7, campusCategoryCode: 'ES' },
    { rank: 2, teacherId: 2, firstName: 'Gloria', lastName: 'Leal', teacherName: 'Gloria Leal', subject: 'MATH', summativeScore: 93.7, campusCategoryCode: 'ES' },
    { rank: 3, teacherId: 3, firstName: 'Maria', lastName: 'Luna', teacherName: 'Maria Luna De Pacheco', subject: 'SCI', summativeScore: 91.3, campusCategoryCode: 'ES' },
    { rank: 4, teacherId: 4, firstName: 'Sheila', lastName: 'Buchanan', teacherName: 'Sheila Buchanan', subject: 'ELA', summativeScore: 90.0, campusCategoryCode: 'HS' },
    { rank: 5, teacherId: 5, firstName: 'Aaron', lastName: 'Moon', teacherName: 'Aaron Moon', subject: 'MATH', summativeScore: 88.5, campusCategoryCode: 'ES' },
];

export const MOCK_TOP_CLASSROOMS: (TeacherGrowthMetricsResponse & {
    campusCategoryCode?: string;
    campusCode?: string;
})[] = [
    { teacherId: 1, firstName: 'Sonia', lastName: 'Salinas', grade: '5', componentScore: 88, growth: 125, campusCode: 'RWE', campusCategoryCode: 'ES' },
    { teacherId: 2, firstName: 'Gloria', lastName: 'Leal', grade: '4', componentScore: 85, growth: 125, campusCode: 'HMC', campusCategoryCode: 'ES' },
    { teacherId: 3, firstName: 'Maria', lastName: 'Luna', grade: '7', componentScore: 82, growth: 115.3, campusCode: 'NMS', campusCategoryCode: 'MS' },
    { teacherId: 4, firstName: 'Sheila', lastName: 'Buchanan', grade: '9', componentScore: 80, growth: 100, campusCode: 'CKH', campusCategoryCode: 'HS' },
    { teacherId: 5, firstName: 'Aaron', lastName: 'Moon', grade: '8', componentScore: 78, growth: 100, campusCode: 'NMS', campusCategoryCode: 'MS' },
];

export const MOCK_TEACHER_STUDENT_METRICS: (TeacherStudentGrowthMetricsResponse & {
    teacherId: number;
})[] = [
    { teacherId: 1, campusName: 'Royalwood Elementary', studentName: 'Almodovar, Alexander', grade: '5', subjectCode: 'ELA', growth: 88.5, componentScore: 91.2 },
    { teacherId: 1, campusName: 'Royalwood Elementary', studentName: 'Banda, Maria', grade: '5', subjectCode: 'ELA', growth: 95.0, componentScore: 88.0 },
    { teacherId: 1, campusName: 'Royalwood Elementary', studentName: 'Chen, David', grade: '5', subjectCode: 'ELA', growth: 72.3, componentScore: 76.5 },
    { teacherId: 1, campusName: 'Royalwood Elementary', studentName: 'Aguilar, Britney', grade: '5', subjectCode: 'ELA', growth: 68.0, componentScore: 74.2 },
    { teacherId: 1, campusName: 'Royalwood Elementary', studentName: 'Flores, Christian', grade: '5', subjectCode: 'ELA', growth: 81.4, componentScore: 82.1 },
    { teacherId: 2, campusName: 'H.M. Carroll Elementary', studentName: 'Aguilar, Diego', grade: '4', subjectCode: 'MATH', growth: 79.0, componentScore: 85.0 },
    { teacherId: 2, campusName: 'H.M. Carroll Elementary', studentName: 'Aguilar, Hugo', grade: '4', subjectCode: 'MATH', growth: 66.5, componentScore: 70.3 },
    { teacherId: 2, campusName: 'H.M. Carroll Elementary', studentName: 'Acosta, Kevin', grade: '4', subjectCode: 'MATH', growth: 92.1, componentScore: 94.5 },
    { teacherId: 3, campusName: 'Null Middle School', studentName: 'Alem, Jiem', grade: '7', subjectCode: 'SCI', growth: 58.2, componentScore: 62.0 },
    { teacherId: 3, campusName: 'Null Middle School', studentName: 'Acosta, Yoana', grade: '7', subjectCode: 'SCI', growth: 64.8, componentScore: 68.4 },
];

export const MOCK_TOP_STUDENTS: (TopStudentItemDto & { campusCode?: string })[] = [
    { studentName: 'Student A', grade: '5', growth: 42.5, componentScore: 92, campusName: 'Royalwood Elementary', campusCode: 'RWE' },
    { studentName: 'Student B', grade: '5', growth: 38.0, componentScore: 89, campusName: 'Royalwood Elementary', campusCode: 'RWE' },
    { studentName: 'Student C', grade: '5', growth: 35.2, componentScore: 87, campusName: 'Royalwood Elementary', campusCode: 'RWE' },
    { studentName: 'Student D', grade: '5', growth: 33.1, componentScore: 85, campusName: 'H.M. Carroll Elementary', campusCode: 'HMC' },
    { studentName: 'Student E', grade: '5', growth: 30.0, componentScore: 84, campusName: 'H.M. Carroll Elementary', campusCode: 'HMC' },
];

export const MOCK_TEACHER_ASSESSMENT_RECORDS: TeacherAssessmentRecordResponse[] = [
    {
        evaluationId: 'EV-001',
        teacherFirstName: 'Aaron',
        teacherLastName: 'Moon',
        subjects: 'Social Studies',
        grade: '',
        appraiserFirstName: 'Elyse',
        appraiserLastName: 'Mcginnis',
        walkthrough1Score: 60,
        walkthrough2Score: 0,
        observation1Score: 70,
        summativeScore: 68,
        averageScore: 43.3,
        growth: 8.2,
        campusCode: 'HMC',
    },
    {
        evaluationId: 'EV-002',
        teacherFirstName: 'Aaron',
        teacherLastName: 'Keesee',
        subjects: 'Physical Education',
        grade: '',
        appraiserFirstName: 'Charlotte',
        appraiserLastName: 'Bennett',
        walkthrough1Score: 67,
        walkthrough2Score: 0,
        observation1Score: 65,
        summativeScore: 62,
        averageScore: 44,
        growth: 5.1,
        campusCode: 'MON',
    },
    {
        evaluationId: 'EV-003',
        teacherFirstName: 'Aceliet',
        teacherLastName: 'Barron',
        subjects: 'Arts',
        grade: '',
        appraiserFirstName: 'Kourtney',
        appraiserLastName: 'Roberts',
        walkthrough1Score: 80,
        walkthrough2Score: 60,
        observation1Score: 78,
        summativeScore: 74,
        averageScore: 72.7,
        growth: 11.4,
        campusCode: 'KMS',
    },
    {
        evaluationId: 'EV-004',
        teacherFirstName: 'Adam',
        teacherLastName: 'Stanley',
        subjects: 'Arts',
        grade: '',
        appraiserFirstName: 'Joel',
        appraiserLastName: 'Leal',
        walkthrough1Score: 80,
        walkthrough2Score: 72,
        observation1Score: 75,
        summativeScore: 73,
        averageScore: 75.7,
        growth: 9.8,
        campusCode: 'CKH',
    },
    {
        evaluationId: 'EV-005',
        teacherFirstName: 'Adan',
        teacherLastName: 'Ortega',
        subjects: 'Mathematics',
        grade: '',
        appraiserFirstName: 'Veronica',
        appraiserLastName: 'Garza',
        walkthrough1Score: 87,
        walkthrough2Score: 80,
        observation1Score: 86,
        summativeScore: 82,
        averageScore: 84.3,
        growth: 12.1,
        campusCode: 'HMC',
    },
];

export const MOCK_DISTRICT_OVERALL_PERCENTAGES: DistrictOverallPercentagesResponse = {
    ccmrRate: 30.7,
    graduationRate: 98.6,
    teachers: 49.9,
    calendarMonth: 'February',
};

export const MOCK_CCMR_MONTHLY_RATES: CcmrDistrictMonthRateDto[] = [
    { month: 'August', gradeRate: 77.7, ccmrRate: 27.9 },
    { month: 'September', gradeRate: 96.2, ccmrRate: 29.1 },
    { month: 'October', gradeRate: 95.4, ccmrRate: 30.2 },
    { month: 'November', gradeRate: 94.8, ccmrRate: 31.0 },
    { month: 'December', gradeRate: 96.1, ccmrRate: 30.5 },
    { month: 'January', gradeRate: 97.2, ccmrRate: 32.1 },
    { month: 'February', gradeRate: 98.6, ccmrRate: 30.7 },
];

export const MOCK_CCMR_ACADEMY_STATS: CcmrAcademyStatsItemDto[] = [
    { school: 'ECH', totalStudent: 412, ccmr: 27.9, gradRate: 77.7, onTrack: 38.5, likely: 44.1, notLikely: 17.4 },
    { school: 'FBL', totalStudent: 355, ccmr: 30.5, gradRate: 98.6, onTrack: 41.2, likely: 46.8, notLikely: 12.0 },
    { school: 'DID', totalStudent: 368, ccmr: 30.7, gradRate: 98.6, onTrack: 40.6, likely: 45.5, notLikely: 13.9 },
    { school: 'ACE', totalStudent: 401, ccmr: 32.9, gradRate: 96.7, onTrack: 43.9, likely: 47.0, notLikely: 9.1 },
    { school: 'KASE', totalStudent: 289, ccmr: 35.4, gradRate: 96.6, onTrack: 46.2, likely: 49.8, notLikely: 4.0 },
    { school: 'JJAEP', totalStudent: 174, ccmr: 17.3, gradRate: 91.7, onTrack: 28.4, likely: 39.6, notLikely: 32.0 },
    { school: 'MED', totalStudent: 337, ccmr: 32.1, gradRate: 97.2, onTrack: 42.3, likely: 46.4, notLikely: 11.3 },
    { school: 'PSL', totalStudent: 306, ccmr: 29.6, gradRate: 95.9, onTrack: 39.9, likely: 45.0, notLikely: 15.1 },
    { school: 'TST', totalStudent: 248, ccmr: 33.8, gradRate: 94.8, onTrack: 44.5, likely: 48.2, notLikely: 7.3 },
    { school: 'STE', totalStudent: 321, ccmr: 28.4, gradRate: 93.3, onTrack: 37.6, likely: 43.1, notLikely: 19.3 },
];

const mockGradMonths = (base: number): { calendarMonth: string; gradRate: number }[] =>
    MOCK_CCMR_MONTHLY_RATES.map((m, i) => ({
        calendarMonth: m.month ?? '—',
        gradRate: Math.min(100, base + i * 1.2),
    }));

export const MOCK_CCMR_ACADEMY_GRAD_BY_MONTH: CcmrAcademyMonthlyGradRateDto[] = [
    { school: 'ECH', months: mockGradMonths(72) },
    { school: 'FBL', months: mockGradMonths(94) },
    { school: 'DID', months: mockGradMonths(93) },
    { school: 'ACE', months: mockGradMonths(91) },
    { school: 'KASE', months: mockGradMonths(90) },
    { school: 'JJAEP', months: mockGradMonths(85) },
    { school: 'MED', months: mockGradMonths(88) },
    { school: 'PSL', months: mockGradMonths(86) },
    { school: 'TST', months: mockGradMonths(84) },
    { school: 'STE', months: mockGradMonths(82) },
];

const MOCK_CCMR_STUDENT_NAMES = [
    { firstName: 'Maria', lastName: 'Garcia' },
    { firstName: 'James', lastName: 'Wilson' },
    { firstName: 'Aisha', lastName: 'Patel' },
    { firstName: 'Carlos', lastName: 'Rivera' },
    { firstName: 'Emily', lastName: 'Chen' },
    { firstName: 'David', lastName: 'Brown' },
];

export const MOCK_CCMR_ACADEMY_RECORDS: CcmrAcademyRecordDto[] = MOCK_CCMR_ACADEMY_STATS.flatMap(
    (academy, academyIdx) =>
        MOCK_CCMR_STUDENT_NAMES.slice(0, 4).map((student, studentIdx) => ({
            ...student,
            studentId: `${10000 + academyIdx * 100 + studentIdx}`,
            school: academy.school,
            credit: 18 + studentIdx * 2 + (academyIdx % 3),
            campus: `${academy.school} Campus`,
            grade: String(9 + (studentIdx % 4)),
            planA: studentIdx % 2 === 0 ? 'CTE' : 'College Ready',
            planB: studentIdx % 3 === 0 ? 'Military' : 'Industry Cert',
            ccmrMet: studentIdx % 2 === 0,
        })),
);

/* ── Attendance analytics ───────────────────────────────────────────────────── */

const MONTHS = [
    'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March',
];

export const MOCK_MONTHLY_ATTENDANCE: MonthlyAttendanceStatDto[] = MONTHS.map((m, i) => ({
    month: m,
    averageAdaPct: 92.5 + (i % 3) * 0.4,
    estimatedMissedFinance: 12000 + i * 1500,
}));

export const MOCK_DISTRICT_ATTENDANCE_SUMMARY: DistrictAttendanceSummaryDto = {
    allAda: [90.1, 91.2, 90.5, 92.0, 91.0, 93.2, 92.8, 91.4],
    totalStudents: 12400,
    noStudentAbsents: 420,
    averageAdaPct: 92.3,
};

export const MOCK_STUDENT_QUARTER_MOBILITY: StudentQuarterMobilityResponse = {
    comparisonAvailable: true,
    totalStudents: 12400,
    previousTotalStudents: 12280,
    incomingStudents: 186,
    outgoingStudents: 66,
    retainedStudents: 12214,
    netChange: 120,
};

export const MOCK_CAMPUS_WISE_ATTENDANCE: CampusWiseAttendanceStatDto[] = [
    { campusName: 'H.M. Carroll Elementary', numberStudentAbsent: 42, averageAdaPct: 94.1, estimatedMissedFinance: 18000 },
    { campusName: 'Monahan Elementary', numberStudentAbsent: 35, averageAdaPct: 93.5, estimatedMissedFinance: 15200 },
    { campusName: 'C.E. King Middle', numberStudentAbsent: 58, averageAdaPct: 91.0, estimatedMissedFinance: 22000 },
    { campusName: 'C.E. King High', numberStudentAbsent: 64, averageAdaPct: 90.2, estimatedMissedFinance: 26500 },
    { campusName: 'ECHS', numberStudentAbsent: 157, averageAdaPct: 95.77, estimatedMissedFinance: 8635 },
    { campusName: '9K', numberStudentAbsent: 283, averageAdaPct: 91.53, estimatedMissedFinance: 15565 },
];

const MOCK_CAMPUS_ATTENDANCE_RECORDS_BY_CODE: Record<string, CampusAttendanceRecordDto[]> = {
    ECHS: [
        { campusCode: 'ECHS', campusName: 'ECHS', attendanceDate: '2025-08-12', dayOfWeek: 'Tuesday', campusAdaPct: 100, enrollment: 454, studentAbsents: 0, estimatedMissed: 0 },
        { campusCode: 'ECHS', campusName: 'ECHS', attendanceDate: '2025-08-13', dayOfWeek: 'Wednesday', campusAdaPct: 98, enrollment: 456, studentAbsents: 10, estimatedMissed: 550 },
        { campusCode: 'ECHS', campusName: 'ECHS', attendanceDate: '2025-08-14', dayOfWeek: 'Thursday', campusAdaPct: 96, enrollment: 458, studentAbsents: 13, estimatedMissed: 715 },
        { campusCode: 'ECHS', campusName: 'ECHS', attendanceDate: '2025-08-15', dayOfWeek: 'Friday', campusAdaPct: 97, enrollment: 460, studentAbsents: 11, estimatedMissed: 605 },
        { campusCode: 'ECHS', campusName: 'ECHS', attendanceDate: '2025-08-18', dayOfWeek: 'Monday', campusAdaPct: 99, enrollment: 462, studentAbsents: 5, estimatedMissed: 275 },
        { campusCode: 'ECHS', campusName: 'ECHS', attendanceDate: '2025-08-19', dayOfWeek: 'Tuesday', campusAdaPct: 95, enrollment: 464, studentAbsents: 18, estimatedMissed: 990 },
        { campusCode: 'ECHS', campusName: 'ECHS', attendanceDate: '2025-08-20', dayOfWeek: 'Wednesday', campusAdaPct: 94, enrollment: 466, studentAbsents: 22, estimatedMissed: 1210 },
    ],
};

export function mockCampusAttendanceRecordsFor(campusCode: string): CampusAttendanceRecordDto[] {
    const key = campusCode.trim().toUpperCase();
    if (MOCK_CAMPUS_ATTENDANCE_RECORDS_BY_CODE[key]) {
        return [...MOCK_CAMPUS_ATTENDANCE_RECORDS_BY_CODE[key]];
    }
    const display = campusCode.trim() || 'Campus';
    const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const rows: CampusAttendanceRecordDto[] = [];
    let enrollment = 420;
    for (let i = 0; i < 12; i++) {
        const d = new Date(2025, 7, 12 + i);
        if (d.getDay() === 0 || d.getDay() === 6) {
            continue;
        }
        const ada = 92 + (i % 5);
        const absents = Math.round(enrollment * (1 - ada / 100));
        rows.push({
            campusCode: key,
            campusName: display,
            attendanceDate: d.toISOString().slice(0, 10),
            dayOfWeek: weekdays[d.getDay() - 1] ?? 'Monday',
            campusAdaPct: ada,
            enrollment,
            studentAbsents: absents,
            estimatedMissed: absents * 55,
        });
        enrollment += 2;
    }
    return rows;
}

export const MOCK_CATEGORY_ADA: Record<string, number[]> = {
    ElementarySchool: [91, 91.2, 91, 91.5, 92, 91.8, 92, 91.4],
    MiddleSchool: [89, 89.4, 89, 90, 89.5, 90.1, 89.8, 90],
    HighSchool: [88.5, 88, 88.2, 89, 88.8, 89.2, 89, 88.6],
};

export const MOCK_LOWEST_ADA: LowestAdaCampusSnapshotDto[] = [
    { campusCode: 'MON', enrollment: 680, campusAdaPct: 87.2, noOfStudentAbsent: 56, lowestAdaDayWeekday: 'Monday' },
    { campusCode: 'KMS', enrollment: 920, campusAdaPct: 88.0, noOfStudentAbsent: 62, lowestAdaDayWeekday: 'Friday' },
    { campusCode: 'HMC', enrollment: 540, campusAdaPct: 89.1, noOfStudentAbsent: 41, lowestAdaDayWeekday: 'Tuesday' },
];

export const MOCK_INDIVIDUAL_STUDENT_STATS: IndividualStudentAttendanceStatsDto = {
    totalNumberOfStudents: 12400,
    studentsScoreRed: 12.4,
    studentsScoreYellow: 18.6,
    studentsScoreGreen: 69.0,
};

export const MOCK_INDIVIDUAL_CAMPUS_STATS: IndividualCampusAttendanceStatsDto[] = [
    {
        campusId: 1,
        campusCode: 'HMC',
        campusName: 'H.M. Carroll Elementary',
        totalNumberOfStudents: 540,
        studentsScoreRed: 8.2,
        studentsScoreYellow: 14.1,
        studentsScoreGreen: 77.7,
    },
    {
        campusId: 2,
        campusCode: 'MON',
        campusName: 'Monahan Elementary',
        totalNumberOfStudents: 680,
        studentsScoreRed: 10.5,
        studentsScoreYellow: 16.8,
        studentsScoreGreen: 72.7,
    },
    {
        campusId: 3,
        campusCode: 'KMS',
        campusName: 'C.E. King Middle',
        totalNumberOfStudents: 920,
        studentsScoreRed: 15.3,
        studentsScoreYellow: 22.4,
        studentsScoreGreen: 62.3,
    },
    {
        campusId: 4,
        campusCode: 'CKH',
        campusName: 'C.E. King High',
        totalNumberOfStudents: 1100,
        studentsScoreRed: 18.9,
        studentsScoreYellow: 24.2,
        studentsScoreGreen: 56.9,
    },
];
