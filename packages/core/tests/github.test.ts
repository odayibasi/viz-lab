import { describe, it, expect, vi } from 'vitest';
import { fetchGitHubData, GitHubError } from '../src';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('fetchGitHubData', () => {
  it('GraphQL cevabını ortak şemaya çevirir', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      ok({
        data: {
          user: {
            login: 'octo',
            contributionsCollection: {
              contributionCalendar: {
                weeks: [{ contributionDays: [{ date: '2026-10-04', contributionCount: 3 }] }],
              },
            },
            repositories: {
              nodes: [{
                name: 'r1', stargazerCount: 5, forkCount: 1, pushedAt: '2026-10-01T00:00:00Z',
                languages: { edges: [{ size: 100, node: { name: 'TypeScript', color: '#3178c6' } }] },
              }],
            },
          },
        },
      }),
    );
    const data = await fetchGitHubData('octo', 'tkn', fetchMock);
    expect(data.contributions).toEqual([{ date: '2026-10-04', count: 3 }]);
    expect(data.repos[0]).toMatchObject({ name: 'r1', stars: 5, forks: 1 });
    expect(fetchMock.mock.calls[0][1].headers.authorization).toBe('bearer tkn');
  });

  it('bilinmeyen kullanıcıda 404 GitHubError fırlatır', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ data: { user: null }, errors: [{ type: 'NOT_FOUND', message: 'x' }] }));
    await expect(fetchGitHubData('yok', 't', fetchMock)).rejects.toMatchObject({ status: 404 });
  });

  it('HTTP hatasını status ile iletir', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad creds', { status: 401 }));
    const err = await fetchGitHubData('octo', 't', fetchMock).catch((e) => e);
    expect(err).toBeInstanceOf(GitHubError);
    expect(err.status).toBe(401);
  });
});
