import { CELLA_REMOTE_NAME, CELLA_REMOTE_URL } from '#/constants';
import type { AddRemoteOptions } from '#/modules/cli';
import { gitRemoteAdd, gitRemoteGetUrl, gitRemoteRemove } from '#/utils/git';

/**
 * Adds or updates the upstream remote for the Cella template.
 */
export async function addRemote({
  targetFolder,
  remoteUrl = CELLA_REMOTE_URL,
  remoteName = CELLA_REMOTE_NAME,
}: AddRemoteOptions): Promise<void> {
  // Check if the remote exists
  let remote: string | null = null;

  try {
    remote = await gitRemoteGetUrl(targetFolder, remoteName);
  } catch {
    // If the remote doesn't exist, it throws a fatal error
    remote = null;
  }

  // Add or update the remote if it doesn't exist or differs from `remoteUrl`
  if (!remote) {
    await gitRemoteAdd(targetFolder, remoteName, remoteUrl);
  } else if (remote !== remoteUrl) {
    // Remove existing remote and set the new URL
    await gitRemoteRemove(targetFolder, remoteName);
    await gitRemoteAdd(targetFolder, remoteName, remoteUrl);
  }
}
