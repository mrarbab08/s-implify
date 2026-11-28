/** Shared API envelope from Simplify Server (Swagger). */
export interface ApiResponse<T> {
    statusCode: number;
    message: string;
    data: T;
}

export interface State {
    stateId: number;
    stateCode: string;
    stateName: string;
    isActive: boolean;
}

/** POST/PUT /api/states (Swagger: StateRequest). */
export interface StateRequest {
    stateCode: string;
    stateName: string;
    isActive?: boolean;
    createdBy?: string;
    updatedBy?: string;
}

export interface District {
    districtId: number;
    stateId: number;
    districtName: string;
    districtCode?: string;
    districtAbbreviation?: string;
    districtPhone?: string;
    districtLogo?: string;
    districtTimeZone?: string;
    isActive: boolean;
}

/** POST/PUT /api/districts (Swagger: DistrictRequest). */
export interface DistrictRequest {
    stateId: number;
    districtName: string;
    districtCode?: string;
    districtAbbreviation?: string;
    districtPhone?: string;
    districtLogo?: string;
    districtTimeZone?: string;
    isActive?: boolean;
    createdBy?: string;
    updatedBy?: string;
}

export interface AcademicYear {
    academicYearId: number;
    yearLabel: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
}

/** POST/PUT /api/academic-years (Swagger: AcademicYearRequest). */
export interface AcademicYearRequest {
    yearLabel: string;
    startDate: string;
    endDate: string;
    isActive?: boolean;
    createdBy?: string;
    updatedBy?: string;
}

export interface DistrictQuarter {
    districtQuarterId: number;
    districtId: number;
    academicYearId: number;
    quarterCode: string;
    quarterName?: string;
    startDate: string;
    endDate: string;
    sortOrder?: number;
    isActive: boolean;
    /** Single "current assessment window" flag per district + year (enforced server-side). */
    isCurrentWindow?: boolean | null;
}

/** POST/PUT /api/district-quarters (Swagger: DistrictQuarterRequest). */
export interface DistrictQuarterRequest {
    districtId: number;
    academicYearId: number;
    quarterCode: string;
    quarterName?: string;
    startDate: string;
    endDate: string;
    sortOrder?: number;
    isActive?: boolean;
    isCurrentWindow?: boolean;
    createdBy?: string;
    updatedBy?: string;
}

export interface DistrictAcademy {
    districtAcademyId: number;
    districtId: number;
    academyCode: string;
    academyName: string;
    sortOrder?: number;
    isActive: boolean;
}

/** POST/PUT /api/district-academies (Swagger: DistrictAcademyRequest). */
export interface DistrictAcademyRequest {
    districtId: number;
    academyCode: string;
    academyName: string;
    sortOrder?: number;
    isActive?: boolean;
    createdBy?: string;
    updatedBy?: string;
}

export interface Campus {
    campusId: number;
    districtId: number;
    campusCategoryId: number;
    campusCode: string;
    campusIdExternal?: string;
    campusName: string;
    campusAddress?: string | null;
    campusPhone?: string | null;
    principalName?: string | null;
    isActive: boolean;
}

export interface CampusCategory {
    campusCategoryId: number;
    categoryName: string;
    categoryCode?: string;
    isActive: boolean;
}

/** POST/PUT /api/campus-categories (Swagger: CampusCategoryRequest). */
export interface CampusCategoryRequest {
    categoryName: string;
    categoryCode?: string;
    isActive?: boolean;
    createdBy?: string;
    updatedBy?: string;
}

/** POST/PUT /api/campuses (Swagger: CampusRequest). */
export interface CampusRequest {
    districtId: number;
    campusCategoryId: number;
    campusCode: string;
    campusIdExternal?: string;
    campusName: string;
    campusAddress?: string | null;
    campusPhone?: string | null;
    principalName?: string | null;
    isActive?: boolean;
    createdBy?: string;
    updatedBy?: string;
}

export interface Grade {
    gradeId: number;
    gradeCode: string;
    gradeName?: string;
    sortOrder?: number;
    isActive: boolean;
}

/** POST/PUT /api/grades (Swagger: GradeRequest). */
export interface GradeRequest {
    gradeCode: string;
    gradeName?: string;
    sortOrder?: number;
    isActive?: boolean;
    createdBy?: string;
    updatedBy?: string;
}

export interface Subject {
    subjectId: number;
    subjectCode: string;
    subjectName: string;
    isActive: boolean;
}

/** POST/PUT /api/subjects (Swagger: SubjectRequest). */
export interface SubjectRequest {
    subjectCode: string;
    subjectName: string;
    isActive?: boolean;
    createdBy?: string;
    updatedBy?: string;
}

