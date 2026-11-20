import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { DistrictContextService } from './district-context.service';
import { GrowthAnalyticsService } from './growth-analytics.service';
import { AttendanceAnalyticsService } from './attendance-analytics.service';
import { StudentMobilityService } from './student-mobility.service';
import type {
    CampusGrowthMetricsRequest,
    CampusGrowthMetricsResponse,
    CampusTeacherGrowthMetricsRequest,
    CampusTeacherStudentGrowthMetricsRequest,
    CampusWiseAttendanceStatDto,
    DistrictAttendanceSummaryDto,
    GrowthOverallMetricsResponse,
    MonthlyAttendanceStatsRequest,
    StudentQuarterMobilityResponse,
    TeacherGrowthMetricsResponse,
    TeacherStudentGrowthMetricsResponse,
} from '../models/simplify-api.model';

/** Which dashboard view the report covers, derived from the current route. */
type ReportScope = 'district' | 'campus' | 'teacher' | 'category';

interface ReportScopeInfo {
    scope: ReportScope;
    campusCode?: string;
    campusName?: string;
    campusId?: number | null;
    teacherId?: number | null;
    teacherName?: string;
    teacherGrade?: string | null;
    campusCategoryId?: number | null;
}

/** Snapshot of every section rendered into the PDF (null section = fetch failed). */
interface ReportSnapshot {
    scope: ReportScope;
    districtName: string;
    campusName: string | null;
    teacherName: string | null;
    teacherGrade: string | null;
    yearLabel: string;
    quarterCode: string | null;
    generatedAt: Date;
    overall: GrowthOverallMetricsResponse | null;
    campusGrowth: CampusGrowthMetricsResponse[];
    campusTeachers: TeacherGrowthMetricsResponse[];
    teacherStudents: TeacherStudentGrowthMetricsResponse[];
    ada: DistrictAttendanceSummaryDto | null;
    campusAda: CampusWiseAttendanceStatDto[];
    mobility: StudentQuarterMobilityResponse | null;
}

/**
 * Builds a PDF report of whatever dashboard view is currently open:
 * district home, campus drill-down, classroom (teacher) drill-down or category view —
 * using the same analytics endpoints those pages use.
 */
@Injectable({ providedIn: 'root' })
export class DashboardReportService {
    constructor(
        private router: Router,
        private districtContext: DistrictContextService,
        private growthAnalytics: GrowthAnalyticsService,
        private attendanceApi: AttendanceAnalyticsService,
        private mobilityApi: StudentMobilityService,
    ) {}

    /** Collects data for the current route + selection and saves the PDF. */
    async generateCurrentReport(): Promise<void> {
        const snapshot = await this.collect();
        await this.render(snapshot);
    }

    // ------------------------------------------------------------------ scope

    /** Resolves the report scope from the active dashboard route. */
    private resolveScope(): ReportScopeInfo {
        const path = this.router.url.split('?')[0].split('#')[0];
        const teacherMatch = path.match(/^\/dashboard\/campus\/([^/]+)\/teacher\/(\d+)/);
        if (teacherMatch) {
            const campus = this.resolveCampus(teacherMatch[1]);
            const teacherId = Number(teacherMatch[2]);
            return {
                scope: 'teacher',
                ...campus,
                campusId: campus.campusId ?? this.districtContext.selection.campusId,
                teacherId: Number.isFinite(teacherId) ? teacherId : null,
            };
        }
        const campusMatch = path.match(/^\/dashboard\/campus\/([^/]+)/);
        if (campusMatch) {
            const campus = this.resolveCampus(campusMatch[1]);
            return {
                scope: 'campus',
                ...campus,
                campusId: campus.campusId ?? this.districtContext.selection.campusId,
            };
        }
        const categoryMatch = path.match(/^\/dashboard\/campus-category\/(\d+)/);
        if (categoryMatch) {
            return { scope: 'category', campusCategoryId: Number(categoryMatch[1]) };
        }
        return { scope: 'district' };
    }

    /** Matches a route slug or code against the loaded campuses. */
    private resolveCampus(routeId: string): { campusCode?: string; campusName?: string; campusId?: number } {
        const list = this.districtContext.campuses ?? [];
        const id = routeId.toLowerCase();
        const byCode = list.find((c) => c.campusCode.toLowerCase() === id);
        if (byCode) {
            return { campusCode: byCode.campusCode, campusName: byCode.campusName, campusId: byCode.campusId };
        }
        const dashed = id.replace(/-/g, ' ');
        const byName = list.find(
            (c) =>
                c.campusName.toLowerCase() === dashed ||
                c.campusName.toLowerCase().replace(/[^a-z0-9]+/g, '-') === id,
        );
        if (byName) {
            return { campusCode: byName.campusCode, campusName: byName.campusName, campusId: byName.campusId };
        }
        return {};
    }

