import data from '../../data/praepositioner.json';
import { Category, ExpressionFile, GAP, sentencesOf } from './models/expression';

const CATEGORIES: Category[] = ['tillægsord', 'udsagnsord', 'navneord', 'tid', 'sted', 'faste vendinger'];

// Guards the invariants the quiz relies on, so a bad edit of the data file fails CI instead of the app.
describe('data/praepositioner.json', () => {
  const file = data as ExpressionFile;
  const items = file.udtryk;

  it('has as many items as it claims', () => {
    expect(items.length).toBeGreaterThan(0);
    expect(items.length).toBe(file.antal);
  });

  it('has unique ids (progress is stored by id)', () => {
    expect(new Set(items.map((e) => e.id)).size).toBe(items.length);
  });

  it.each(items.map((e) => [e.id, e] as const))('item %i is a valid question', (_, e) => {
    expect(CATEGORIES).toContain(e.kategori);
    expect(e.engelsk?.trim()).toBeTruthy();
    const sentences = sentencesOf(e);
    expect(sentences.length).toBeGreaterThan(1);
    for (const s of sentences) {
      expect(s.saetning.split(GAP).length).toBe(2);
      expect(s.forkerte.length).toBe(3);
      const options = [e.praeposition, ...s.forkerte].map((o) => o.trim().toLowerCase());
      expect(new Set(options).size).toBe(4);
    }
    // Progress is kept per sentence index, and the same sentence twice would not test anything new.
    expect(new Set(sentences.map((s) => s.saetning)).size).toBe(sentences.length);
  });
});