/** GET /api/district-subjects — subject linked to a district. */
export interface DistrictSubjectDto {
    districtSubjectId?: number;
    districtId: number;
    subjectId: number;
    subjectCode: string;
    subjectName: string;
    isActive?: boolean;
}

/** PUT /api/district-subjects/sync — replace district subject associations. */
export interface DistrictSubjectsRequest {
    districtId: number;
    subjectIds: number[];
    updatedBy?: string;
}

/** GET /api/campus-grades list item (Swagger: CampusGradeItemDto). */
export interface CampusGradeItemDto {
    campusGradeId: number;
    districtId: number;
    campusId: number;
    campusCode: string;
    campusName: string;
    gradeId: number;
    gradeCode: string;
    gradeName?: string;
    isActive: boolean;
}

/** POST/PUT /api/campus-grades (Swagger: CampusGradeRequest). */
export interface CampusGradeRequest {
    districtId: number;
    campusId: number;
    gradeId: number;
    isActive?: boolean;
    createdBy?: string;
    updatedBy?: string;
}

/** PUT /api/campus-grades/sync — replace grade associations for a campus. */
export interface CampusGradesSyncRequest {
    districtId: number;
    campusId: number;
    gradeIds: number[];
    updatedBy?: string;
}

/** Context chosen in header — drives dashboards and uploads. */
export interface DistrictContextSelection {
    stateId: number | null;
    districtId: number | null;
    campusId: number | null;
    teacherId: number | null;
    academicYearId: number | null;
    quarterCode: string | null;
}

/** Scope ids from login / switch-role `activeRole`. */
export interface ActiveRoleScope {
    roleId: number;
    stateId: number | null;
    districtId: number | null;
    campusId: number | null;
    teacherId: number | null;
}

/**
 * Optional dashboard "Search Filters" applied on top of the base district context
 * before POSTing to /api/growth/* endpoints. Shape mirrors {@link CampusGrowthMetricsRequest}
 * filter fields so it can be spread directly onto the request body.
 */
export interface GrowthFilters {
    /** Campus scope chosen in the search-filters panel (null = whole district). */
    campusId: number | null;
    grades: string[];
    subjects: string[];
    specialEducation: boolean | null;
    economicDisadvantage: boolean | null;
    emergentBilingual: string | null;
    ethnicity: string | null;
    testLanguage: string | null;
}

export const EMPTY_GROWTH_FILTERS: GrowthFilters = {
    campusId: null,
    grades: [],
    subjects: [],
    specialEducation: null,
    economicDisadvantage: null,
    emergentBilingual: null,
    ethnicity: null,
    testLanguage: null,
};

export function normalizeGrowthFilterCodes(values: string[] | null | undefined): string[] {
    if (!values?.length) {
        return [];
    }
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of values) {
        const code = raw?.trim();
        if (!code || seen.has(code)) {
            continue;
        }
        seen.add(code);
        out.push(code);
    }
    return out;
}

export function migrateGrowthFilters(
    parsed: Partial<GrowthFilters> & { grade?: string | null; subject?: string | null },
): GrowthFilters {
    const grades =
        parsed.grades != null
            ? normalizeGrowthFilterCodes(parsed.grades)
            : parsed.grade?.trim()
              ? [parsed.grade.trim()]
              : [];
    const subjects =
        parsed.subjects != null
            ? normalizeGrowthFilterCodes(parsed.subjects)
            : parsed.subject?.trim()
              ? [parsed.subject.trim()]
              : [];
    return {
        campusId: parsed.campusId ?? null,
        grades,
        subjects,
        specialEducation: parsed.specialEducation ?? null,
        economicDisadvantage: parsed.economicDisadvantage ?? null,
        emergentBilingual: parsed.emergentBilingual ?? null,
        ethnicity: parsed.ethnicity ?? null,
        testLanguage: parsed.testLanguage ?? null,
    };
}

export function areGrowthFiltersEqual(a: GrowthFilters, b: GrowthFilters): boolean {
    const sameCodes = (left: string[], right: string[]) =>
        left.length === right.length && left.every((value, index) => value === right[index]);
    return (
        sameCodes(a.grades, b.grades) &&
        sameCodes(a.subjects, b.subjects) &&
        a.campusId === b.campusId &&
        a.specialEducation === b.specialEducation &&
        a.economicDisadvantage === b.economicDisadvantage &&
        a.emergentBilingual === b.emergentBilingual &&
        a.ethnicity === b.ethnicity &&
        a.testLanguage === b.testLanguage
    );
}

/** POST /api/growth/* shared body (campus-metrics, campus-category-metrics, overall-metrics). */
export interface CampusGrowthMetricsRequest {
    districtId: number;
    academicYearId: number;
    quarterCode: string;
    grade?: string[];
    subject?: string[];
    specialEducation?: boolean;
    economicDisadvantage?: boolean;
    emergentBilingual?: string;
    ethnicity?: string;
    testLanguage?: string;
    campusCategoryId?: number;
    campusCode?: string;
    teacherId?: number;
}

