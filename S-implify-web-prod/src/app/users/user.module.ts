import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Routes, RouterModule } from '@angular/router';

import { SharedModule } from 'src/shared.module';

import { UserListComponent } from './user-list';

const routes: Routes = [
    { path: 'users/list', component: UserListComponent, data: { title: 'Users List' } },
];
@NgModule({
    imports: [RouterModule.forChild(routes), CommonModule, SharedModule.forRoot()],
    declarations: [UserListComponent],
})
export class UsersModule {}
