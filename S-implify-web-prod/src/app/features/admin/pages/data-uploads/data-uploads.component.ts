import { CommonModule } from '@angular/common';
import {
    ChangeDetectorRef,
    Component,
    DestroyRef,
    ElementRef,
    OnInit,
    ViewChild,
} from '@angular/core';
import { NgxCustomModalComponent } from 'ngx-custom-modal';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { distinctUntilChanged, finalize } from 'rxjs/operators';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import Swal from 'sweetalert2';
import { DistrictContextService } from '../../../../core/services/district-context.service';
import { SimplifyUploadsService } from '../../../../core/services/simplify-uploads.service';
import { AuthService } from '../../../../core/services/auth.service';
import type {
    CampusAttendanceUploadResponse,
    CcmrSheetUploadResponse,
    GrowthSheetUploadResponse,
    IndividualAttendanceUploadResponse,
    RawscoresUploadListItem,
    StudentStandardsUploadResponse,
    TeacherAssessmentUploadResponse,
    UploadApiResult,
} from '../../../../core/models/simplify-api.model';
import { SharedModule } from '../../../../shared/shared.module';

type UploadTab =
    | 'rawscores'
    | 'growth'
    | 'attendance'
    | 't-tess'
    | 'student-standards'
    | 'individual-attendance'
    | 'ccmr';

interface UploadResultFields {
    fileName?: string;
    recordCount?: number | null;
    skippedCount?: number | null;
    skippedRowCount?: number | null;
    insertedCount?: number | null;
    updatedCount?: number | null;
    updatedRowCount?: number | null;
    status?: string;
    errorMessage?: string | unknown;
    sheetMessages?: string[];
}

type UploadErrorRow = Record<string, string | number>;

@Component({
    selector: 'app-data-uploads',
    templateUrl: './data-uploads.component.html',
    standalone: true,
    imports: [CommonModule, FormsModule, SharedModule],
})
export class DataUploadsComponent implements OnInit {
    @ViewChild('attendanceFileInput') attendanceFileInput?: ElementRef<HTMLInputElement>;
    @ViewChild('uploadErrorModal') uploadErrorModal?: NgxCustomModalComponent;

    activeTab: UploadTab = 'rawscores';

    growthFile: File | null = null;
    rawscoresFile: File | null = null;
    attendanceFile: File | null = null;
    tTessFile: File | null = null;
    /** Walkthrough/Observation score multiplier sent with the T-TESS upload (backend default 20). */
    tTessScoreMultiplier = 20;
    standardsFile: File | null = null;
    individualFile: File | null = null;
    ccmrFile: File | null = null;

    growthBusy = false;
    rawscoresBusy = false;
    attendanceBusy = false;
    tTessBusy = false;
    standardsBusy = false;
    individualBusy = false;
    ccmrBusy = false;

    growthMsg = '';
    rawscoresMsg = '';
    attendanceMsg = '';
    tTessMsg = '';
    standardsMsg = '';
    individualMsg = '';
    ccmrMsg = '';

    rawscoresHistory: RawscoresUploadListItem[] = [];
    growthHistory: GrowthSheetUploadResponse[] = [];
    attendanceHistory: CampusAttendanceUploadResponse[] = [];
    tTessHistory: TeacherAssessmentUploadResponse[] = [];
    standardsHistory: StudentStandardsUploadResponse[] = [];
    individualHistory: IndividualAttendanceUploadResponse[] = [];
    ccmrHistory: CcmrSheetUploadResponse[] = [];

    rawscoresHistoryLoading = false;
    growthHistoryLoading = false;
    attendanceHistoryLoading = false;
    tTessHistoryLoading = false;
    standardsHistoryLoading = false;
    individualHistoryLoading = false;
    ccmrHistoryLoading = false;

    private readonly deletingUploadKeys = new Set<string>();

    campusDistrictGoal = 95;
    campusEstimatePerStudent = 55;

    uploadErrorModalTitle = 'Upload errors';
    uploadErrorSubtitle = '';
    uploadErrorSearch = '';
    uploadErrorRows: UploadErrorRow[] = [];
    uploadErrorCols: Array<{ field: string; title: string; filter: boolean }> = [];
    uploadErrorRawText = '';

