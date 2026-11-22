import { Injectable, inject } from '@angular/core';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { AttendanceAnalyticsService } from '../../../core/services/attendance-analytics.service';
import { DistrictContextService } from '../../../core/services/district-context.service';
import { StudentGrowthRecordsService } from '../../../core/services/student-growth-records.service';
import { StudentStandardsService, parseStandardPercent } from '../../../core/services/student-standards.service';
import type {
    IndividualAttendanceRecordItemDto,
    StudentGrowthRecordResponse,
    StudentStandardsStudentScoreDto,
} from '../../../core/models/simplify-api.model';
import { quarterScoresFromRecord } from '../../students/utils/student-quarter-progression.util';
import type {
    ReportCardAttendance,
    ReportCardScore,
    ReportCardStandard,
    ReportCardSubjectRow,
    ReportCardTrendPoint,
    StudentReportCardData,
} from '../models/student-report-card.models';

/** The key used by the Reports feature: localId|studentName|campusCode. */
export function studentReportCardKey(localId?: string, name?: string, campusCode?: string): string {
    return `${localId || ''}|${name || ''}|${campusCode || ''}`;
}

/** Read-only loader for the printable Student Report Card. No value is invented here. */
@Injectable({ providedIn: 'root' })
export class StudentReportCardService {
    private readonly ctx = inject(DistrictContextService);
    private readonly recordsApi = inject(StudentGrowthRecordsService);
    private readonly attendanceApi = inject(AttendanceAnalyticsService);
    private readonly standardsApi = inject(StudentStandardsService);

    load(studentKey: string): Observable<StudentReportCardData | null> {
        const base = this.ctx.baseGrowthPayload();
        if (!base || !studentKey) {
            return of(null);
        }

        return this.fetchAllRecords(base.districtId, base.academicYearId, base.quarterCode).pipe(
            map((page) => ({
                page,
                student: page.records.find(
                    (r) => studentReportCardKey(r.localId, r.studentName, r.campusCode) === studentKey,
                ),
            })),
            switchMap(({ page, student }) => {
                if (!student) {
                    return of(null);
                }
                const studentRecords = page.records.filter(
                    (r) =>
                        studentReportCardKey(r.localId, r.studentName, r.campusCode) === studentKey,
                );
                const mainSubject = this.mainSubject(studentRecords);
                const subjectRecord =
                    studentRecords.find((r) => r.subjectCode === mainSubject) ?? studentRecords[0];

                return forkJoin({
                    attendance: this.loadAttendance(
                        base.districtId,
                        base.academicYearId,
                        base.quarterCode,
                        student.campusCode,
                        student.localId,
                        student.studentName,
                    ),
                    standards: this.loadStandards(
                        base.districtId,
                        base.academicYearId,
                        base.quarterCode,
                        student.campusCode,
                        student.gradeCode,
                        mainSubject,
                        student.studentName,
                    ),
                }).pipe(
                    map(({ attendance, standards }) => {
                        const district = this.ctx.districts.find(
                            (d) => d.districtId === base.districtId,
                        );
                        const year = this.ctx.academicYears.find(
                            (y) => y.academicYearId === base.academicYearId,
                        );
                        const quarter = this.ctx.districtQuarters.find(
                            (q) => q.quarterCode === base.quarterCode,
                        );
                        const campusName =
                            this.ctx.campuses.find((c) => c.campusCode === student.campusCode)
                                ?.campusName || student.campusCode || '—';
                        // Both score boxes use the portal's per-level percentages
                        // so the Change figure compares like with like.
                        const mainSubjectLabel = this.subjectLabel(mainSubject);
                        const lastStaar = this.score(
                            subjectRecord.staarPerLevel,
                            subjectRecord.staarPerLevel,
                            mainSubjectLabel,
                        );
                        const benchmark = this.score(
                            subjectRecord.quarterScore,
                            subjectRecord.quarterPerLevel,
                            mainSubjectLabel,
                        );
                        const change = this.changeText(lastStaar.score, benchmark.score);
                        const growthStatus = this.growthText(subjectRecord.growth);

                        return {
                            studentKey,
                            studentId: student.localId || '—',
                            studentName: student.studentName || '—',
                            initials: this.initials(student.studentName),
                            grade: this.gradeLabel(student.gradeCode),
                            campus: campusName,
                            homeroom: student.teacherName || '—',
                            titleLine: [
                                district?.districtName || '—',
                                year?.yearLabel || '—',
                                quarter ? this.ctx.quarterDisplayLabel(quarter) : base.quarterCode,
                            ].join(' - '),
                            details: this.details(subjectRecord),
                            lastStaar,
                            benchmark,
                            change,
                            growthStatus,
                            subjectRows: this.subjectRows(studentRecords),
                            trend: this.trend(subjectRecord, page.quarterSequence ?? []),
                            trendSubject: mainSubjectLabel,
                            standards,
                            standardsSubject: mainSubjectLabel,
                            attendance,
                            // No per-student comment is stored in the portal.
                            comment: null,
                        } as StudentReportCardData;
                    }),
                );
            }),
        );
    }

