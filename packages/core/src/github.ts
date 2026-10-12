// GitHub GraphQL istemcisi. Bağımlılık yok, sadece fetch kullanır (Node 18+ ve tarayıcı).
import type { GitHubData } from './types';

const QUERY = /* GraphQL */ `
  query ($login: String!) {
    user(login: $login) {
      login
      contributionsCollection {
        contributionCalendar {
          weeks { contributionDays { date contributionCount } }
        }
      }
      repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: { field: PUSHED_AT, direction: DESC }) {
        nodes {
          name
          stargazerCount
          forkCount
          pushedAt
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name color } }
          }
        }
      }
    }
  }
`;

interface GqlResponse {
  data?: {
    user: {
      login: string;
      contributionsCollection: {
        contributionCalendar: { weeks: { contributionDays: { date: string; contributionCount: number }[] }[] };
      };
      repositories: {
        nodes: {
          name: string;
          stargazerCount: number;
          forkCount: number;
          pushedAt: string | null;
          languages: { edges: { size: number; node: { name: string; color: string | null } }[] };
        }[];
      };
    } | null;
  };
  errors?: { message: string; type?: string }[];
}

export class GitHubError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function fetchGitHubData(
  login: string,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubData> {
  const res = await fetchImpl('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      authorization: `bearer ${token}`,
      'content-type': 'application/json',
      'user-agent': 'viz-lab',
    },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  });
  if (!res.ok) throw new GitHubError(`GitHub API ${res.status}: ${await res.text()}`, res.status);

  const json = (await res.json()) as GqlResponse;
  if (json.errors?.some((e) => e.type === 'NOT_FOUND') || json.data?.user === null) {
    throw new GitHubError(`Kullanıcı bulunamadı: ${login}`, 404);
  }
  if (json.errors?.length || !json.data?.user) {
    throw new GitHubError(json.errors?.map((e) => e.message).join('; ') ?? 'Bilinmeyen hata', 502);
  }
  const user = json.data.user;

  return {
    login: user.login,
    fetchedAt: new Date().toISOString(),
    contributions: user.contributionsCollection.contributionCalendar.weeks.flatMap((w) =>
      w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount })),
    ),
    repos: user.repositories.nodes.map((r) => ({
      name: r.name,
      stars: r.stargazerCount,
      forks: r.forkCount,
      pushedAt: r.pushedAt,
      languages: r.languages.edges.map((e) => ({ name: e.node.name, color: e.node.color, size: e.size })),
    })),
  };
}
