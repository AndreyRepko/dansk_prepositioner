import { Routes } from '@angular/router';
import { HomePage } from './pages/home';
import { QuizPage } from './pages/quiz';
import { StatsPage } from './pages/stats';
import { SummaryPage } from './pages/summary';
import { WhoPage } from './pages/who';

/** Every page works without signing in (guest progress stays in this browser). */
export const routes: Routes = [
  { path: '', component: HomePage, title: 'Præpositioner' },
  { path: 'who', component: WhoPage, title: 'Sign in · Præpositioner' },
  { path: 'quiz', component: QuizPage, title: 'Quiz · Præpositioner' },
  { path: 'summary', component: SummaryPage, title: 'Result · Præpositioner' },
  { path: 'stats', component: StatsPage, title: 'Statistics · Præpositioner' },
  { path: '**', redirectTo: '' },
];