    // ── helpers ─────────────────────────────────────────────────────────────────

    private fetchAllRecords(districtId: number, academicYearId: number, quarterCode: string) {
        const pageSize = 500;
        const fetchPage = (offset: number): Observable<StudentGrowthRecordPage> =>
            this.recordsApi
                .listRecords({
                    districtId,
                    academicYearId,
                    quarterCode,
                    offset,
                    limit: pageSize,
                })
                .pipe(
                    switchMap((page) => {
                        const rows = page.records ?? [];
                        if (rows.length < pageSize || rows.length >= (page.totalCount ?? 0)) {
                            return of({ ...page, records: rows });
                        }
                        return fetchPage(offset + pageSize).pipe(
                            map((next) => ({ ...page, records: [...rows, ...next.records] })),
                        );
                    }),
                    catchError(() =>
                        of({
                            records: [],
                            totalCount: 0,
                            offset,
                            limit: pageSize,
                            quarterSequence: [],
                        } as StudentGrowthRecordPage),
                    ),
                );
        return fetchPage(0);
    }

    private mainSubject(records: StudentGrowthRecordResponse[]): string {
        const codes = records.map((r) => (r.subjectCode || '').trim().toUpperCase());
        return (
            codes.find((c) => c === 'MATH') ??
            codes.find((c) => c === 'RLA' || c === 'READ' || c === 'ELA') ??
            codes.find((c) => c === 'SCI') ??
            records[0]?.subjectCode ??
            '—'
        );
    }

    /** Subject display name from the portal's subject reference data. */
    private subjectLabel(code?: string): string {
        const key = (code || '').trim().toUpperCase();
        return (
            this.ctx.subjects.find((s) => (s.subjectCode || '').trim().toUpperCase() === key)
                ?.subjectName ||
            code ||
            '—'
        );
    }

    /** Display-only band from the stored per-level percentage; no score is recalculated. */
    private score(
        value: number | null | undefined,
        levelPct: number | null | undefined,
        subject: string,
    ): ReportCardScore {
        return {
            subject,
            score: value != null && Number.isFinite(value) ? value : null,
            band: this.band(levelPct),
        };
    }

    private band(levelPct: number | null | undefined): string | null {
        if (levelPct == null || !Number.isFinite(levelPct)) {
            return null;
        }
        if (levelPct >= 80) return 'MASTERS';
        if (levelPct >= 70) return 'MEETS';
        return 'APPROACHES';
    }

    private changeText(last: number | null, current: number | null): string {
        if (last == null || current == null || !Number.isFinite(last) || !Number.isFinite(current)) {
            return '—';
        }
        const diff = Math.round(current - last);
        return `${diff >= 0 ? '▲ +' : '▼ '}${diff}`;
    }

    private growthText(growth: number | null | undefined): string {
        if (growth == null || !Number.isFinite(growth)) {
            return '—';
        }
        if (growth > 0) return 'Exceeds expected';
        if (growth === 0) return 'Meets expected';
        return 'Below expected';
    }

