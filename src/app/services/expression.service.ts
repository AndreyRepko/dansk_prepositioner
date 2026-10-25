import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Expression, ExpressionFile } from '../models/expression';

@Injectable({ providedIn: 'root' })
export class ExpressionService {
  private readonly http = inject(HttpClient);
  private loading?: Promise<Expression[]>;

  readonly expressions = signal<Expression[]>([]);

  load(): Promise<Expression[]> {
    this.loading ??= firstValueFrom(this.http.get<ExpressionFile>('data/praepositioner.json')).then(
      (file) => {
        this.expressions.set(file.udtryk);
        return file.udtryk;
      },
      (error) => {
        this.loading = undefined; // allow a retry
        throw error;
      },
    );
    return this.loading;
  }
}
