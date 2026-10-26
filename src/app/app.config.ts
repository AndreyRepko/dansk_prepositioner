import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { ApiProgressStore } from './services/api-progress-store';
import { ExpressionService } from './services/expression.service';
import { LocalStorageProgressStore } from './services/local-storage-progress-store';
import { ProgressStore } from './services/progress-store';
import { QuizService } from './services/quiz.service';

/** Set per build configuration in angular.json (`define`): true = save progress through /api. */
declare const USE_API: boolean | undefined;
const useApi = typeof USE_API !== 'undefined' && USE_API;

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    { provide: ProgressStore, useClass: useApi ? ApiProgressStore : LocalStorageProgressStore },
    provideAppInitializer(() => {
      // Failures are shown by the app shell instead of blocking bootstrap.
      inject(QuizService)
        .init()
        .catch((e) => console.error(e));
      // Wait only for the expressions; progress shows "Loading progress…" (the API may cold-start).
      return inject(ExpressionService)
        .load()
        .then(
          () => undefined,
          () => undefined,
        );
    }),
  ],
};