    private initials(name?: string): string {
        return (name || '')
            .split(/[\s,]+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0]?.toUpperCase() ?? '')
            .join('');
    }

    private gradeLabel(code?: string): string {
        const raw = (code || '').trim();
        const n = Number(raw);
        return Number.isFinite(n) && raw ? String(n) : raw || '—';
    }

    private details(record: StudentGrowthRecordResponse) {
        const out: Array<{ label: string; value: string }> = [];
        if (record.testLang?.trim()) {
            out.push({ label: 'Test language', value: record.testLang.trim() });
        }
        const programs: string[] = [];
        if (Number(record.specialEducation) === 1) programs.push('Special Education');
        if (Number(record.economicDisadvantage) === 1) programs.push('Economically Disadvantaged');
        if (programs.length) {
            out.push({ label: 'Programs', value: programs.join(', ') });
        }
        // Ethnicity is not returned by the records API — the pair is omitted, not guessed.
        return out;
    }

    private subjectRows(records: StudentGrowthRecordResponse[]): ReportCardSubjectRow[] {
        const rows = new Map<string, ReportCardSubjectRow>();
        for (const r of records) {
            const subject = r.subjectCode || '—';
            rows.set(subject, {
                subject: this.subjectLabel(subject),
                staar: r.staarPerLevel ?? null,
                current: r.quarterScore ?? null,
                level: this.band(r.quarterPerLevel),
            });
        }
        return [...rows.values()];
    }

    private trend(record: StudentGrowthRecordResponse, sequence: string[]): ReportCardTrendPoint[] {
        const byQuarter = quarterScoresFromRecord(record);
        const ordered = sequence.length ? sequence : Object.keys(byQuarter);
        return ordered
            .filter((code) => byQuarter[code] != null && Number.isFinite(byQuarter[code]!))
            .map((code, index) => ({
                period: `P${index + 1}`,
                score: Number(byQuarter[code]),
            }));
    }

    private loadAttendance(
        districtId: number,
        academicYearId: number,
        quarterCode: string,
        campusCode: string | undefined,
        localId: string | undefined,
        studentName: string | undefined,
    ): Observable<ReportCardAttendance | null> {
        return this.attendanceApi
            .getIndividualAttendanceRecords({
                districtId,
                academicYearId,
                quarterCode,
                campusCode: campusCode?.trim() || undefined,
            })
            .pipe(
                catchError(() => of<IndividualAttendanceRecordItemDto[]>([])),
                map((rows) => {
                    const match =
                        rows.find((r) => localId && r.localId === localId) ??
                        rows.find(
                            (r) =>
                                studentName &&
                                `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() === studentName,
                        );
                    if (!match) {
                        return null;
                    }
                    const total = match.totalDaysMembership ?? null;
                    const absent = match.totalDaysAbsent ?? null;
                    const present = total != null && absent != null ? total - absent : null;
                    const pct = match.totalPia ?? null;
                    return {
                        pct,
                        daysPresent: present,
                        daysTotal: total,
                        // No tardy field is stored for students.
                        tardies: null,
                        status:
                            pct == null
                                ? null
                                : pct >= 95
                                  ? 'On track'
                                  : pct >= 90
                                    ? 'Watch'
                                    : 'At risk',
                    } as ReportCardAttendance;
                }),
            );
    }

    private loadStandards(
        districtId: number,
        academicYearId: number,
        quarterCode: string,
        campusCode: string | undefined,
        gradeCode: string | undefined,
        subjectCode: string,
        studentName: string | undefined,
    ): Observable<ReportCardStandard[]> {
        return this.standardsApi
            .getStudentScores({
                districtId,
                academicYearId,
                quarterCode,
                campusCode: campusCode || '',
                gradeCode: gradeCode || '',
                subjectCode,
            })
            .pipe(
                catchError(() => of<StudentStandardsStudentScoreDto[]>([])),
                map((rows) => {
                    const row = rows.find((r) => r.studentName === studentName);
                    if (!row) {
                        return [];
                    }
                    return Object.entries(row)
                        .filter(([code, value]) => code.includes('.') && value != null)
                        .map(([code, value]) => {
                            const pct = parseStandardPercent(String(value));
                            return {
                                code,
                                pct,
                                band: pct >= 80 ? 'Mastered' : pct >= 40 ? 'Developing' : 'Re-teach',
                            } as ReportCardStandard;
                        });
                }),
            );
    }
}

interface StudentGrowthRecordPage {
    records: StudentGrowthRecordResponse[];
    totalCount: number;
    offset: number;
    limit: number;
    quarterSequence?: string[];
}
