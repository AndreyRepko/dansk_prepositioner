import { TestBed } from '@angular/core/testing';
import { ShareDialog } from './share-dialog';
import { APP_URL } from './share-url';

describe('ShareDialog', () => {
  // jsdom has neither the clipboard nor the share API; each test installs what it needs.
  function stubNavigator(name: 'clipboard' | 'share', value: unknown): void {
    Object.defineProperty(navigator, name, { value, configurable: true });
  }

  afterEach(() => {
    for (const name of ['clipboard', 'share']) Reflect.deleteProperty(navigator, name);
    vi.restoreAllMocks();
  });

  async function render() {
    const fixture = TestBed.createComponent(ShareDialog);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const button = (label: string) =>
      [...el.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    return { fixture, el, button };
  }

  it('copies the production URL', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubNavigator('clipboard', { writeText });
    const { fixture, button } = await render();

    button('Copy link')!.click();
    await fixture.whenStable();

    expect(writeText).toHaveBeenCalledWith(APP_URL);
    expect(button('Copied')).toBeTruthy();
  });

  it('tells the user when copying fails', async () => {
    stubNavigator('clipboard', { writeText: vi.fn().mockRejectedValue(new Error('denied')) });
    const { fixture, el, button } = await render();

    button('Copy link')!.click();
    await fixture.whenStable();

    expect(el.querySelector('.error')?.textContent).toContain('Copy failed');
  });

  it('hides Share… when the browser cannot share', async () => {
    const { button } = await render();
    expect(button('Share…')).toBeUndefined();
  });

  it('shares the production URL when the browser can share', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    stubNavigator('share', share);
    const { fixture, button } = await render();

    button('Share…')!.click();
    await fixture.whenStable();

    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: APP_URL }));
  });

  it('treats closing the share sheet as normal', async () => {
    stubNavigator('share', vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError')));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { fixture, button } = await render();

    button('Share…')!.click();
    await fixture.whenStable();

    expect(consoleError).not.toHaveBeenCalled();
  });

  it('shows the QR code for the production URL', async () => {
    const { el } = await render();
    const img = el.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('qr.svg');
    expect(img.alt).toContain(APP_URL);
  });
});