/** @deprecated Use {@link CampusGrowthMetricsRequest} — same shape for overall-metrics. */
export type GrowthOverallMetricsRequest = CampusGrowthMetricsRequest;

export interface CampusTeacherGrowthMetricsRequest {
    districtId: number;
    academicYearId: number;
    quarterCode: string;
    campusCode: string;
    grade?: string[];
    subject?: string[];
    specialEducation?: boolean;
    economicDisadvantage?: boolean;
    emergentBilingual?: string;
    ethnicity?: string;
    testLanguage?: string;
}

/** One campus-category row inside POST /growth/overall-metrics `gradesByCategory`. */
export interface GrowthOverallGradeByCategory {
    campusCategoryId: number;
    categoryCode: string;
    categoryName: string;
    cs: number;
    csGrade: string | null;
    growth: number;
    growthGrade: string | null;
}

export interface GrowthOverallMetricsResponse {
    app: number;
    meet: number;
    master: number;
    cs: number;
    growth: number;
    /** District-level letter grade when provided (often null; use gradesByCategory). */
    csGrade?: string | null;
    growthGrade?: string | null;
    /** Category-wise CS / Growth letter grades (ES / MS / HS, etc.). */
    gradesByCategory?: GrowthOverallGradeByCategory[];
}

export interface CampusGrowthMetricsResponse {
    campusId: number;
    campusCode: string;
    campusName: string;
    /** Null when the backend has no score for this campus in the selected window. */
    componentScore: number | null;
    growth: number | null;
}

export interface CampusCategoryGrowthMetricsResponse {
    campusCategoryId: number;
    campusCategoryName: string;
    componentScore: number | null;
    growth: number | null;
}

export interface TeacherGrowthMetricsResponse {
    teacherId: number;
    teacherIdExternal?: string;
    firstName?: string;
    lastName?: string;
    /** Grade label/code from POST /api/growth/top-classrooms. */
    grade?: string | null;
    componentScore: number;
    growth: number;
    /** Mean of this classroom's student-level STAAR Approaches share (0–100); null when not derivable. */
    app?: number | null;
    /** Mean of this classroom's student-level STAAR Meets share (0–100); null when not derivable. */
    meet?: number | null;
    /** Mean of this classroom's student-level STAAR Masters share (0–100); null when not derivable. */
    master?: number | null;
}

/** POST /api/growth/campus-teacher-student-metrics (Swagger: CampusTeacherStudentGrowthMetricsRequest). */
export interface CampusTeacherStudentGrowthMetricsRequest {
    districtId: number;
    academicYearId: number;
    quarterCode: string;
    campusCode: string;
    teacherId: number;
    grade?: string[];
    subject?: string[];
    specialEducation?: boolean;
    economicDisadvantage?: boolean;
    emergentBilingual?: string;
    ethnicity?: string;
    testLanguage?: string;
}

/** POST /api/growth/campus-teacher-student-metrics response row. */
export interface TeacherStudentGrowthMetricsResponse {
    campusName?: string;
    studentName?: string;
    grade?: string;
    subjectCode?: string;
    growth?: number | null;
    componentScore?: number | null;
}

/** POST /api/teachers/top (Swagger: TopTeachersRequest). */
export interface TopTeachersRequest {
    districtId: number;
    academicYearId: number;
    campusCategoryCode?: string;
    gradeCode?: string[];
    subjectCode?: string[];
    top?: number;
}

/** POST /api/teachers/top response row (Swagger: TopTeacherItemDto). */
export interface TopTeacherItemDto {
    rank?: number;
    teacherId?: number;
    teacherIdExternal?: string;
    firstName?: string;
    lastName?: string;
    teacherName?: string;
    /** Subject label/code from POST /api/teachers/top. */
    subject?: string | null;
    summativeScore?: number | null;
}

/** GET /api/teachers/by-campus response row (Swagger: TeacherSummaryDto). */
export interface TeacherSummaryDto {
    teacherId?: number | string | null;
    teacherIdExternal?: string | null;
    teacherName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    /** Teacher's grade name (left-joined in the backend, for the assessment summary card). */
    grade?: string | null;
    /** Teacher's subject name (left-joined in the backend). */
    subject?: string | null;
}

/** POST /api/teachers/by-scope request body. */
export interface TeachersByScopeRequest {
    districtId: number;
    academicYearId: number;
    campusCode: string;
    quarterCode?: string | null;
    gradeCode?: string | null;
    subjectCode?: string | null;
}

