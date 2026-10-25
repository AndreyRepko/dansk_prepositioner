import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { LocalStorageProgressStore } from './services/local-storage-progress-store';
import { ProgressStore } from './services/progress-store';
import { QuizService } from './services/quiz.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    // Swap for a backend-backed store (phase 2: Azure) here.
    { provide: ProgressStore, useClass: LocalStorageProgressStore },
    // Failure is shown by the app shell instead of blocking bootstrap.
    provideAppInitializer(() => inject(QuizService).init().catch((e) => console.error(e))),
  ],
};
