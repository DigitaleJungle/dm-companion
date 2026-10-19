/** Compares dotted version numbers numerically ("2.10.0" > "2.9.1"); a leading "v" is ignored. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => v.trim().replace(/^v/i, "").split(/[.-]/).map((p) => parseInt(p, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export class UpdateCheckError extends Error {}

/**
 * The latest release version of a GitHub repo the user configured, e.g. "2.39.0".
 * Only the release *version* is read; nothing is downloaded.
 */
export async function latestReleaseVersion(repo: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
    });
  } catch {
    throw new UpdateCheckError("offline");
  }
  if (response.status === 404) throw new UpdateCheckError("notFound");
  if (!response.ok) throw new UpdateCheckError(`HTTP ${response.status}`);
  const release = (await response.json()) as { tag_name?: string };
  if (!release.tag_name) throw new UpdateCheckError("noTag");
  return release.tag_name.replace(/^v/i, "");
}