/** POST /api/growth/top-classrooms (Swagger: TopClassroomsRequest). */
export interface TopClassroomsRequest {
    districtId: number;
    academicYearId: number;
    quarterCode: string;
    campusCategoryCode?: string;
    campusCode?: string;
    gradeCode?: string[];
    subjectCode?: string[];
    specialEducation?: boolean;
    economicDisadvantage?: boolean;
    emergentBilingual?: string;
    ethnicity?: string;
    testLanguage?: string;
    top?: number;
}

/** POST /api/growth/top-students (Swagger: TopStudentsRequest). */
export interface TopStudentsRequest {
    districtId: number;
    academicYearId: number;
    quarterCode: string;
    campusCode: string;
    gradeCode?: string[];
    subjectCode?: string[];
    specialEducation?: boolean;
    economicDisadvantage?: boolean;
    emergentBilingual?: string;
    ethnicity?: string;
    testLanguage?: string;
    top?: number;
}

/** POST /api/growth/top-students response row (Swagger: TopStudentItemDto). */
export interface TopStudentItemDto {
    campusName?: string;
    studentName?: string;
    grade?: string;
    growth?: number | null;
    componentScore?: number | null;
}

/** ── Campus attendance analytics ───────────────────────────────────────────── */

export interface MonthlyAttendanceStatsRequest {
    districtId: number;
    academicYearId: number;
    /** When set (e.g. Principal role), limits analytics to one campus. */
    campusId?: number;
}

/** POST /api/individual-attendance/student-stats* — district + campus rollups by quarter. */
export interface IndividualAttendanceStatsRequest {
    districtId: number;
    academicYearId: number;
    quarterCode: string;
    /** When set (e.g. Principal role), limits rollups to one campus. */
    campusId?: number;
}

export interface MonthlyAttendanceStatDto {
    month?: string;
    estimatedMissedFinance?: number;
    averageAdaPct?: number;
}

export interface DistrictAttendanceSummaryDto {
    allAda?: number[];
    totalStudents?: number;
    noStudentAbsents?: number;
    averageAdaPct?: number;
}

export interface CampusWiseAttendanceStatDto {
    numberStudentAbsent?: number;
    campusName?: string;
    estimatedMissedFinance?: number;
    averageAdaPct?: number;
}

/** POST /api/individual-attendance/student-stats — district rollup. */
export interface IndividualStudentAttendanceStatsDto {
    totalNumberOfStudents?: number;
    studentsScoreRed?: number;
    studentsScoreYellow?: number;
    studentsScoreGreen?: number;
}

/** POST /api/individual-attendance/student-stats/by-campus — per campus. */
export interface IndividualCampusAttendanceStatsDto {
    campusId?: number;
    campusCode?: string;
    campusName?: string;
    totalNumberOfStudents?: number;
    studentsScoreRed?: number;
    studentsScoreYellow?: number;
    studentsScoreGreen?: number;
}

export interface LowestAdaThreeDaysRequest {
    districtId: number;
    academicYearId: number;
    month: string;
    campusCode?: string;
    campusId?: number;
}

export interface LowestAdaCampusSnapshotDto {
    campusCode?: string;
    enrollment?: number;
    campusAdaPct?: number;
    noOfStudentAbsent?: number;
    lowestAdaDayWeekday?: string;
}

/** Query params for GET /api/campus-attendance/records — daily rows for one campus. */
export interface CampusAttendanceRecordsRequest {
    districtId: number;
    academicYearId: number;
    campusCode: string;
}

/** Raw item from GET /api/campus-attendance/records (Swagger: CampusDailyAttendanceItemDto). */
export interface CampusDailyAttendanceItemDto {
    attendanceDate?: string;
    campusAda?: number;
    enrollment?: number;
    absentCount?: number;
    estimatedMissed?: number;
    absGoal?: number;
    studentsAbsent?: number;
}

/** Normalized daily attendance row used by the Attendance Records modal. */
export interface CampusAttendanceRecordDto {
    campusName?: string;
    campusCode?: string;
    attendanceDate?: string;
    dayOfWeek?: string;
    campusAdaPct?: number;
    enrollment?: number;
    studentAbsents?: number;
    estimatedMissed?: number;
    absGoal?: number;
}

/** Query params for GET /api/individual-attendance/records. piaMin/piaMax filter TotalPIA inclusively. */
export interface IndividualAttendanceRecordsRequest {
    districtId: number;
    academicYearId: number;
    quarterCode: string;
    campusCode?: string;
    piaMin?: number;
    piaMax?: number;
}

/** Item from GET /api/individual-attendance/records (Swagger: IndividualAttendanceRecordItemDto). */
export interface IndividualAttendanceRecordItemDto {
    localId?: string;
    firstName?: string;
    lastName?: string;
    totalDaysMembership?: number;
    totalDaysAbsent?: number;
    totalPia?: number;
}

