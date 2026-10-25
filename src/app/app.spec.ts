import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { ExpressionService } from './services/expression.service';
import { testExpression } from './testing/fixtures';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('shows an error when no expressions are loaded', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).querySelector('.error')).toBeTruthy();
  });

  it('renders the router outlet once expressions are loaded', async () => {
    TestBed.inject(ExpressionService).expressions.set([testExpression(1)]);
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.error')).toBeNull();
    expect(el.querySelector('router-outlet')).toBeTruthy();
  });
});
