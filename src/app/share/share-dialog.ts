import { ChangeDetectionStrategy, Component, ElementRef, signal, viewChild } from '@angular/core';
import { APP_URL } from './share-url';

@Component({
  selector: 'app-share-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="card" aria-labelledby="share-title" (click)="closeOnBackdrop($event)">
      <div class="body">
        <h2 id="share-title">Open on another device</h2>
        <!-- white behind the code so phones can scan it in dark mode too -->
        <img class="qr" src="qr.svg" width="200" height="200" alt="QR code for {{ url }}" />
        <p class="url">{{ url }}</p>
        <div class="actions">
          <button class="primary" (click)="copy()">{{ copied() ? 'Copied' : 'Copy link' }}</button>
          @if (canShare) {
            <button (click)="share()">Share…</button>
          }
          <button (click)="close()">Close</button>
        </div>
        @if (copyFailed()) {
          <p class="error small">Copy failed – select the link above.</p>
        }
        <p class="muted small">Progress is saved per device, so a new device starts from zero.</p>
      </div>
    </dialog>
  `,
  styles: `
    dialog {
      max-width: min(360px, calc(100vw - 2rem));
      padding: 0;
      text-align: center;
    }
    .body {
      padding: 1rem 1.25rem;
    }
    dialog::backdrop {
      background: rgb(0 0 0 / 0.5);
    }
    h2 {
      margin-top: 0;
    }
    .qr {
      display: block;
      margin: 0 auto;
      padding: 8px;
      background: #fff;
      border-radius: 8px;
    }
    .url {
      word-break: break-all;
      user-select: all;
    }
    .actions {
      justify-content: center;
    }
    .small {
      font-size: 0.9rem;
      margin: 0.75rem 0 0;
    }
  `,
})
export class ShareDialog {
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private copiedTimer?: ReturnType<typeof setTimeout>;

  protected readonly url = APP_URL;
  protected readonly canShare = typeof navigator !== 'undefined' && 'share' in navigator;
  protected readonly copied = signal(false);
  protected readonly copyFailed = signal(false);

  open(): void {
    this.copied.set(false);
    this.copyFailed.set(false);
    this.dialog().nativeElement.showModal();
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected closeOnBackdrop(event: MouseEvent): void {
    // The dialog has no padding, so only backdrop clicks target the dialog element itself.
    if (event.target === this.dialog().nativeElement) this.close();
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(APP_URL);
      this.copyFailed.set(false);
      this.copied.set(true);
      clearTimeout(this.copiedTimer);
      this.copiedTimer = setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copyFailed.set(true);
    }
  }

  protected async share(): Promise<void> {
    try {
      await navigator.share({ title: 'Danske præpositioner', url: APP_URL });
    } catch (e) {
      // AbortError = the user closed the share sheet.
      if ((e as DOMException).name !== 'AbortError') console.error(e);
    }
  }
}