/** ── File uploads ─────────────────────────────────────────────────────────── */

export interface GrowthSheetUploadResponse {
    growthSheetUploadId?: number;
    districtId?: number;
    academicYearId?: number;
    quarterCode?: string;
    fileName?: string;
    uploadedAt?: string;
    uploadedBy?: string;
    recordCount?: number;
    skippedCount?: number;
    updatedCount?: number;
    status?: string;
    errorMessage?: string;
}

export interface RawscoresUploadResponse {
    rawscoresUploadId?: number;
    districtId?: number;
    academicYearId?: number;
    fileName?: string;
    uploadedAt?: string;
    uploadedBy?: string;
    recordCount?: number;
    skippedRowCount?: number;
    updatedRowCount?: number;
    status?: string;
    errorMessage?: string;
}

export interface CampusAttendanceUploadResponse {
    campusAttendanceUploadId?: number;
    districtId?: number;
    academicYearId?: number;
    districtGoal?: number;
    estimatedDollarsPerStudent?: string;
    fileName?: string;
    uploadedAt?: string;
    uploadedBy?: string;
    recordCount?: number;
    status?: string;
    errorMessage?: string;
    sheetMessages?: string[];
}

/** Metadata row for POST /api/rawscores-uploads (creates metadata only). */
export interface RawscoresUploadRequest {
    districtId: number;
    academicYearId: number;
    fileName?: string;
    uploadedBy?: string;
}

/** Full API envelope preserved after multipart uploads (for toast copy). */
export interface UploadApiResult<T> {
    data: T;
    message?: string;
    statusCode?: number;
}

export interface RawscoresUploadListItem {
    rawscoresUploadId?: number;
    districtId?: number;
    academicYearId?: number;
    fileName?: string;
    uploadedAt?: string;
    uploadedBy?: string;
    recordCount?: number;
    skippedRowCount?: number;
    updatedRowCount?: number;
    status?: string;
    errorMessage?: string;
}

/** GET /api/teacher-assessment/records — single evaluation row. */
export interface TeacherAssessmentRecordResponse {
    teacherAssessmentRecordId?: number;
    teacherAssessmentUploadId?: number;
    districtId?: number;
    academicYearId?: number;
    evaluationId?: string;
    teacherIdExternal?: string;
    teacherFirstName?: string;
    teacherLastName?: string;
    subjects?: string;
    grade?: string;
    evaluationDate?: string;
    appraiserFirstName?: string;
    appraiserLastName?: string;
    appraiserTitle?: string;
    campusCode?: string;
    walkthrough1Score?: number | null;
    walkthrough2Score?: number | null;
    walkthrough3Score?: number | null;
    walkthrough4Score?: number | null;
    observation1Score?: number | null;
    observation2Score?: number | null;
    summativeScore?: number | null;
    averageScore?: number | null;
    growth?: number | null;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    updatedBy?: string;
}

/** GET /api/teacher-assessment/records — paginated envelope (data). */
export interface TeacherAssessmentRecordPageResponse {
    records: TeacherAssessmentRecordResponse[];
    totalCount: number;
    offset: number;
    limit: number;
    growthQuarterCode?: string;
}

export interface TeacherAssessmentRecordsQuery {
    districtId: number;
    academicYearId: number;
    offset: number;
    limit: number;
    gradeCode?: string | null;
    subjectCode?: string | null;
    averageScoreMin?: number | null;
    averageScoreMax?: number | null;
}

/** GET /api/ttess-rubric — one rubric question/dimension for a district. */
export interface TtessRubricQuestion {
    ttessQuestionId: number;
    districtId: number;
    ttessDomainId: number;
    domainNumber: number;
    questionCode: string;
    questionText: string;
    sortOrder: number;
    isActive: boolean;
}

/** GET /api/ttess-rubric — one T-TESS domain with its nested questions. */
export interface TtessRubricDomain {
    ttessDomainId: number;
    districtId: number;
    domainNumber: number;
    domainName: string;
    sortOrder: number;
    isActive: boolean;
    questions: TtessRubricQuestion[];
}

/** GET /api/ttess-rubric — one answer option (rating scale level). */
export interface TtessRubricOption {
    ttessOptionId: number;
    districtId: number;
    optionLabel: string;
    pointValue: number;
    sortOrder: number;
    isActive: boolean;
}

/** GET /api/ttess-rubric response (domains + rating scale for one district). */
export interface TtessRubric {
    districtId: number;
    domains: TtessRubricDomain[];
    options: TtessRubricOption[];
}

/** Rating sent for one rubric question in TtessNewAssessmentPayload.ratings. */
export interface TtessRubricRatingInput {
    questionId: number;
    points: number;
}

