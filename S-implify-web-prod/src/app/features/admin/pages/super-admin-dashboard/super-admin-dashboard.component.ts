import { Component, OnInit, AfterViewInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Chart, registerables } from 'chart.js';
import { AuthService } from '../../../../core/services/auth.service';
import { ApiService } from '../../../../core/services/api.service';

Chart.register(...registerables);

interface QuickAction {
  label: string;
  sublabel: string;
  icon: string;
  color: string;
  route: string;
}

interface District {
  id: number;
  districtName: string;
  districtCode: string;
  districtAbbreviation: string;
  districtPhone: string;
  districtTimeZone: string;
  stateName: string;
  campusCount: number;
  isActive: boolean;
  createdAt: string;
}

interface Campus {
  id: number;
  districtId: number;
  districtName: string;
  campusCategoryId: number;
  campusCategoryName: string;
  campusCode: string;
  campusName: string;
  campusIdExternal: string;
  campusCount: number;
  isActive: boolean;
  createdAt: string;
}

@Component({
    selector: 'app-super-admin-dashboard',
    templateUrl: './super-admin-dashboard.component.html',
    standalone: true,
    imports: [CommonModule, RouterLink, RouterLinkActive],
})
export class SuperAdminDashboardComponent implements OnInit, AfterViewInit {
    currentUser: any;
    activeRoleLabel: string = '';
    userDisplayName: string = '';
    userEmail: string = '';
    userInitial: string = '';

    quickActions: QuickAction[] = [];
    districts: District[] = [];
    campuses: Campus[] = [];

    districtCount = 0;
    campusCount = 0;
    teacherCount = 0;
    campusDistrictCount = 0;

    loading = false;
    error = '';

    @ViewChild('companyChart') chartCanvas!: ElementRef<HTMLCanvasElement>;
    private chartInstance: Chart | null = null;

    constructor(
        private authService: AuthService,
        private router: Router,
        private apiService: ApiService
    ) {}

    ngOnInit(): void {
        const user = this.authService.getCurrentUser();
        this.currentUser = user;
        this.userDisplayName = user?.displayName || user?.email?.split('@')[0] || 'User';
        this.userEmail = user?.email || '';
        this.userInitial = this.userDisplayName.charAt(0).toUpperCase();
        this.activeRoleLabel = 'SuperAdmin';

        this.loadDistricts();
        this.loadCampuses();
        this.loadTeacherCount();
    }

    ngAfterViewInit(): void {
        setTimeout(() => this.initChart(), 100);
    }

    loadTeacherCount(): void {
        this.apiService.get('users?roleId=4&activeOnly=true').subscribe({
            next: (data: any) => {
                const list = Array.isArray(data) ? data : (data.data || []);
                this.teacherCount = list.length;
            },
            error: () => { this.teacherCount = 0; }
        });
    }

    loadDistricts(): void {
        this.loading = true;
        this.apiService.get('districts?activeOnly=true').subscribe({
            next: (data: any) => {
                const list = Array.isArray(data) ? data : (data.data || []);
                this.districts = list.map((d: any, i: number) => ({
                    id: d.districtId || i + 1,
                    districtName: d.districtName || `District ${i + 1}`,
                    districtCode: d.districtCode || `D${i + 1}`,
                    districtAbbreviation: d.districtAbbreviation || 'DST',
                    districtPhone: d.districtPhone || '',
                    districtTimeZone: d.districtTimeZone || 'UTC',
                    stateName: d.stateName || 'Texas',
                    campusCount: 0,
                    isActive: d.isActive !== false,
                    createdAt: d.createdAt || new Date().toISOString()
                }));
                this.districtCount = this.districts.length;
            },
            error: () => {
                this.error = 'Failed to load districts';
                this.districts = [];
            },
            complete: () => { this.loading = false; }
        });
    }

