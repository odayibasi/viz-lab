// GitHub GraphQL API'den veri çekip data/github.json dosyasına yazar.
// Kullanım:  GITHUB_TOKEN=xxx GITHUB_LOGIN=kullanici npm run fetch-data
// Token için sadece public okuma yeterli (fine-grained token, "Public repositories (read-only)").
import { graphql } from '@octokit/graphql';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GitHubData } from '../src/lib/types';

const token = process.env.GITHUB_TOKEN;
const login = process.env.GITHUB_LOGIN ?? process.env.GITHUB_REPOSITORY_OWNER;

if (!token || !login) {
  console.error('GITHUB_TOKEN ve GITHUB_LOGIN ortam değişkenleri gerekli (.env.example dosyasına bak).');
  process.exit(1);
}

const query = /* GraphQL */ `
  query ($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          weeks {
            contributionDays { date contributionCount }
          }
        }
      }
      repositories(first: 50, ownerAffiliations: OWNER, isFork: false, orderBy: { field: PUSHED_AT, direction: DESC }) {
        nodes {
          name
          stargazerCount
          languages(first: 10, orderBy: { field: SIZE, direction: DESC }) {
            edges { size node { name color } }
          }
        }
      }
    }
  }
`;

interface Response {
  user: {
    contributionsCollection: {
      contributionCalendar: {
        weeks: { contributionDays: { date: string; contributionCount: number }[] }[];
      };
    };
    repositories: {
      nodes: {
        name: string;
        stargazerCount: number;
        languages: { edges: { size: number; node: { name: string; color: string | null } }[] };
      }[];
    };
  };
}

const res = await graphql<Response>(query, {
  login,
  headers: { authorization: `token ${token}` },
});

const data: GitHubData = {
  login,
  fetchedAt: new Date().toISOString(),
  contributions: res.user.contributionsCollection.contributionCalendar.weeks.flatMap((w) =>
    w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount })),
  ),
  repos: res.user.repositories.nodes.map((r) => ({
    name: r.name,
    stars: r.stargazerCount,
    languages: r.languages.edges.map((e) => ({ name: e.node.name, color: e.node.color, size: e.size })),
  })),
};

const out = resolve(import.meta.dirname, '../data/github.json');
mkdirSync(resolve(out, '..'), { recursive: true });
writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
console.log(`✔ ${data.contributions.length} gün, ${data.repos.length} repo → data/github.json`);
