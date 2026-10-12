// GitHub'dan çekilen ham verinin ortak şeması (api, web ve script'ler aynı tipi kullanır).

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
  forks: number;
  pushedAt: string | null;
  languages: RepoLanguage[];
}

export interface GitHubData {
  login: string;
  fetchedAt: string;
  sample?: boolean;
  contributions: ContributionDay[];
  repos: RepoSummary[];
}