    loadCampuses(): void {
        this.loading = true;
        this.apiService.get('campuses?activeOnly=true').subscribe({
            next: (data: any) => {
                const list = Array.isArray(data) ? data : (data.data || []);
                this.campuses = list.map((c: any, i: number) => ({
                    id: c.campusId || i + 1,
                    districtId: c.districtId || 1,
                    districtName: c.districtName || 'District 1',
                    campusCategoryId: c.campusCategoryId || 1,
                    campusCategoryName: c.campusCategoryName || 'Elementary',
                    campusCode: c.campusCode || `C${i + 1}`,
                    campusName: c.campusName || `Campus ${i + 1}`,
                    campusIdExternal: c.campusIdExternal || `ext-${i + 1}`,
                    campusCount: 0,
                    isActive: c.isActive !== false,
                    createdAt: c.createdAt || new Date().toISOString()
                }));
                this.campusCount = this.campuses.length;
                this.campusDistrictCount = new Set(this.campuses.map((c: Campus) => c.districtId)).size;
            },
            error: () => {
                this.error = 'Failed to load campuses';
                this.campuses = [];
            },
            complete: () => { this.loading = false; }
        });
    }

    initChart(): void {
        if (!this.chartCanvas) return;

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        this.chartInstance = new Chart(this.chartCanvas.nativeElement, {
            type: 'line',
            data: {
                labels: ['Oct 11', 'Oct 14', 'Oct 17', 'Oct 20', 'Oct 23', 'Oct 26', 'Oct 29', 'Nov 1', 'Nov 4', 'Nov 7'],
                datasets: [{
                    label: 'Total Districts',
                    data: [0, 0, 0, 1, 1, 2, 2, 3, 3, this.districts.length],
                    borderColor: '#2A9D8F',
                    backgroundColor: 'rgba(42, 157, 143, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(0,0,0,0.05)' },
                        ticks: { stepSize: 1 }
                    },
                    x: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    addDistrict(): void {
        const name = prompt('Enter district name:');
        if (!name) return;
        const code = prompt('Enter district code (e.g., HMC):');
        if (!code) return;
        const body = {
            districtName: name,
            districtCode: code,
            districtAbbreviation: code.toUpperCase(),
            districtPhone: '',
            districtTimeZone: 'UTC',
            isActive: true
        };
        this.apiService.post('districts', body).subscribe({
            next: () => {
                alert('District added successfully!');
                this.loadDistricts();
                this.initChart();
            },
            error: () => alert('Failed to add district')
        });
    }

    addCampus(): void {
        const name = prompt('Enter campus name:');
        if (!name) return;
        const code = prompt('Enter campus code (e.g., HMC):');
        if (!code) return;
        const districtId = prompt('Enter district ID (default 1):') || '1';
        const body = {
            districtId: Number(districtId),
            campusCategoryId: 1,
            campusCode: code,
            campusName: name,
            campusIdExternal: `ext-${code}`,
            isActive: true
        };
        this.apiService.post('campuses', body).subscribe({
            next: () => {
                alert('Campus added successfully!');
                this.loadCampuses();
            },
            error: () => alert('Failed to add campus')
        });
    }

    goToRoute(route: string): void {
        this.router.navigate([route]);
    }

    toggleDistrictActive(district: District): void {
        district.isActive = !district.isActive;
        this.apiService.put(`districts/${district.id}`, { ...district, isActive: district.isActive }).subscribe({
            next: () => alert(`District ${district.isActive ? 'activated' : 'deactivated'}!`),
            error: () => {
                district.isActive = !district.isActive;
                alert('Failed to update district');
            }
        });
    }

    toggleCampusActive(campus: Campus): void {
        campus.isActive = !campus.isActive;
        this.apiService.put(`campuses/${campus.id}`, { ...campus, isActive: campus.isActive }).subscribe({
            next: () => alert(`Campus ${campus.isActive ? 'activated' : 'deactivated'}!`),
            error: () => {
                campus.isActive = !campus.isActive;
                alert('Failed to update campus');
            }
        });
    }

    signOut(): void {
        this.authService.logout();
        this.router.navigate(['/auth/login']);
    }

    toggleTheme(): void {
        // Toggle theme - simple implementation
        const html = document.documentElement;
        if (html.classList.contains('dark')) {
            html.classList.remove('dark');
        } else {
            html.classList.add('dark');
        }
    }

    getStatusBadge(isActive: boolean): string {
        return isActive
            ? 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400'
            : 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400';
    }

    getStatusText(isActive: boolean): string {
        return isActive ? 'Active' : 'Inactive';
    }

    get currentThemeIcon(): string {
        return document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
    }
}
