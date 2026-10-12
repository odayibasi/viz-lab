// scripts/fetch-data.ts tarafından üretilen data/github.json dosyasının şeması.

export interface ContributionDay {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface RepoLanguage {
  name: string;
  color: string | null;
  size: number; // byte
}

export interface RepoSummary {
  name: string;
  stars: number;
  languages: RepoLanguage[];
}

export interface GitHubData {
  login: string;
  fetchedAt: string;
  sample?: boolean;
  contributions: ContributionDay[];
  repos: RepoSummary[];
}