/** Payload for POST /api/teacher-assessment/ttess (16 dimension ratings, keys rating1_1…rating4_4). */
export interface TtessNewAssessmentPayload {
    districtId: number;
    academicYearId: number;
    teacherId: number;
    observationDate: string;
    observationType: string;
    evaluatorName: string;
    /** Rubric-driven ratings (questionId → selected point value) — the authoritative input. */
    ratings?: TtessRubricRatingInput[];
    rating1_1?: number;
    rating1_2?: number;
    rating1_3?: number;
    rating1_4?: number;
    rating2_1?: number;
    rating2_2?: number;
    rating2_3?: number;
    rating2_4?: number;
    rating2_5?: number;
    rating3_1?: number;
    rating3_2?: number;
    rating3_3?: number;
    rating4_1?: number;
    rating4_2?: number;
    rating4_3?: number;
    rating4_4?: number;
    commentDomain1?: string | null;
    commentDomain2?: string | null;
    commentDomain3?: string | null;
    commentDomain4?: string | null;
    overallComment?: string | null;
    createdBy?: string;
}

/** POST /api/teacher-assessment/ttess response (saved assessment summary). */
export interface TtessSavedAssessmentResponse {
    ttessAssessmentId: number;
    teacherAssessmentRecordId: number;
    teacherId: number;
    teacherIdExternal?: string | null;
    teacherName: string;
    campusCode?: string | null;
    observationDate?: string | null;
    observationType?: string | null;
    evaluatorName?: string | null;
    averageScore: number;
    band: string;
    growth?: number | null;
}

/** GET /api/teacher-assessment/ttess/stats — aggregated T-TESS stats for the dashboard card/popup. */
export interface TtessStatsGroupAverage {
    label: string;
    avg: number | null;
    count: number;
}

export interface TtessRecentAssessment {
    teacherName: string;
    campus: string;
    grade: string;
    subject: string;
    score: number | null;
    band: string | null;
    growth: number | null;
    date: string | null;
}

export interface TtessDashboardStats {
    districtId: number | null;
    academicYearId: number | null;
    campusCode: string | null;
    assessmentsCount: number;
    teachersAssessed: number;
    scoredTeachers: number;
    averageScore: number | null;
    averageGrowth: number | null;
    proficientPct: number | null;
    bands: { needsImprovement: number; progressing: number; proficient: number };
    byGrade: TtessStatsGroupAverage[];
    byCampus: TtessStatsGroupAverage[];
    recent: TtessRecentAssessment[];
}

/** GET /api/teacher-assessment/ttess/teacher-latest response (or null when the teacher has none). */
export interface TtessTeacherLatestResponse {
    averageScore: number;
    evaluationDate?: string | null;
    observationType?: string | null;
    band: string;
}

/** Quarter-to-quarter score step on GET /api/student-growth-records rows. */
export interface StudentGrowthQuarterScoreProgression {
    earlierQuarterCode?: string;
    earlierQuarterScore?: number | null;
    laterQuarterCode?: string;
    laterQuarterScore?: number | null;
}

/** GET /api/student-growth-records — single student growth row. */
export interface StudentGrowthRecordResponse {
    studentGrowthRecordId?: number;
    growthSheetUploadId?: number;
    districtId?: number;
    academicYearId?: number;
    quarterCode?: string;
    localId?: string;
    studentName?: string;
    campusCode?: string;
    gradeCode?: string;
    subjectCode?: string;
    teacherId?: string;
    teacherName?: string;
    testLang?: string;
    staar?: number | null;
    staarPerLevel?: number | null;
    quarterScore?: number | null;
    quarterPerLevel?: number | null;
    cs?: number | null;
    delta?: number | null;
    growth?: number | null;
    app?: number | null;
    meets?: number | null;
    masters?: number | null;
    totalGrowthForQuarter?: number | null;
    specialEducation?: number | null;
    economicDisadvantage?: number | null;
    hb1416?: number | null;
    hb1416Delta?: number | null;
    quarterScoreProgression?: StudentGrowthQuarterScoreProgression[];
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string | null;
    updatedBy?: string | null;
}

/** GET /api/student-growth-records — paginated envelope (data). */
export interface StudentGrowthRecordPageResponse {
    records: StudentGrowthRecordResponse[];
    totalCount: number;
    offset: number;
    limit: number;
    districtId?: number;
    academicYearId?: number;
    quarterCode?: string;
    quarterSequence?: string[];
}