    private readonly uploadErrorColumnOrder = [
        'localId',
        'name',
        'sheetRow',
        'code',
        'reason',
        'evaluationId',
        'teacherId',
        'teacherIdExternal',
        'subject',
        'grade',
        'campus',
        'row',
        'campusId',
        'campusCode',
        'gradeCode',
        'subjectCode',
        'standardCode',
        'quarterCode',
        'testLang',
    ];

    readonly tabs: { id: UploadTab; label: string }[] = [
        { id: 'rawscores', label: 'Raw scores' },
        { id: 'growth', label: 'Growth sheets' },
        { id: 'attendance', label: 'Campus attendance' },
        { id: 't-tess', label: 'T-TESS' },
        { id: 'student-standards', label: 'Student standards' },
        { id: 'individual-attendance', label: 'Individual attendance' },
        { id: 'ccmr', label: 'CCMR' },
    ];

    constructor(
        readonly districtContext: DistrictContextService,
        private uploads: SimplifyUploadsService,
        private auth: AuthService,
        private destroyRef: DestroyRef,
        private cdr: ChangeDetectorRef,
    ) {}

    ngOnInit(): void {
        this.districtContext.selection$
            .pipe(
                distinctUntilChanged((a, b) =>
                    this.selectionKeyForTab(this.activeTab, a) ===
                    this.selectionKeyForTab(this.activeTab, b),
                ),
                takeUntilDestroyed(this.destroyRef),
            )
            .subscribe(() => this.refreshActiveTabHistory());
        this.refreshActiveTabHistory();
    }

    setTab(tab: UploadTab): void {
        if (this.activeTab === tab) {
            return;
        }
        this.activeTab = tab;
        this.refreshActiveTabHistory();
    }

    /** Attendance-scoped tabs ignore quarter; growth-scoped tabs include it. */
    private selectionKeyForTab(
        tab: UploadTab,
        s: { districtId: number | null; academicYearId: number | null; quarterCode: string | null },
    ): string {
        const base = `${s.districtId ?? ''}|${s.academicYearId ?? ''}`;
        switch (tab) {
            case 'growth':
            case 'student-standards':
            case 'individual-attendance':
                return `${base}|${s.quarterCode ?? ''}`;
            default:
                return base;
        }
    }

    private refreshActiveTabHistory(): void {
        switch (this.activeTab) {
            case 'rawscores':
                this.refreshRawscoresHistory();
                break;
            case 'growth':
                this.refreshGrowthHistory();
                break;
            case 'attendance':
                this.refreshAttendanceHistory();
                break;
            case 't-tess':
                this.refreshTTessHistory();
                break;
            case 'student-standards':
                this.refreshStandardsHistory();
                break;
            case 'individual-attendance':
                this.refreshIndividualHistory();
                break;
            case 'ccmr':
                this.refreshCcmrHistory();
                break;
        }
    }

    private refreshAllHistories(): void {
        this.refreshActiveTabHistory();
    }

    private uploadedBy(): string | undefined {
        return this.auth.getCurrentUser()?.email ?? undefined;
    }

    /** Clamp the T-TESS score multiplier to a positive number, defaulting to 20. */
    private normalizedScoreMultiplier(): number {
        const n = Number(this.tTessScoreMultiplier);
        return Number.isFinite(n) && n > 0 ? n : 20;
    }

    private showToast(
        message: string,
        icon: 'success' | 'error' | 'warning' = 'success',
        subtitle?: string,
    ): void {
        const toast = Swal.mixin({
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: icon === 'error' ? 6000 : 4500,
            timerProgressBar: true,
            customClass: { container: 'toast' },
        });
        const esc = (s: string) =>
            s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        toast.fire({
            icon,
            ...(subtitle
                ? {
                      html: `<div class="text-sm font-semibold">${esc(message)}</div><div class="mt-1 text-xs opacity-90">${esc(subtitle)}</div>`,
                  }
                : { title: message }),
            padding: '12px 18px',
        });
    }

    private failureMessage(err: unknown): string {
        if (err instanceof HttpErrorResponse) {
            const body = err.error as { message?: string } | undefined;
            if (typeof body?.message === 'string' && body.message.trim()) {
                return body.message;
            }
        }
        if (err instanceof Error && err.message) {
            return err.message;
        }
        return 'Upload failed';
    }

    private sanitizeUploadHeadline(fallback: string, message?: string | null): string {
        const m = message?.trim();
        if (!m || m.length > 160 || m.startsWith('{') || m.startsWith('[')) {
            return fallback;
        }
        return m;
    }

