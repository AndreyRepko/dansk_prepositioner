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

  const ANDRII = { name: 'Andrii', hash: 'a'.repeat(64) };
  const OLENA = { name: 'Olena', hash: 'b'.repeat(64) };

  const create = () => {
    TestBed.resetTestingModule();
    return TestBed.inject(UserService);
  };

  it('starts as guest', () => {
    const users = create();
    expect(users.current()).toBeNull();
    expect(users.known()).toEqual([]);
  });

  it('remembers the signed-in account and the list of accounts across visits', () => {
    const users = create();
    users.signIn(OLENA);
    users.signIn(ANDRII);

    const again = create();
    expect(again.current()).toEqual(ANDRII);
    expect(again.known()).toEqual([ANDRII, OLENA]);
  });

  it('moves a re-used name to the front without duplicating it (case-insensitive)', () => {
    const users = create();
    users.signIn(ANDRII);
    users.signIn(OLENA);
    const lower = { name: 'andrii', hash: ANDRII.hash };
    users.signIn(lower);
    expect(users.known()).toEqual([lower, OLENA]);
  });

  it('signs out to guest, keeping the name in the list', () => {
    const users = create();
    users.signIn(ANDRII);
    users.signOut();
    expect(users.current()).toBeNull();
    expect(users.known()).toEqual([ANDRII]);
    expect(create().current()).toBeNull();
  });

  it('forgets a name; forgetting the current one signs out', () => {
    const users = create();
    users.signIn(OLENA);
    users.signIn(ANDRII);
    users.forget('Olena');
    expect(users.known()).toEqual([ANDRII]);
    expect(users.current()).toEqual(ANDRII);

    users.forget('ANDRII');
    expect(users.current()).toBeNull();
    expect(create().current()).toBeNull();
  });

  it('keeps names stored before passwords existed, as guest, without a password', () => {
    localStorage.setItem(CURRENT_USER_KEY, 'Andrii');
    localStorage.setItem(KNOWN_USERS_KEY, JSON.stringify(['Andrii', 'Olena']));
    const users = create();
    expect(users.current()).toBeNull();
    expect(users.known()).toEqual([
      { name: 'Andrii', hash: null },
      { name: 'Olena', hash: null },
    ]);
  });

  it.each(['123', 'null'])(
    'keeps an old current name that was missing from the list, even %j',
    (name) => {
      localStorage.setItem(CURRENT_USER_KEY, name);
      expect(create().known()).toEqual([{ name, hash: null }]);
    },
  );

  it('ignores unreadable stored values', () => {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify({ name: 'Andrii', hash: 'nope' }));
    localStorage.setItem(KNOWN_USERS_KEY, '{not json');
    const users = create();
    expect(users.current()).toBeNull();
    expect(users.known()).toEqual([]);

    localStorage.setItem(KNOWN_USERS_KEY, JSON.stringify([ANDRII, 5, 'a/b', { name: 'x/y', hash: OLENA.hash }]));
    expect(create().known()).toEqual([ANDRII]);
  });

  it('works for this visit when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError');
    });
    const users = create();
    users.signIn(ANDRII);
    expect(users.current()).toEqual(ANDRII);
    vi.restoreAllMocks();
  });
});
