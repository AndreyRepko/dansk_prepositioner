import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { requireUser } from '../app.routes';
import { emptyProgress } from '../models/progress';
import { ProgressStore } from '../services/progress-store';
import { UserService } from '../services/user.service';
import { WhoPage } from './who';

describe('WhoPage', () => {
  let load: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    load = vi.fn(async () => emptyProgress());
    TestBed.configureTestingModule({
      imports: [WhoPage],
      providers: [provideRouter([]), { provide: ProgressStore, useValue: { load, save: async () => {} } }],
    });
  });

  async function render() {
    const fixture = TestBed.createComponent(WhoPage);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  function type(el: HTMLElement, value: string) {
    const input = el.querySelector('input')!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
  }

  it('selects a typed name, loads its progress and goes home', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { fixture, el } = await render();
    type(el, '  Olena ');
    await fixture.whenStable();

    expect(TestBed.inject(UserService).current()).toBe('Olena');
    expect(load).toHaveBeenCalledWith('Olena');
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('shows an error for an invalid name and stays', async () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { fixture, el } = await render();
    type(el, 'a/b');
    await fixture.whenStable();

    expect(el.querySelector('.error')).toBeTruthy();
    expect(TestBed.inject(UserService).current()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('lists names used before and switches with one click', async () => {
    const users = TestBed.inject(UserService);
    users.select('Olena');
    users.select('Andrii');
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const { fixture, el } = await render();

    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.known .name')];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Andrii', 'Olena']);
    buttons[1].click();
    await fixture.whenStable();
    expect(users.current()).toBe('Olena');
  });

  it('removes a name from the list', async () => {
    TestBed.inject(UserService).select('Olena');
    const { fixture, el } = await render();
    el.querySelector<HTMLButtonElement>('.known .forget')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.known')).toBeNull();
  });
});

describe('requireUser', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  const run = () => TestBed.runInInjectionContext(() => requireUser({} as never, {} as never));

  it('sends people without a name to /who', () => {
    expect(TestBed.inject(Router).serializeUrl(run() as never)).toBe('/who');
  });

  it('lets people with a name through', () => {
    TestBed.inject(UserService).select('Andrii');
    expect(run()).toBe(true);
  });
});