    private formatUploadDetail(res: UploadResultFields): string {
        const parts = [
            res.fileName,
            res.recordCount != null ? `${res.recordCount} rows` : null,
            res.skippedCount != null ? `${res.skippedCount} skipped` : null,
            res.skippedRowCount != null ? `${res.skippedRowCount} skipped` : null,
            res.insertedCount != null ? `${res.insertedCount} inserted` : null,
            res.updatedCount != null ? `${res.updatedCount} updated` : null,
            res.updatedRowCount != null ? `${res.updatedRowCount} updated` : null,
            res.status,
        ].filter((x): x is string => !!x && String(x).trim().length > 0);
        return parts.join(' · ');
    }

    private handleUploadSuccess<T extends UploadResultFields>(
        headline: string,
        res: T,
        setMsg: (msg: string) => void,
        refresh: () => void,
        clearFile?: () => void,
    ): void {
        const detail = this.formatUploadDetail(res);
        setMsg(detail ? `${headline} — ${detail}` : headline);
        this.showToast(headline, 'success', detail || undefined);
        clearFile?.();
        refresh();
    }

    refreshRawscoresHistory(): void {
        const base = this.districtContext.baseAttendancePayload();
        if (!base) {
            this.rawscoresHistory = [];
            this.rawscoresHistoryLoading = false;
            this.cdr.markForCheck();
            return;
        }
        this.rawscoresHistoryLoading = true;
        this.uploads
            .listRawscoresUploads({
                districtId: base.districtId,
                academicYearId: base.academicYearId,
            })
            .pipe(
                finalize(() => {
                    this.rawscoresHistoryLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.rawscoresHistory = rows;
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.rawscoresHistory = [];
                    this.cdr.markForCheck();
                },
            });
    }

    refreshGrowthHistory(): void {
        const base = this.districtContext.baseGrowthPayload();
        if (!base) {
            this.growthHistory = [];
            this.growthHistoryLoading = false;
            this.cdr.markForCheck();
            return;
        }
        this.growthHistoryLoading = true;
        this.uploads
            .listGrowthSheetUploads({
                districtId: base.districtId,
                academicYearId: base.academicYearId,
                quarterCode: base.quarterCode,
            })
            .pipe(
                finalize(() => {
                    this.growthHistoryLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.growthHistory = rows;
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.growthHistory = [];
                    this.cdr.markForCheck();
                },
            });
    }

    refreshAttendanceHistory(): void {
        const base = this.districtContext.baseAttendancePayload();
        if (!base) {
            this.attendanceHistory = [];
            this.attendanceHistoryLoading = false;
            this.cdr.markForCheck();
            return;
        }
        this.attendanceHistoryLoading = true;
        this.uploads
            .listCampusAttendanceUploads({
                districtId: base.districtId,
                academicYearId: base.academicYearId,
            })
            .pipe(
                finalize(() => {
                    this.attendanceHistoryLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.attendanceHistory = rows;
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.attendanceHistory = [];
                    this.cdr.markForCheck();
                },
            });
    }

    refreshTTessHistory(): void {
        const base = this.districtContext.baseAttendancePayload();
        if (!base) {
            this.tTessHistory = [];
            this.tTessHistoryLoading = false;
            this.cdr.markForCheck();
            return;
        }
        this.tTessHistoryLoading = true;
        this.uploads
            .listTeacherAssessmentUploads({
                districtId: base.districtId,
                academicYearId: base.academicYearId,
            })
            .pipe(
                finalize(() => {
                    this.tTessHistoryLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.tTessHistory = rows;
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.tTessHistory = [];
                    this.cdr.markForCheck();
                },
            });
    }

    refreshStandardsHistory(): void {
        const base = this.districtContext.baseGrowthPayload();
        if (!base) {
            this.standardsHistory = [];
            this.standardsHistoryLoading = false;
            this.cdr.markForCheck();
            return;
        }
        this.standardsHistoryLoading = true;
        this.uploads
            .listStudentStandardsUploads({
                districtId: base.districtId,
                academicYearId: base.academicYearId,
                quarterCode: base.quarterCode,
            })
            .pipe(
                finalize(() => {
                    this.standardsHistoryLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.standardsHistory = rows;
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.standardsHistory = [];
                    this.cdr.markForCheck();
                },
            });
    }

