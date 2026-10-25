import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { emptyProgress, ProgressState } from '../models/progress';
import { testProgress } from '../testing/fixtures';
import { ApiProgressStore } from './api-progress-store';

describe('ApiProgressStore', () => {
  let store: ApiProgressStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ApiProgressStore, provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(ApiProgressStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Lets firstValueFrom subscribe before the request is looked up. */
  const tick = () => new Promise((resolve) => setTimeout(resolve));

  const state: ProgressState = { version: 1, items: { 4: testProgress() }, sessions: [] };

  it('loads progress for a name, URL-encoded', async () => {
    const loading = store.load('Søren Ærø');
    await tick();
    http.expectOne({ method: 'GET', url: '/api/progress/S%C3%B8ren%20%C3%86r%C3%B8' }).flush(state);
    expect(await loading).toEqual(state);
  });

  it('returns empty progress for a new name (404)', async () => {
    const loading = store.load('Andrii');
    await tick();
    http.expectOne('/api/progress/Andrii').flush(null, { status: 404, statusText: 'Not Found' });
    expect(await loading).toEqual(emptyProgress());
  });

  it('rejects on other errors', async () => {
    const loading = store.load('Andrii');
    await tick();
    http.expectOne('/api/progress/Andrii').flush(null, { status: 500, statusText: 'Server Error' });
    await expect(loading).rejects.toBeTruthy();
  });

  it('rejects unreadable data from the server (so it is not overwritten)', async () => {
    const loading = store.load('Andrii');
    await tick();
    http.expectOne('/api/progress/Andrii').flush({ version: 7 });
    await expect(loading).rejects.toThrow('could not be read');
  });

  it('saves with PUT', async () => {
    const saving = store.save('Andrii', state);
    await tick();
    const req = http.expectOne({ method: 'PUT', url: '/api/progress/Andrii' });
    expect(req.request.body).toEqual(state);
    req.flush(null, { status: 204, statusText: 'No Content' });
    await saving;
  });

  it('rejects when saving fails', async () => {
    const saving = store.save('Andrii', state);
    await tick();
    http.expectOne('/api/progress/Andrii').flush(null, { status: 400, statusText: 'Bad Request' });
    await expect(saving).rejects.toBeTruthy();
  });
});
