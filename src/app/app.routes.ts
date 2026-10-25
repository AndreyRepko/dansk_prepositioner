import { Routes } from '@angular/router';
import { HomePage } from './pages/home';
import { QuizPage } from './pages/quiz';
import { StatsPage } from './pages/stats';
import { SummaryPage } from './pages/summary';

export const routes: Routes = [
  { path: '', component: HomePage, title: 'Præpositioner' },
  { path: 'quiz', component: QuizPage, title: 'Quiz · Præpositioner' },
  { path: 'summary', component: SummaryPage, title: 'Result · Præpositioner' },
  { path: 'stats', component: StatsPage, title: 'Statistics · Præpositioner' },
  { path: '**', redirectTo: '' },
];
