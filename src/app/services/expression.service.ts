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
    this.loading ??= firstValueFrom(this.http.get<ExpressionFile>('data/praepositioner.json'))
      .then((file) => {
        if (!Array.isArray(file?.udtryk) || file.udtryk.length === 0) {
          throw new Error('data/praepositioner.json has no "udtryk" items');
        }
        this.expressions.set(file.udtryk);
        return file.udtryk;
      })
      .catch((error) => {
        this.loading = undefined; // allow a retry
        throw error;
      });
    return this.loading;
  }
}
