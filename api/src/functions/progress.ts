import { app, HttpResponseInit } from '@azure/functions';
import { handleProgress } from '../handler.js';
import { TableProgressRepo } from '../progress-repo.js';

let repo: TableProgressRepo | undefined;

function getRepo(): TableProgressRepo {
  const connectionString = process.env['TABLES_CONNECTION_STRING'];
  if (!connectionString) throw new Error('TABLES_CONNECTION_STRING is not set');
  repo ??= TableProgressRepo.fromConnectionString(connectionString);
  return repo;
}

app.http('progress', {
  route: 'progress/{name}',
  methods: ['GET', 'PUT'],
  authLevel: 'anonymous',
  handler: async (request, context): Promise<HttpResponseInit> => {
    try {
      const body = request.method === 'PUT' ? await request.text() : undefined;
      const reply = await handleProgress(request.method, request.params['name'], body, getRepo());
      return {
        status: reply.status,
        body: reply.body,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      };
    } catch (e) {
      context.error('progress request failed', e);
      return { status: 500, headers: { 'Cache-Control': 'no-store' } };
    }
  },
});