    // ------------------------------------------------------------------- data

    private async collect(): Promise<ReportSnapshot> {
        const selection = this.districtContext.selection;
        if (selection.districtId == null || selection.academicYearId == null) {
            throw new Error('Select a district and academic year before generating a report.');
        }
        const quarterCode = selection.quarterCode?.trim() || null;
        const scopeInfo = this.resolveScope();

        const growthBody: CampusGrowthMetricsRequest | null = quarterCode
            ? {
                  districtId: selection.districtId,
                  academicYearId: selection.academicYearId,
                  quarterCode,
                  ...this.districtContext.growthFiltersPayload(),
                  ...(scopeInfo.campusCode ? { campusCode: scopeInfo.campusCode } : {}),
                  ...(scopeInfo.scope === 'teacher' && scopeInfo.teacherId != null
                      ? { teacherId: scopeInfo.teacherId }
                      : {}),
                  ...(scopeInfo.campusCategoryId != null
                      ? { campusCategoryId: scopeInfo.campusCategoryId }
                      : {}),
              }
            : null;
        const reportCampusId = scopeInfo.campusId ?? selection.campusId;
        const attendanceBody: MonthlyAttendanceStatsRequest = {
            districtId: selection.districtId,
            academicYearId: selection.academicYearId,
            ...(reportCampusId != null ? { campusId: reportCampusId } : {}),
        };

        // Teacher/classroom reports also need the campus roster to resolve the teacher's name.
        const teacherRosterBody: CampusTeacherGrowthMetricsRequest | null =
            scopeInfo.scope === 'teacher' && scopeInfo.campusCode && quarterCode
                ? {
                      districtId: selection.districtId,
                      academicYearId: selection.academicYearId,
                      quarterCode,
                      campusCode: scopeInfo.campusCode,
                      ...this.districtContext.growthFiltersPayload(),
                  }
                : null;

        const campusTeachersBody: CampusTeacherGrowthMetricsRequest | null =
            scopeInfo.scope === 'campus' && scopeInfo.campusCode && quarterCode
                ? {
                      districtId: selection.districtId,
                      academicYearId: selection.academicYearId,
                      quarterCode,
                      campusCode: scopeInfo.campusCode,
                      ...this.districtContext.growthFiltersPayload(),
                  }
                : null;

        const teacherStudentsBody: CampusTeacherStudentGrowthMetricsRequest | null =
            scopeInfo.scope === 'teacher' && scopeInfo.campusCode && scopeInfo.teacherId != null && quarterCode
                ? {
                      districtId: selection.districtId,
                      academicYearId: selection.academicYearId,
                      quarterCode,
                      campusCode: scopeInfo.campusCode,
                      teacherId: scopeInfo.teacherId,
                      ...this.districtContext.growthFiltersPayload(),
                  }
                : null;

        const [
            overall,
            campusGrowth,
            campusTeachers,
            teacherRoster,
            teacherStudents,
            ada,
            campusAda,
            mobility,
        ] = await Promise.allSettled([
            growthBody
                ? firstValueFrom(this.growthAnalytics.getOverallGrowthMetrics(growthBody))
                : Promise.resolve(null),
            growthBody && (scopeInfo.scope === 'district' || scopeInfo.scope === 'category')
                ? firstValueFrom(this.growthAnalytics.getCampusGrowthMetrics(growthBody))
                : Promise.resolve([]),
            campusTeachersBody
                ? firstValueFrom(this.growthAnalytics.getCampusTeacherGrowthMetrics(campusTeachersBody))
                : Promise.resolve([]),
            teacherRosterBody
                ? firstValueFrom(this.growthAnalytics.getCampusTeacherGrowthMetrics(teacherRosterBody))
                : Promise.resolve([]),
            teacherStudentsBody
                ? firstValueFrom(
                      this.growthAnalytics.getCampusTeacherStudentGrowthMetrics(teacherStudentsBody),
                  )
                : Promise.resolve([]),
            firstValueFrom(this.attendanceApi.postDistrictAdaSummary(attendanceBody)),
            scopeInfo.scope === 'district'
                ? firstValueFrom(this.attendanceApi.postCampusWiseStats(attendanceBody))
                : Promise.resolve([]),
            quarterCode && (scopeInfo.scope === 'district' || scopeInfo.scope === 'campus')
                ? firstValueFrom(
                      this.mobilityApi.postQuarterComparison({
                          districtId: selection.districtId,
                          academicYearId: selection.academicYearId,
                          quarterCode,
                          ...(scopeInfo.campusCode ? { campusCode: scopeInfo.campusCode } : {}),
                      }),
                  )
                : Promise.resolve(null),
        ]);

        const value = <T>(r: PromiseSettledResult<T>, fallback: T): T =>
            r.status === 'fulfilled' && r.value != null ? r.value : fallback;

        // Resolve the classroom teacher's display name from the campus roster.
        const roster = value(teacherRoster, [] as TeacherGrowthMetricsResponse[]);
        const rosterMatch =
            scopeInfo.scope === 'teacher' && scopeInfo.teacherId != null
                ? roster.find((t) => t.teacherId === scopeInfo.teacherId)
                : undefined;

        return {
            scope: scopeInfo.scope,
            districtName:
                this.districtContext.districts.find((d) => d.districtId === selection.districtId)
                    ?.districtName || 'District',
            campusName: scopeInfo.campusName ?? null,
            teacherName: rosterMatch
                ? [rosterMatch.firstName, rosterMatch.lastName].filter(Boolean).join(' ').trim() ||
                  `Teacher ${scopeInfo.teacherId}`
                : null,
            teacherGrade: rosterMatch?.grade ?? null,
            yearLabel:
                this.districtContext.academicYears.find(
                    (y) => y.academicYearId === selection.academicYearId,
                )?.yearLabel || `Year ${selection.academicYearId}`,
            quarterCode,
            generatedAt: new Date(),
            overall: value(overall, null),
            campusGrowth: value(campusGrowth, [] as CampusGrowthMetricsResponse[]),
            campusTeachers: value(campusTeachers, [] as TeacherGrowthMetricsResponse[]),
            teacherStudents: value(teacherStudents, [] as TeacherStudentGrowthMetricsResponse[]),
            ada: value(ada, null),
            campusAda: value(campusAda, [] as CampusWiseAttendanceStatDto[]),
            mobility: value(mobility, null),
        };
    }

