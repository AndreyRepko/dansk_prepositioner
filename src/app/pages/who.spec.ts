import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { ProgressState } from '../models/progress';
import { InsecureContextError, passwordHash } from '../services/password-hash';
import {
  Account,
  ConflictError,
  ProgressStore,
  WrongPasswordError,
} from '../services/progress-store';
import { QuizService } from '../services/quiz.service';
import { CURRENT_USER_KEY, UserService } from '../services/user.service';
import { testProgress } from '../testing/fixtures';
import { WhoPage } from './who';

describe('WhoPage', () => {
  let load: ReturnType<typeof vi.fn<(account: Account) => Promise<ProgressState | null>>>;
  let save: ReturnType<typeof vi.fn<(account: Account, state: ProgressState) => Promise<void>>>;
  let navigate: ReturnType<typeof vi.spyOn>;

  function setup(query: Record<string, string> = {}) {
    localStorage.clear();
    load = vi.fn(async () => null);
    save = vi.fn(async () => {});
    TestBed.configureTestingModule({
      imports: [WhoPage],
      providers: [
        provideRouter([]),
        { provide: ProgressStore, useValue: { load, save } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    });
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  }

  beforeEach(() => setup());

  async function render() {
    const fixture = TestBed.createComponent(WhoPage);
    await fixture.whenStable();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  async function submit(fixture: { whenStable(): Promise<unknown> }, el: HTMLElement, name: string, password: string) {
    const [nameInput, passwordInput] = el.querySelectorAll('input');
    nameInput.value = name;
    nameInput.dispatchEvent(new Event('input'));
    passwordInput.value = password;
    passwordInput.dispatchEvent(new Event('input'));
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
  }

  const button = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(text));

  it('signs in to an existing account and goes home', async () => {
    load.mockResolvedValue({ version: 1, items: { 1: testProgress() }, sessions: [] });
    const { fixture, el } = await render();
    await submit(fixture, el, '  Olena ', 'pw');

    const hash = await passwordHash('Olena', 'pw');
    expect(load).toHaveBeenCalledWith({ name: 'Olena', hash });
    expect(TestBed.inject(UserService).current()).toEqual({ name: 'Olena', hash });
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('asks before creating an account for an unknown name, then creates it with one click', async () => {
    const { fixture, el } = await render();
    await submit(fixture, el, 'Olena', 'pw');

    expect(el.textContent).toContain('No account “Olena” yet');
    expect(save).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();

    button(el, 'Create account')!.click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));

    expect(save).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(UserService).current()?.name).toBe('Olena');
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('shows a wrong password and stays', async () => {
    load.mockRejectedValue(new WrongPasswordError('Olena'));
    const { fixture, el } = await render();
    await submit(fixture, el, 'Olena', 'nope');

    expect(el.querySelector('.error')?.textContent).toContain('Wrong password for Olena');
    expect(TestBed.inject(UserService).current()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the server cannot be reached',
      new HttpErrorResponse({ status: 0 }),
      'Could not reach the server',
    ],
    [
      'the server fails',
      new HttpErrorResponse({ status: 500 }),
      'Something went wrong on the server',
    ],
    [
      'the data cannot be read',
      new Error('could not be read'),
      'Something went wrong on the server',
    ],
    [
      'the name was taken meanwhile',
      new ConflictError('Olena'),
      'Olena was just set up on another device',
    ],
    ['the page is not secure', new InsecureContextError(), 'needs a secure (https) page'],
  ])('shows when %s', async (_, error, message) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    load.mockRejectedValue(error);
    const { fixture, el } = await render();
    await submit(fixture, el, 'Olena', 'pw');
    expect(el.querySelector('.error')?.textContent).toContain(message);
    expect(TestBed.inject(UserService).current()).toBeNull();
    vi.restoreAllMocks();
  });

  it('shows a wrong password when the name was claimed while the account was being saved', async () => {
    save.mockRejectedValue(new WrongPasswordError('Olena'));
    const { fixture, el } = await render();
    await submit(fixture, el, 'Olena', 'pw');
    button(el, 'Create account')!.click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    expect(el.querySelector('.error')?.textContent).toContain('Wrong password for Olena');
  });

  it.each([
    ['a/b', 'pw', 'letters, digits'],
    ['Olena', '', 'any password'],
  ])('checks the form first (%j / %j)', async (name, password, message) => {
    const { fixture, el } = await render();
    await submit(fixture, el, name, password);
    expect(el.querySelector('.error')?.textContent).toContain(message);
    expect(load).not.toHaveBeenCalled();
  });

  it('keeps the current account for an invalid name', async () => {
    const users = TestBed.inject(UserService);
    users.signIn({ name: 'Andrii', hash: 'a'.repeat(64) });
    const { fixture, el } = await render();
    await submit(fixture, el, '@@@', 'pw');
    expect(users.current()?.name).toBe('Andrii');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('mentions that guest progress is added', async () => {
    TestBed.inject(QuizService).progress.set({ version: 1, items: { 1: testProgress(), 2: testProgress() }, sessions: [] });
    const { el } = await render();
    expect(el.textContent).toContain('The 2 expressions you practised as guest are added');
  });

  it('lists accounts used before and switches with one click', async () => {
    const users = TestBed.inject(UserService);
    const olena = { name: 'Olena', hash: 'b'.repeat(64) };
    users.signIn(olena);
    users.signIn({ name: 'Andrii', hash: 'a'.repeat(64) });
    load.mockResolvedValue({ version: 1, items: {}, sessions: [] });
    const { fixture, el } = await render();

    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.known .name')];
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Andrii', 'Olena']);
    buttons[1].click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));
    expect(users.current()).toEqual(olena);
    expect(navigate).toHaveBeenCalledWith(['/']);
  });

  it('asks for a password for a name used before passwords existed', async () => {
    localStorage.setItem(CURRENT_USER_KEY, 'Olena'); // read when UserService is first created
    const { fixture, el } = await render();
    el.querySelector<HTMLButtonElement>('.known .name')!.click();
    await fixture.whenStable();

    const [nameInput, passwordInput] = el.querySelectorAll('input');
    expect(nameInput.value).toBe('Olena');
    expect(document.activeElement).toBe(passwordInput);
    expect(load).not.toHaveBeenCalled();
  });

  it('prefills the name from the link', async () => {
    TestBed.resetTestingModule();
    setup({ name: 'Olena' });
    const { el } = await render();
    expect(el.querySelector('input')!.value).toBe('Olena');
  });

  it('removes a name from the list', async () => {
    TestBed.inject(UserService).signIn({ name: 'Olena', hash: 'b'.repeat(64) });
    const { fixture, el } = await render();
    el.querySelector<HTMLButtonElement>('.known .forget')!.click();
    await fixture.whenStable();
    expect(el.querySelector('.known')).toBeNull();
  });

  it('goes back to guest progress when the current name is removed', async () => {
    const users = TestBed.inject(UserService);
    const quiz = TestBed.inject(QuizService);
    users.signIn({ name: 'Olena', hash: 'b'.repeat(64) });
    quiz.progress.set({ version: 1, items: { 1: testProgress() }, sessions: [] }); // Olena's
    const { fixture, el } = await render();
    el.querySelector<HTMLButtonElement>('.known .forget')!.click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));

    expect(users.current()).toBeNull();
    expect(quiz.progress().items).toEqual({}); // the guest's, not Olena's
    expect(el.textContent).not.toContain('practised as guest');
  });

  it('cannot remove a name or submit again while signing in', async () => {
    let finish!: () => void;
    load.mockReturnValue(new Promise((resolve) => (finish = () => resolve(null))));
    TestBed.inject(UserService).signIn({ name: 'Olena', hash: 'b'.repeat(64) });
    const { fixture, el } = await render();
    await submit(fixture, el, 'Andrii', 'pw');

    expect(el.querySelector<HTMLButtonElement>('.known .forget')!.disabled).toBe(true);
    el.querySelector('form')!.dispatchEvent(new Event('submit'));
    expect(load).toHaveBeenCalledTimes(1);
    finish();
  });
});
