import { TestBed } from '@angular/core/testing';
import { cleanName, nameKey } from './user-name';
import { CURRENT_USER_KEY, KNOWN_USERS_KEY, UserService } from './user.service';

describe('cleanName', () => {
  it.each([
    ['  Andrii ', 'Andrii'],
    ['Søren   Ærø', 'Søren Ærø'],
    ['Олена', 'Олена'],
    ["O'Neil", "O'Neil"],
    ['anna-2', 'anna-2'],
  ])('accepts %j as %j', (raw, name) => {
    expect(cleanName(raw)).toBe(name);
  });

  it.each(['', '   ', '.hidden', 'a/b', 'a#b', 'what?', 'x'.repeat(31), 'bell\u0007'])('rejects %j', (raw) => {
    expect(cleanName(raw)).toBeNull();
  });

  it('normalizes to NFC so composed and decomposed letters are the same name', () => {
    expect(cleanName('Råby')).toBe('Råby');
  });

  it('is case-insensitive for keys', () => {
    expect(nameKey('ANDRII')).toBe(nameKey('andrii'));
  });
});

describe('UserService', () => {
  beforeEach(() => localStorage.clear());

  const create = () => {
    TestBed.resetTestingModule();
    return TestBed.inject(UserService);
  };

  it('starts without a user', () => {
    const users = create();
    expect(users.current()).toBeNull();
    expect(users.known()).toEqual([]);
  });

  it('remembers the selected name and the list of names across visits', () => {
    const users = create();
    expect(users.select(' Olena ')).toBe('Olena');
    users.select('Andrii');

    const again = create();
    expect(again.current()).toBe('Andrii');
    expect(again.known()).toEqual(['Andrii', 'Olena']);
  });

  it('moves a re-selected name to the front without duplicating it (case-insensitive)', () => {
    const users = create();
    users.select('Andrii');
    users.select('Olena');
    users.select('andrii');
    expect(users.known()).toEqual(['andrii', 'Olena']);
  });

  it('rejects an invalid name and keeps the current one', () => {
    const users = create();
    users.select('Andrii');
    expect(users.select('a/b')).toBeNull();
    expect(users.current()).toBe('Andrii');
  });

  it('forgets a name; forgetting the current one clears it', () => {
    const users = create();
    users.select('Olena');
    users.select('Andrii');
    users.forget('Olena');
    expect(users.known()).toEqual(['Andrii']);
    expect(users.current()).toBe('Andrii');

    users.forget('ANDRII');
    expect(users.current()).toBeNull();
    expect(create().current()).toBeNull();
  });

  it('ignores unreadable stored values', () => {
    localStorage.setItem(CURRENT_USER_KEY, '???');
    localStorage.setItem(KNOWN_USERS_KEY, '{not json');
    const users = create();
    expect(users.current()).toBeNull();
    expect(users.known()).toEqual([]);

    localStorage.setItem(KNOWN_USERS_KEY, JSON.stringify(['Andrii', 5, 'a/b']));
    expect(create().known()).toEqual(['Andrii']);
  });

  it('works for this visit when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const users = create();
    expect(users.select('Andrii')).toBe('Andrii');
    expect(users.current()).toBe('Andrii');
    vi.restoreAllMocks();
  });
});
