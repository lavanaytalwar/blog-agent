const ENDPOINT = 'https://api.linear.app/graphql';

/**
 * Minimal Linear GraphQL client.
 *
 * Linear rejects queries above a complexity budget, so everything here asks for
 * one shallow slice at a time rather than nesting issues inside teams inside
 * projects. Nesting three levels blows the budget on this workspace.
 */
export async function linear<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const key = process.env.LINEAR_API_KEY;
  if (!key) throw new Error('LINEAR_API_KEY is not set. See .env.example.');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { authorization: key, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  const json = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (json.errors?.length) throw new Error(`Linear: ${json.errors.map((e) => e.message).join('; ')}`);
  if (!json.data) throw new Error(`Linear returned no data (${res.status})`);
  return json.data;
}

export type Project = { id: string; name: string; state: string };

export async function listProjects(): Promise<Project[]> {
  const out: Project[] = [];
  let cursor: string | null = null;

  for (;;) {
    const data: { projects: { nodes: Project[]; pageInfo: { hasNextPage: boolean; endCursor: string } } } =
      await linear(
        `query($after: String) {
           projects(first: 100, after: $after) {
             nodes { id name state }
             pageInfo { hasNextPage endCursor }
           }
         }`,
        { after: cursor },
      );
    out.push(...data.projects.nodes);
    if (!data.projects.pageInfo.hasNextPage) break;
    cursor = data.projects.pageInfo.endCursor;
  }
  return out;
}

export type Issue = { id: string; title: string; description: string | null; project: { name: string } | null };

/** Completed issues for one project. Used for capability seeds. */
export async function completedIssues(projectName: string, limit = 100): Promise<Issue[]> {
  const data: { issues: { nodes: Issue[] } } = await linear(
    `query($name: String!, $limit: Int!) {
       issues(first: $limit, filter: {
         project: { name: { eq: $name } },
         state: { type: { eq: "completed" } }
       }) {
         nodes { id title description project { name } }
       }
     }`,
    { name: projectName, limit },
  );
  return data.issues.nodes;
}
