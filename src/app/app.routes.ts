import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { HomePage } from './pages/home';
import { QuizPage } from './pages/quiz';
import { StatsPage } from './pages/stats';
import { SummaryPage } from './pages/summary';
import { WhoPage } from './pages/who';
import { UserService } from './services/user.service';

/** Pages that show someone's progress need a name first. */
export const requireUser: CanActivateFn = () =>
  inject(UserService).current() ? true : inject(Router).createUrlTree(['/who']);

export const routes: Routes = [
  { path: '', component: HomePage, title: 'Præpositioner', canActivate: [requireUser] },
  { path: 'who', component: WhoPage, title: 'Who · Præpositioner' },
  { path: 'quiz', component: QuizPage, title: 'Quiz · Præpositioner', canActivate: [requireUser] },
  { path: 'summary', component: SummaryPage, title: 'Result · Præpositioner', canActivate: [requireUser] },
  { path: 'stats', component: StatsPage, title: 'Statistics · Præpositioner', canActivate: [requireUser] },
  { path: '**', redirectTo: '' },
];