export interface StudentGrowthRecordsQuery {
    districtId: number;
    academicYearId: number;
    quarterCode: string;
    offset: number;
    limit: number;
    campusCode?: string | null;
    gradeCode?: string | null;
    subjectCode?: string | null;
    teacherId?: string | null;
    specialEducation?: boolean | null;
    economicDisadvantage?: boolean | null;
    emergentBilingual?: string | null;
    testLanguage?: string | null;
    ethnicity?: string | null;
}

/** POST /api/student-growth-records/by-teacher */
export interface StudentGrowthRecordsByTeacherRequest {
    districtId: number;
    academicYearId: number;
    quarterCode: string;
    campusCode: string;
    teacherId: number;
    gradeCode?: string[];
    subjectCode?: string[];
    specialEducation?: boolean;
    economicDisadvantage?: boolean;
    emergentBilingual?: string;
    ethnicity?: string;
    testLanguage?: string;
}

/** Credit buckets for CCMR stats POST bodies (district-configurable in UI later). */
export interface CcmrCreditThresholds {
    notLikelyCredits: number;
    onTrackCredits: number;
    likelyCreditsMin: number;
    likelyCreditsMax: number;
}

export const CCMR_DEFAULT_CREDIT_THRESHOLDS: CcmrCreditThresholds = {
    notLikelyCredits: 22,
    onTrackCredits: 26,
    likelyCreditsMin: 22,
    likelyCreditsMax: 25,
};

export interface CcmrDistrictMonthlyRatesRequest {
    districtId: number;
    academicYearId: number;
    notLikelyCredits: number;
    calendarMonth?: string;
}

export interface CcmrDistrictMonthRateDto {
    gradeRate?: number;
    month?: string;
    ccmrRate?: number;
}

/** POST /api/dashboard/overall-percentages */
export interface DistrictOverallPercentagesRequest {
    districtId: number;
    academicYearId: number;
    notLikelyCredits: number;
    calendarMonth?: string;
}

export interface DistrictOverallPercentagesResponse {
    ccmrRate?: number;
    graduationRate?: number;
    /** District average T-TESS AverageScore (0–100). */
    teachers?: number;
    calendarMonth?: string;
}

export interface CcmrAcademyStatsRequest extends CcmrCreditThresholds {
    districtId: number;
    academicYearId: number;
    calendarMonth: string;
}

export interface CcmrAcademyStatsItemDto {
    school?: string;
    totalStudent?: number;
    gradRate?: number;
    ccmr?: number;
    onTrack?: number;
    likely?: number;
    notLikely?: number;
}

export interface CcmrAcademyMonthlyGradRateRequest extends CcmrCreditThresholds {
    districtId: number;
    academicYearId: number;
}

export interface CcmrAcademyMonthGradRateDto {
    calendarMonth?: string;
    gradRate?: number;
}

export interface CcmrAcademyMonthlyGradRateDto {
    school?: string;
    months?: CcmrAcademyMonthGradRateDto[];
}

/** Query params for GET /api/ccmr/records — student rows for a month (optional academy). */
export interface CcmrAcademyRecordsRequest {
    districtId: number;
    academicYearId: number;
    /** Worksheet tab name, e.g. "January". */
    calendarMonth: string;
    /** When omitted, returns records for all academies in that month. */
    academyCode?: string;
}

/** Raw item from GET /api/ccmr/records (Swagger: CCMRRecordItemDto). */
export interface CcmrRecordItemDto {
    academyCode?: string;
    firstName?: string;
    lastName?: string;
    localId?: string;
    campusCode?: string;
    campusName?: string;
    gradeCode?: string;
    dateEntered?: string;
    credits?: number;
    ccmrMet?: boolean;
    planA?: string;
    planB?: string;
}

/** Normalized student row used by the Academy Records modal. */
export interface CcmrAcademyRecordDto {
    firstName?: string;
    lastName?: string;
    studentId?: string;
    school?: string;
    credit?: number;
    campus?: string;
    grade?: string;
    planA?: string;
    planB?: string;
    ccmrMet?: boolean | string;
}

export interface CcmrSheetUploadResponse {
    ccmrSheetUploadId?: number;
    districtId?: number;
    academicYearId?: number;
    fileName?: string;
    uploadedAt?: string;
    uploadedBy?: string;
    recordCount?: number;
    skippedCount?: number;
    insertedCount?: number;
    updatedCount?: number;
    status?: string;
    errorMessage?: string;
}

/** POST /api/teacher-assessment/upload */
export interface TeacherAssessmentUploadResponse {
    teacherAssessmentUploadId?: number;
    districtId?: number;
    academicYearId?: number;
    scoreMultiplier?: number;
    fileName?: string;
    uploadedAt?: string;
    uploadedBy?: string;
    recordCount?: number;
    skippedCount?: number;
    insertedCount?: number;
    updatedCount?: number;
    status?: string;
    errorMessage?: string;
}