    // ----------------------------------------------------------------- render

    private async render(s: ReportSnapshot): Promise<void> {
        /** jsPDF loads lazily so it stays out of the initial dashboard bundle. */
        const { jsPDF } = await import('jspdf');
        const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 40;
        const tableW = pageW - margin * 2;
        let y = 0;

        const ensureSpace = (needed: number) => {
            if (y + needed > pageH - 40) {
                doc.addPage();
                y = 50;
            }
        };

        // Title + context
        y = 60;
        const scopeTitle =
            s.scope === 'campus'
                ? `Campus Report${s.campusName ? ` — ${s.campusName}` : ''}`
                : s.scope === 'teacher'
                  ? `Classroom Report${s.teacherName ? ` — ${s.teacherName}` : ''}`
                  : s.scope === 'category'
                    ? 'Category Report'
                    : 'Dashboard Report';
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(14, 23, 38);
        doc.text(scopeTitle, margin, y);
        y += 16;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(110, 118, 132);
        const contextBits = [s.districtName, s.yearLabel, ...(s.quarterCode ? [s.quarterCode] : [])];
        if (s.scope === 'campus' && s.campusName) {
            contextBits.push(s.campusName);
        }
        if (s.scope === 'teacher' && s.teacherName) {
            contextBits.push(s.teacherName);
        }
        doc.text(
            `${contextBits.join(' · ')} · Generated ${s.generatedAt.toLocaleDateString()} ${s.generatedAt.toLocaleTimeString()}`,
            margin,
            y,
        );
        y += 24;

        const sectionTitle = (label: string) => {
            ensureSpace(40);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(23, 131, 119);
            doc.text(label, margin, y);
            doc.setDrawColor(226, 232, 240);
            doc.line(margin, y + 5, margin + tableW, y + 5);
            y += 18;
        };

        const rowH = 22;
        const headerRow = (labels: string[], widths: number[]) => {
            ensureSpace(rowH);
            doc.setFillColor(100, 116, 139);
            doc.rect(margin, y, tableW, rowH, 'F');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(255, 255, 255);
            let x = margin;
            labels.forEach((label, i) => {
                doc.text(label, x + 8, y + rowH / 2 + 3);
                x += widths[i];
            });
            y += rowH;
        };

        const dataRow = (cells: string[], widths: number[], idx: number, bold = false) => {
            ensureSpace(rowH);
            if (idx % 2 === 1) {
                doc.setFillColor(246, 248, 247);
                doc.rect(margin, y, tableW, rowH, 'F');
            }
            doc.setDrawColor(226, 232, 240);
            doc.line(margin, y + rowH, margin + tableW, y + rowH);
            doc.setFont('helvetica', bold ? 'bold' : 'normal');
            doc.setFontSize(9);
            doc.setTextColor(30, 41, 59);
            let x = margin;
            cells.forEach((cell, i) => {
                const alignRight = i > 0;
                if (alignRight) {
                    doc.text(cell, x + widths[i] - 8, y + rowH / 2 + 3, { align: 'right' });
                } else {
                    doc.text(cell, x + 8, y + rowH / 2 + 3);
                }
                x += widths[i];
            });
            y += rowH;
        };

        const emptyNote = (text: string) => {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(9);
            doc.setTextColor(140, 148, 160);
            doc.text(text, margin, y);
            y += 18;
        };

        const fmt = (v: number | null | undefined, suffix = ''): string => {
            if (v == null || !Number.isFinite(Number(v))) return '—';
            return `${Number(v).toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
        };

        // 1. Overall growth KPIs (scoped to district / campus / classroom / category)
        sectionTitle(
            s.scope === 'teacher'
                ? 'Classroom Growth — Overall'
                : s.scope === 'campus'
                  ? 'Campus Growth — Overall'
                  : 'Student Growth — Overall',
        );
        if (!s.quarterCode) {
            emptyNote('No quarter selected — growth metrics not available.');
        } else if (!s.overall) {
            emptyNote('Growth metrics could not be loaded.');
        } else {
            const o = s.overall;
            const widths = [tableW * 0.34, tableW * 0.33, tableW * 0.33];
            headerRow(['Metric', 'Value', 'Grade'], widths);
            const kpis: Array<[string, number | null | undefined, string | null | undefined]> = [
                ['STAAR Component Score', o.cs, o.csGrade],
                ['Growth', o.growth, o.growthGrade],
                ['Approaches Grade Level', o.app, null],
                ['Meets Grade Level', o.meet, null],
                ['Masters Grade Level', o.master, null],
            ];
            kpis.forEach((k, idx) => dataRow([k[0], fmt(k[1], '%'), k[2] || '—'], widths, idx));
            if (o.gradesByCategory?.length && s.scope !== 'teacher' && s.scope !== 'campus') {
                y += 8;
                const cw = [tableW * 0.4, tableW * 0.3, tableW * 0.3];
                headerRow(['Category', 'Component Score', 'Growth'], cw);
                o.gradesByCategory.forEach((g, idx) =>
                    dataRow(
                        [
                            g.categoryName,
                            fmt(g.cs, `%${g.csGrade ? ` (${g.csGrade})` : ''}`),
                            fmt(g.growth, `%${g.growthGrade ? ` (${g.growthGrade})` : ''}`),
                        ],
                        cw,
                        idx,
                    ),
                );
            }
        }
        y += 14;

        // 2. Scope-specific breakdown
        if (s.scope === 'teacher') {
            // Classroom: the teacher's students
            sectionTitle('Students');
            if (s.teacherStudents.length) {
                const widths = [tableW * 0.34, tableW * 0.16, tableW * 0.16, tableW * 0.17, tableW * 0.17];
                headerRow(['Student', 'Grade', 'Subject', 'Component Score', 'Growth'], widths);
                s.teacherStudents.forEach((r, idx) =>
                    dataRow(
                        [
                            r.studentName || '—',
                            r.grade || '—',
                            r.subjectCode || '—',
                            fmt(r.componentScore, '%'),
                            fmt(r.growth, '%'),
                        ],
                        widths,
                        idx,
                    ),
                );
            } else {
                emptyNote(s.quarterCode ? 'No student data available for this classroom.' : 'No quarter selected.');
            }
        } else if (s.scope === 'campus') {
            // Campus: the campus's teachers/classrooms
            sectionTitle('Teachers / Classrooms');
            if (s.campusTeachers.length) {
                const widths = [tableW * 0.34, tableW * 0.22, tableW * 0.22, tableW * 0.22];
                headerRow(['Teacher', 'Grade', 'Component Score', 'Growth'], widths);
                s.campusTeachers.forEach((t, idx) =>
                    dataRow(
                        [
                            [t.firstName, t.lastName].filter(Boolean).join(' ').trim() ||
                                t.teacherIdExternal ||
                                `Teacher ${t.teacherId}`,
                            t.grade || '—',
                            fmt(t.componentScore, '%'),
                            fmt(t.growth, '%'),
                        ],
                        widths,
                        idx,
                    ),
                );
            } else {
                emptyNote(s.quarterCode ? 'No teacher data available for this campus.' : 'No quarter selected.');
            }
        } else {
            // District / category: all campuses
            sectionTitle('Campus Growth');
            if (s.campusGrowth.length) {
                const widths = [tableW * 0.44, tableW * 0.28, tableW * 0.28];
                headerRow(['Campus', 'Component Score', 'Growth'], widths);
                s.campusGrowth.forEach((c, idx) =>
                    dataRow(
                        [c.campusName || c.campusCode, fmt(c.componentScore, '%'), fmt(c.growth, '%')],
                        widths,
                        idx,
                    ),
                );
            } else {
                emptyNote(s.quarterCode ? 'No campus growth data available.' : 'No quarter selected.');
            }
        }
        y += 14;

        // 3. Student mobility (district + campus scopes)
        if (s.scope === 'district' || s.scope === 'campus') {
            sectionTitle('Student Mobility');
            if (s.mobility && s.quarterCode) {
                const widths = [tableW * 0.4, tableW * 0.3, tableW * 0.3];
                headerRow(['Measure', 'Current', 'Previous'], widths);
                const m = s.mobility;
                [
                    ['Total students', m.totalStudents, m.previousTotalStudents],
                    ['Incoming students', m.incomingStudents, null],
                    ['Outgoing students', m.outgoingStudents, null],
                    ['Net change', m.netChange, null],
                ].forEach((r, idx) =>
                    dataRow([String(r[0]), fmt(r[1] as number), fmt(r[2] as number)], widths, idx),
                );
            } else {
                emptyNote(s.quarterCode ? 'No mobility data available.' : 'No quarter selected.');
            }
            y += 14;
        }

        // 4. Campus attendance (all scopes; classroom shows its campus attendance)
        sectionTitle('Campus Attendance');
        if (s.ada || s.campusAda.length) {
            if (s.ada) {
                const widths = [tableW * 0.5, tableW * 0.25, tableW * 0.25];
                headerRow(
                    [s.scope === 'district' ? 'District summary' : 'Summary', 'Value', ''],
                    widths,
                );
                dataRow(['Average ADA', fmt(s.ada.averageAdaPct, '%'), ''], widths, 0, true);
                dataRow(['Total students', fmt(s.ada.totalStudents), ''], widths, 1);
            }
            if (s.campusAda.length) {
                y += 8;
                const widths = [tableW * 0.44, tableW * 0.2, tableW * 0.2, tableW * 0.16];
                headerRow(['Campus', 'Avg ADA', 'Students absent', 'Missed finance'], widths);
                s.campusAda.forEach((c, idx) =>
                    dataRow(
                        [
                            c.campusName || '—',
                            fmt(c.averageAdaPct, '%'),
                            fmt(c.numberStudentAbsent),
                            fmt(
                                c.estimatedMissedFinance != null
                                    ? Math.round(c.estimatedMissedFinance)
                                    : null,
                                '$',
                            ),
                        ],
                        widths,
                        idx,
                    ),
                );
            }
        } else {
            emptyNote('No attendance data available.');
        }
        y += 14;

        // Footer note
        ensureSpace(20);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        doc.setTextColor(140, 148, 160);
        doc.text('Values show "—" where no data is available for the selected window.', margin, y);

        const slug = (v: string) =>
            v.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'report';
        const parts: string[] = [`${s.scope}-report`];
        if (s.scope === 'campus' && s.campusName) parts.push(slug(s.campusName));
        if (s.scope === 'teacher') {
            if (s.teacherName) parts.push(slug(s.teacherName));
            if (s.campusName) parts.push(slug(s.campusName));
        }
        if (s.quarterCode) parts.push(slug(s.quarterCode));
        doc.save(`${parts.join('-')}.pdf`);
    }
}