    refreshIndividualHistory(): void {
        const base = this.districtContext.baseGrowthPayload();
        if (!base) {
            this.individualHistory = [];
            this.individualHistoryLoading = false;
            this.cdr.markForCheck();
            return;
        }
        this.individualHistoryLoading = true;
        this.uploads
            .listIndividualAttendanceUploads({
                districtId: base.districtId,
                academicYearId: base.academicYearId,
                quarterCode: base.quarterCode,
            })
            .pipe(
                finalize(() => {
                    this.individualHistoryLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.individualHistory = rows;
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.individualHistory = [];
                    this.cdr.markForCheck();
                },
            });
    }

    refreshCcmrHistory(): void {
        const base = this.districtContext.baseAttendancePayload();
        if (!base) {
            this.ccmrHistory = [];
            this.ccmrHistoryLoading = false;
            this.cdr.markForCheck();
            return;
        }
        this.ccmrHistoryLoading = true;
        this.uploads
            .listCcmrUploads({
                districtId: base.districtId,
                academicYearId: base.academicYearId,
            })
            .pipe(
                finalize(() => {
                    this.ccmrHistoryLoading = false;
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (rows) => {
                    this.ccmrHistory = rows;
                    this.cdr.markForCheck();
                },
                error: () => {
                    this.ccmrHistory = [];
                    this.cdr.markForCheck();
                },
            });
    }

    onGrowthFile(ev: Event): void {
        this.growthFile = (ev.target as HTMLInputElement).files?.[0] ?? null;
        this.growthMsg = '';
    }

    onRawscoresFile(ev: Event): void {
        this.rawscoresFile = (ev.target as HTMLInputElement).files?.[0] ?? null;
        this.rawscoresMsg = '';
    }

    onAttendanceFile(ev: Event): void {
        this.attendanceFile = (ev.target as HTMLInputElement).files?.[0] ?? null;
        this.attendanceMsg = '';
    }

    onTTessFile(ev: Event): void {
        this.tTessFile = (ev.target as HTMLInputElement).files?.[0] ?? null;
        this.tTessMsg = '';
    }

    onStandardsFile(ev: Event): void {
        this.standardsFile = (ev.target as HTMLInputElement).files?.[0] ?? null;
        this.standardsMsg = '';
    }

    onIndividualFile(ev: Event): void {
        this.individualFile = (ev.target as HTMLInputElement).files?.[0] ?? null;
        this.individualMsg = '';
    }

    onCcmrFile(ev: Event): void {
        this.ccmrFile = (ev.target as HTMLInputElement).files?.[0] ?? null;
        this.ccmrMsg = '';
    }

    submitGrowthSheet(): void {
        const baseGrowth = this.districtContext.baseGrowthPayload();
        if (!baseGrowth || !this.growthFile) {
            return;
        }
        this.growthBusy = true;
        this.growthMsg = '';
        this.uploads
            .uploadGrowthSheet(this.growthFile, {
                districtId: baseGrowth.districtId,
                academicYearId: baseGrowth.academicYearId,
                quarterCode: baseGrowth.quarterCode,
                uploadedBy: this.uploadedBy(),
            })
            .pipe(finalize(() => (this.growthBusy = false)))
            .subscribe({
                next: ({ data: res, message }: UploadApiResult<GrowthSheetUploadResponse>) => {
                    this.handleUploadSuccess(
                        this.sanitizeUploadHeadline('Growth sheet uploaded', message),
                        res,
                        (m) => (this.growthMsg = m),
                        () => this.refreshGrowthHistory(),
                        () => (this.growthFile = null),
                    );
                },
                error: (e: unknown) => {
                    const msg = this.failureMessage(e);
                    this.growthMsg = msg;
                    this.showToast(msg, 'error');
                },
            });
    }

    submitRawscores(): void {
        const base = this.districtContext.baseAttendancePayload();
        if (!base || !this.rawscoresFile) {
            return;
        }
        this.rawscoresBusy = true;
        this.rawscoresMsg = '';
        this.uploads
            .uploadRawscoresSheet(this.rawscoresFile, {
                districtId: base.districtId,
                academicYearId: base.academicYearId,
                uploadedBy: this.uploadedBy(),
            })
            .pipe(finalize(() => (this.rawscoresBusy = false)))
            .subscribe({
                next: ({ data: res, message }) => {
                    this.handleUploadSuccess(
                        this.sanitizeUploadHeadline('Rawscores imported', message),
                        res,
                        (m) => (this.rawscoresMsg = m),
                        () => this.refreshRawscoresHistory(),
                        () => (this.rawscoresFile = null),
                    );
                },
                error: (e: unknown) => {
                    const msg = this.failureMessage(e);
                    this.rawscoresMsg = msg;
                    this.showToast(msg, 'error');
                },
            });
    }

    submitCampusAttendance(): void {
        const base = this.districtContext.baseAttendancePayload();
        if (!base || !this.attendanceFile) {
            return;
        }
        this.attendanceBusy = true;
        this.attendanceMsg = '';
        this.uploads
            .uploadCampusAttendanceExcel(this.attendanceFile, {
                districtId: base.districtId,
                academicYearId: base.academicYearId,
                districtGoal: this.campusDistrictGoal,
                estimatedDollarsPerStudent: this.campusEstimatePerStudent,
                uploadedBy: this.uploadedBy(),
            })
            .pipe(finalize(() => (this.attendanceBusy = false)))
            .subscribe({
                next: ({ data: res, message }: UploadApiResult<CampusAttendanceUploadResponse>) => {
                    this.handleUploadSuccess(
                        this.sanitizeUploadHeadline('Attendance file uploaded', message),
                        res,
                        (m) => (this.attendanceMsg = m),
                        () => this.refreshAttendanceHistory(),
                        () => this.clearAttendanceFileInput(),
                    );
                },
                error: (e: unknown) => {
                    const msg = this.failureMessage(e);
                    this.attendanceMsg = msg;
                    this.showToast(msg, 'error');
                },
            });
    }

    submitTTess(): void {
        const base = this.districtContext.baseAttendancePayload();
        if (!base || !this.tTessFile) {
            return;
        }
        this.tTessBusy = true;
        this.tTessMsg = '';
        this.uploads
            .uploadTeacherAssessment(this.tTessFile, {
                districtId: base.districtId,
                academicYearId: base.academicYearId,
                scoreMultiplier: this.normalizedScoreMultiplier(),
                uploadedBy: this.uploadedBy(),
            })
            .pipe(finalize(() => (this.tTessBusy = false)))
            .subscribe({
                next: ({ data: res, message }: UploadApiResult<TeacherAssessmentUploadResponse>) => {
                    this.handleUploadSuccess(
                        this.sanitizeUploadHeadline('T-TESS sheet uploaded', message),
                        res,
                        (m) => (this.tTessMsg = m),
                        () => this.refreshTTessHistory(),
                        () => (this.tTessFile = null),
                    );
                },
                error: (e: unknown) => {
                    const msg = this.failureMessage(e);
                    this.tTessMsg = msg;
                    this.showToast(msg, 'error');
                },
            });
    }

    submitStudentStandards(): void {
        const base = this.districtContext.baseGrowthPayload();
        if (!base || !this.standardsFile) {
            return;
        }
        this.standardsBusy = true;
        this.standardsMsg = '';
        this.uploads
            .uploadStudentStandards(this.standardsFile, {
                districtId: base.districtId,
                academicYearId: base.academicYearId,
                quarterCode: base.quarterCode,
                uploadedBy: this.uploadedBy(),
            })
            .pipe(finalize(() => (this.standardsBusy = false)))
            .subscribe({
                next: ({ data: res, message }: UploadApiResult<StudentStandardsUploadResponse>) => {
                    this.handleUploadSuccess(
                        this.sanitizeUploadHeadline('Student standards uploaded', message),
                        res,
                        (m) => (this.standardsMsg = m),
                        () => this.refreshStandardsHistory(),
                        () => (this.standardsFile = null),
                    );
                },
                error: (e: unknown) => {
                    const msg = this.failureMessage(e);
                    this.standardsMsg = msg;
                    this.showToast(msg, 'error');
                },
            });
    }

    submitIndividualAttendance(): void {
        const base = this.districtContext.baseGrowthPayload();
        if (!base || !this.individualFile) {
            return;
        }
        this.individualBusy = true;
        this.individualMsg = '';
        this.uploads
            .uploadIndividualAttendance(this.individualFile, {
                districtId: base.districtId,
                academicYearId: base.academicYearId,
                quarterCode: base.quarterCode,
                uploadedBy: this.uploadedBy(),
            })
            .pipe(finalize(() => (this.individualBusy = false)))
            .subscribe({
                next: ({
                    data: res,
                    message,
                }: UploadApiResult<IndividualAttendanceUploadResponse>) => {
                    this.handleUploadSuccess(
                        this.sanitizeUploadHeadline('Individual attendance uploaded', message),
                        res,
                        (m) => (this.individualMsg = m),
                        () => this.refreshIndividualHistory(),
                        () => (this.individualFile = null),
                    );
                },
                error: (e: unknown) => {
                    const msg = this.failureMessage(e);
                    this.individualMsg = msg;
                    this.showToast(msg, 'error');
                },
            });
    }

    submitCcmr(): void {
        const base = this.districtContext.baseAttendancePayload();
        if (!base || !this.ccmrFile) {
            return;
        }
        this.ccmrBusy = true;
        this.ccmrMsg = '';
        this.uploads
            .uploadCcmrSheet(this.ccmrFile, {
                districtId: base.districtId,
                academicYearId: base.academicYearId,
                uploadedBy: this.uploadedBy(),
            })
            .pipe(finalize(() => (this.ccmrBusy = false)))
            .subscribe({
                next: ({ data: res, message }: UploadApiResult<CcmrSheetUploadResponse>) => {
                    this.handleUploadSuccess(
                        this.sanitizeUploadHeadline('CCMR workbook uploaded', message),
                        res,
                        (m) => (this.ccmrMsg = m),
                        () => this.refreshCcmrHistory(),
                        () => (this.ccmrFile = null),
                    );
                },
                error: (e: unknown) => {
                    const msg = this.failureMessage(e);
                    this.ccmrMsg = msg;
                    this.showToast(msg, 'error');
                },
            });
    }

    private clearAttendanceFileInput(): void {
        this.attendanceFile = null;
        const el = this.attendanceFileInput?.nativeElement;
        if (el) {
            el.value = '';
        }
    }

    statusBadgeClass(status?: string): string {
        const s = (status ?? '').toLowerCase();
        if (s.includes('complete') || s.includes('success')) {
            return 'badge bg-success';
        }
        if (s.includes('process') || s.includes('pending')) {
            return 'badge bg-warning';
        }
        if (s.includes('fail') || s.includes('error')) {
            return 'badge bg-danger';
        }
        return 'badge bg-dark';
    }

    uploadDeleteKey(tab: UploadTab, uploadId: number): string {
        return `${tab}:${uploadId}`;
    }

    isDeletingUpload(tab: UploadTab, uploadId?: number): boolean {
        return uploadId != null && this.deletingUploadKeys.has(this.uploadDeleteKey(tab, uploadId));
    }

    confirmDeleteUpload(tab: UploadTab, uploadId: number | undefined, fileLabel?: string): void {
        if (uploadId == null) {
            return;
        }
        const label = fileLabel?.trim() || 'this upload';
        void Swal.fire({
            title: 'Delete upload?',
            text: `Remove "${label}"? This cannot be undone.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonText: 'Delete',
            cancelButtonText: 'Cancel',
            customClass: {
                confirmButton: 'btn btn-danger',
                cancelButton: 'btn btn-outline-primary ltr:ml-3 rtl:mr-3',
            },
            buttonsStyling: false,
            focusCancel: true,
        }).then((result) => {
            if (result.isConfirmed) {
                this.deleteUpload(tab, uploadId, label);
            }
        });
    }

    private deleteUpload(tab: UploadTab, uploadId: number, fileLabel: string): void {
        const key = this.uploadDeleteKey(tab, uploadId);
        this.deletingUploadKeys.add(key);
        this.cdr.markForCheck();

        const request$ = (() => {
            switch (tab) {
                case 'rawscores':
                    return this.uploads.deleteRawscoresUpload(uploadId);
                case 'growth':
                    return this.uploads.deleteGrowthSheetUpload(uploadId);
                case 'attendance':
                    return this.uploads.deleteCampusAttendanceUpload(uploadId);
                case 't-tess':
                    return this.uploads.deleteTeacherAssessmentUpload(uploadId);
                case 'student-standards':
                    return this.uploads.deleteStudentStandardsUpload(uploadId);
                case 'individual-attendance':
                    return this.uploads.deleteIndividualAttendanceUpload(uploadId);
                case 'ccmr':
                    return this.uploads.deleteCcmrUpload(uploadId);
            }
        })();

        request$
            .pipe(
                finalize(() => {
                    this.deletingUploadKeys.delete(key);
                    this.cdr.markForCheck();
                }),
            )
            .subscribe({
                next: (message) => {
                    this.showToast(
                        this.sanitizeUploadHeadline('Upload deleted', message) || 'Upload deleted',
                        'success',
                        fileLabel,
                    );
                    this.refreshActiveTabHistory();
                },
                error: (err: unknown) => {
                    this.showToast(this.failureMessage(err), 'error');
                },
            });
    }

    hasUploadErrors(item: UploadResultFields): boolean {
        if (item.sheetMessages?.some((message) => message?.trim())) {
            return true;
        }
        return this.hasUploadErrorPayload(item.errorMessage);
    }

    openUploadErrorModal(fileLabel: string, item: UploadResultFields): void {
        const parsed = this.parseUploadErrorPayload(item.errorMessage);
        let rows = [...parsed.rows];
        let columns = parsed.columns;
        let rawText = parsed.rawText ?? '';

        if (item.sheetMessages?.length) {
            const sheetRows = item.sheetMessages
                .filter((message) => message?.trim())
                .map((message) => ({ reason: message.trim() }));
            if (sheetRows.length) {
                rows = [...rows, ...sheetRows];
                columns = this.buildUploadErrorColumns(rows);
            }
        }

        const label = fileLabel.trim() || 'Upload';
        const errorCount = rows.length;
        const envelopeMeta = this.getUploadErrorEnvelopeMeta(item.errorMessage);

        this.uploadErrorModalTitle = 'Upload errors';
        if (errorCount > 0 && envelopeMeta.truncatedTotal != null && envelopeMeta.truncatedTotal > errorCount) {
            this.uploadErrorSubtitle = `${label} · Showing ${errorCount} of ${envelopeMeta.truncatedTotal} missed students`;
        } else {
            this.uploadErrorSubtitle =
                errorCount > 0 ? `${label} · ${errorCount} error${errorCount === 1 ? '' : 's'}` : label;
        }
        this.uploadErrorSearch = '';
        this.uploadErrorRows = this.finalizeUploadErrorRows(rows, columns);
        this.uploadErrorCols = this.buildUploadErrorColDefs(columns);
        this.uploadErrorRawText = rawText;
        this.uploadErrorModal?.open();
        this.cdr.markForCheck();
    }

    formatUploadErrorColumnLabel(key: string): string {
        const labels: Record<string, string> = {
            sheetRow: 'Sheet row',
            code: 'Code',
            reason: 'Reason',
            evaluationId: 'Evaluation ID',
            teacherId: 'Teacher ID',
            teacherIdExternal: 'Teacher ID',
            subject: 'Subject',
            grade: 'Grade',
            campus: 'Campus',
            row: 'Row',
            localId: 'Local ID',
            name: 'Name',
            campusId: 'Campus',
            campusCode: 'Campus',
            gradeCode: 'Grade',
            subjectCode: 'Subject',
            standardCode: 'Standard',
            quarterCode: 'Quarter',
            testLang: 'Test language',
        };
        return labels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
    }

    private finalizeUploadErrorRows(rows: UploadErrorRow[], columns: string[]): UploadErrorRow[] {
        return rows.map((row) => {
            const normalized: UploadErrorRow = {};
            for (const column of columns) {
                const value = row[column];
                normalized[column] = value == null || value === '' ? '—' : value;
            }
            return normalized;
        });
    }

    private buildUploadErrorColDefs(
        columns: string[],
    ): Array<{ field: string; title: string; filter: boolean }> {
        return columns.map((field) => ({
            field,
            title: this.formatUploadErrorColumnLabel(field),
            filter: true,
        }));
    }

    private hasUploadErrorPayload(payload: unknown): boolean {
        if (payload == null) {
            return false;
        }
        if (typeof payload === 'string') {
            return !!payload.trim();
        }
        if (Array.isArray(payload)) {
            return payload.length > 0;
        }
        if (typeof payload === 'object') {
            const rows = this.extractUploadErrorRows(payload);
            if (rows?.length) {
                return true;
            }
            const meta = this.getUploadErrorEnvelopeMeta(payload);
            return meta.truncatedTotal != null && meta.truncatedTotal > 0;
        }
        return !!String(payload).trim();
    }

    private parseUploadErrorPayload(payload: unknown): {
        rows: UploadErrorRow[];
        columns: string[];
        rawText?: string;
    } {
        if (payload == null) {
            return { rows: [], columns: [] };
        }

        if (typeof payload === 'string') {
            const trimmed = payload.trim();
            if (!trimmed) {
                return { rows: [], columns: [] };
            }

            try {
                let data: unknown = JSON.parse(trimmed);
                if (typeof data === 'string') {
                    const inner = data.trim();
                    if (inner.startsWith('[') || inner.startsWith('{')) {
                        data = JSON.parse(inner);
                    }
                }

                const rows = this.extractUploadErrorRows(data);
                if (rows?.length) {
                    return { rows, columns: this.buildUploadErrorColumns(rows) };
                }
            } catch {
                return { rows: [], columns: [], rawText: trimmed };
            }

            return { rows: [], columns: [], rawText: trimmed };
        }

        const rows = this.extractUploadErrorRows(payload);
        if (rows?.length) {
            return { rows, columns: this.buildUploadErrorColumns(rows) };
        }

        return { rows: [], columns: [] };
    }

    /** Unwrap upload error envelopes such as `{ skipped: [...] }` or `{ missed: [...] }`. */
    private extractUploadErrorRows(data: unknown): UploadErrorRow[] | null {
        if (Array.isArray(data)) {
            return data.length ? data.map((item) => this.normalizeUploadErrorRow(item)) : [];
        }

        if (typeof data !== 'object' || data === null) {
            return null;
        }

        const record = data as Record<string, unknown>;
        const nested =
            record['skipped'] ??
            record['Skipped'] ??
            record['missed'] ??
            record['Missed'] ??
            record['errors'] ??
            record['Errors'] ??
            record['items'] ??
            record['Items'];

        if (Array.isArray(nested)) {
            return nested.map((item) => this.normalizeUploadErrorRow(item));
        }

        if (this.looksLikeUploadErrorRow(record)) {
            return [this.normalizeUploadErrorRow(data)];
        }

        return null;
    }

    private getUploadErrorEnvelopeMeta(payload: unknown): { truncatedTotal?: number } {
        const data = this.unwrapUploadErrorEnvelope(payload);
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            return {};
        }

        const record = data as Record<string, unknown>;
        const truncated =
            record['missedTruncated'] ??
            record['MissedTruncated'] ??
            record['skippedCount'] ??
            record['SkippedCount'];

        if (truncated == null || truncated === '') {
            return {};
        }

        const total = Number(truncated);
        return Number.isFinite(total) ? { truncatedTotal: total } : {};
    }

    private unwrapUploadErrorEnvelope(payload: unknown): unknown {
        if (payload == null) {
            return null;
        }

        if (typeof payload === 'string') {
            const trimmed = payload.trim();
            if (!trimmed) {
                return null;
            }

            try {
                let data: unknown = JSON.parse(trimmed);
                if (typeof data === 'string') {
                    const inner = data.trim();
                    if (inner.startsWith('[') || inner.startsWith('{')) {
                        data = JSON.parse(inner);
                    }
                }
                return data;
            } catch {
                return null;
            }
        }

        return payload;
    }

    private looksLikeUploadErrorRow(record: Record<string, unknown>): boolean {
        return (
            'reason' in record ||
            'Reason' in record ||
            'code' in record ||
            'Code' in record ||
            'sheetRow' in record ||
            'SheetRow' in record ||
            'row' in record ||
            'Row' in record ||
            'localId' in record ||
            'LocalId' in record ||
            'name' in record ||
            'Name' in record
        );
    }

    private normalizeUploadErrorRow(item: unknown): UploadErrorRow {
        if (typeof item !== 'object' || item === null) {
            return { reason: String(item) };
        }

        const row: UploadErrorRow = {};
        for (const [key, value] of Object.entries(item)) {
            if (value == null || value === '') {
                continue;
            }
            const normalizedKey = key.charAt(0).toLowerCase() + key.slice(1);
            row[normalizedKey] = typeof value === 'object' ? JSON.stringify(value) : value;
        }
        return row;
    }

    private buildUploadErrorColumns(rows: UploadErrorRow[]): string[] {
        const keys = new Set<string>();
        for (const row of rows) {
            Object.keys(row).forEach((key) => keys.add(key));
        }

        const ordered = this.uploadErrorColumnOrder.filter((key) => keys.has(key));
        const rest = [...keys]
            .filter((key) => !this.uploadErrorColumnOrder.includes(key))
            .sort();
        return [...ordered, ...rest];
    }
}