/** POST /api/student-standards/upload */
export interface StudentStandardsUploadResponse {
    studentStandardsUploadId?: number;
    districtId?: number;
    academicYearId?: number;
    quarterCode?: string;
    fileName?: string;
    uploadedAt?: string;
    uploadedBy?: string;
    recordCount?: number;
    skippedCount?: number;
    insertedCount?: number;
    updatedCount?: number;
    status?: string;
    errorMessage?: string;
}

/** POST /api/individual-attendance/upload */
export interface IndividualAttendanceUploadResponse {
    individualAttendanceUploadId?: number;
    districtId?: number;
    academicYearId?: number;
    quarterCode?: string;
    fileName?: string;
    uploadedAt?: string;
    uploadedBy?: string;
    recordCount?: number;
    skippedCount?: number;
    insertedCount?: number;
    updatedCount?: number;
    status?: string;
    errorMessage?: string;
}

/** ── Student standards ─────────────────────────────────────────────────────── */

/** POST /api/student-standards/standard-averages (Swagger: StudentStandardsAverageRequest). */
export interface StudentStandardsAverageRequest {
    districtId: number;
    academicYearId: number;
    quarterCode: string;
    campusCode: string;
    gradeCode: string;
    subjectCode: string;
    teacherId?: number;
}

export interface StudentStandardsAverageItemDto {
    standardCode: string;
    average: number;
}

/** POST /api/student-standards/student-scores (Swagger: StudentStandardsStudentScoresRequest). */
export interface StudentStandardsStudentScoresRequest {
    districtId: number;
    academicYearId: number;
    quarterCode: string;
    campusCode: string;
    gradeCode: string;
    subjectCode: string;
    /** Optional dbo.Teachers.TeacherId — limits to that teacher's students. */
    teacherId?: number;
}

export interface StudentStandardsStudentScoreDto {
    studentName: string;
    score: number;
    standardProperties?: Record<string, string>;
    [standardCode: string]: string | number | Record<string, string> | undefined;
}

// ── Roles (Swagger: RoleDto) ──────────────────────────────────────────────────

export interface RoleDto {
    roleId: number;
    roleName: string;
    roleDescription?: string | null;
    isActive?: boolean | null;
}

// ── Authentication (Swagger: AuthResponse, AuthRoleItemDto) ───────────────────

export interface AuthRoleItemDto {
    userRoleAssignmentId: number;
    roleId: number;
    roleName: string;
    stateId?: number | null;
    districtId?: number | null;
    campusId?: number | null;
    teacherId?: number | null;
    roleDescription?: string | null;
    ttessAccess?: boolean | null;
}

/** Raw login / switch-role / register payload from the API. */
export interface AuthResponseDto {
    userId: number;
    email: string;
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    token: string;
    activeRole?: AuthRoleItemDto | null;
    roles?: AuthRoleItemDto[] | null;
}

// ── Users (Swagger: UserRequest, UserItemDto) ─────────────────────────────────

export interface UserRoleAssignmentRequest {
    roleId: number;
    stateId?: number | null;
    districtId?: number | null;
    campusId?: number | null;
    teacherId?: number | null;
    isActive?: boolean;
    roleDescription?: string | null;
    ttessAccess?: boolean | null;
}

export interface UserRoleAssignmentItemDto extends UserRoleAssignmentRequest {
    userRoleAssignmentId: number;
    roleName?: string | null;
    createdAt?: string | null;
    updatedAt?: string | null;
}

export interface UserRequest {
    email: string;
    password?: string | null;
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    isActive: boolean;
    roleAssignments?: UserRoleAssignmentRequest[] | null;
    createdBy?: string | null;
    updatedBy?: string | null;
}

export interface UserItemDto {
    userId: number;
    email: string;
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    isActive: boolean;
    createdAt?: string | null;
    updatedAt?: string | null;
    createdBy?: string | null;
    updatedBy?: string | null;
    roleAssignments?: UserRoleAssignmentItemDto[] | null;
}

// ── Student mobility (Swagger: StudentQuarterMobilityRequest / Response) ───────

/** POST /api/student-mobility/quarter-comparison */
export interface StudentQuarterMobilityRequest {
    districtId: number;
    academicYearId: number;
    quarterCode: string;
    campusCode?: string;
}

/** POST /api/student-mobility/quarter-comparison response data. */
export interface StudentQuarterMobilityResponse {
    districtId?: number;
    academicYearId?: number;
    campusCode?: string | null;
    currentQuarterCode?: string | null;
    previousQuarterCode?: string | null;
    comparisonAvailable?: boolean;
    totalStudents?: number;
    previousTotalStudents?: number;
    incomingStudents?: number;
    outgoingStudents?: number;
    retainedStudents?: number;
    netChange?: number;
}
