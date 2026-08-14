const REPOSITORY_API = 'https://api.github.com/repos/deepseek-ai/deepseek-harness'
const COMMIT_PATTERN = /^[0-9a-f]{40}$/u
const BRANCH_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/u

/** User-visible result of one official Harness status request. */
export type UpstreamCheckResult =
  | { readonly state: 'current'; readonly currentCommit: string }
  | { readonly state: 'newer'; readonly currentCommit: string; readonly latestCommit: string; readonly commitUrl: URL }
  | { readonly state: 'offline'; readonly message: string }
  | { readonly state: 'malformed'; readonly message: string }

/**
 * Compare the packaged Harness commit with the official default branch.
 * @param fetcher HTTP implementation used for the user-initiated request.
 * @param currentCommit Full packaged upstream commit.
 * @returns A validated status that never mutates the installed runtime.
 */
export async function checkUpstreamStatus(
  fetcher: typeof fetch,
  currentCommit: string,
): Promise<UpstreamCheckResult> {
  if (!COMMIT_PATTERN.test(currentCommit)) return malformed('The packaged Harness commit is invalid.')
  try {
    const repositoryResponse = await fetcher(REPOSITORY_API, { headers: githubHeaders(), redirect: 'error' })
    if (!repositoryResponse.ok) return malformed(`GitHub returned HTTP ${String(repositoryResponse.status)} for the official repository.`)
    const repository = await repositoryResponse.json() as unknown
    const branch = recordString(repository, 'default_branch')
    if (branch === undefined || !validBranch(branch)) return malformed('GitHub returned an invalid official default branch.')

    const commitResponse = await fetcher(`${REPOSITORY_API}/commits/${encodeURIComponent(branch)}`, { headers: githubHeaders(), redirect: 'error' })
    if (!commitResponse.ok) return malformed(`GitHub returned HTTP ${String(commitResponse.status)} for the official branch.`)
    const commit = await commitResponse.json() as unknown
    const latestCommit = recordString(commit, 'sha')
    const htmlUrl = recordString(commit, 'html_url')
    if (latestCommit === undefined || htmlUrl === undefined || !COMMIT_PATTERN.test(latestCommit)) {
      return malformed('GitHub returned invalid official commit identity.')
    }
    const expectedUrl = `https://github.com/deepseek-ai/deepseek-harness/commit/${latestCommit}`
    if (htmlUrl !== expectedUrl) return malformed('GitHub returned an unexpected official commit URL.')
    if (latestCommit === currentCommit) return { state: 'current', currentCommit }
    return { state: 'newer', currentCommit, latestCommit, commitUrl: new URL(htmlUrl) }
  } catch {
    return { state: 'offline', message: 'The official Harness update status could not be reached.' }
  }
}

function githubHeaders(): Headers {
  return new Headers({ Accept: 'application/vnd.github+json', 'User-Agent': 'dsh-desktop-upstream-checker' })
}

function recordString(value: unknown, key: string): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const field = (value as Record<string, unknown>)[key]
  return typeof field === 'string' ? field : undefined
}

function validBranch(value: string): boolean {
  const segments = value.split('/')
  return segments.length > 0 && segments.every(segment => segment !== '' && segment !== '.' && segment !== '..' && BRANCH_SEGMENT_PATTERN.test(segment))
}

function malformed(message: string): UpstreamCheckResult {
  return { state: 'malformed', message }
}
