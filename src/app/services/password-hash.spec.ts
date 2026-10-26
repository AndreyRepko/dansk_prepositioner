import { isPasswordHash, passwordHash } from './password-hash';

describe('passwordHash', () => {
  it('is SHA-256 hex of password + lower-case name', async () => {
    // node -e "console.log(require('crypto').createHash('sha256').update('pw'+'søren').digest('hex'))"
    const expected = '5b6f888a4a47677e0b92f996db3b9de8037c045545402df6ca80b2203b374973';
    expect(await passwordHash('Søren', 'pw')).toBe(expected);
    expect(await passwordHash('SØREN', 'pw')).toBe(expected);
    expect(isPasswordHash(expected)).toBe(true);
  });

  it('depends on the name, so the same password differs between names', async () => {
    expect(await passwordHash('Andrii', 'pw')).not.toBe(await passwordHash('Olena', 'pw'));
  });

  it.each([null, '', 'a'.repeat(63), 'A'.repeat(64), 'g'.repeat(64)])('rejects %j as a hash', (v) => {
    expect(isPasswordHash(v)).toBe(false);
  });
});
