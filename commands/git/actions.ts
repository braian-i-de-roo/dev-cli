import { exec } from "https://deno.land/x/exec/mod.ts";
import {getConfig, getPrivateConfig, writeConfig} from "../../utils/configUtils.ts";

let githubToken = "";
try {
  githubToken = await getPrivateConfig<string>("github_token");
} catch (e) {
  throw new Error("Github token not found");
}

const githubApiUrl = "https://api.github.com/repos"

type GitConfig = {
  defaultBranch?: string;
  githubRepoOwner: string;
  githubRepoName: string;
};

const githubRequest = (config: GitConfig, url: string, data?: Record<string, unknown>) => {
  return fetch(`${githubApiUrl}/${config.githubRepoOwner}/${config.githubRepoName}${url}`, {
    ...data,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${githubToken}`,
    }
  })
}

export const getDefaultBranch = async (): Promise<string> => {
  const configFile = await getConfig<GitConfig>('git');
  if (!configFile) {
    throw new Error("config file not found");
  }
  if (configFile.defaultBranch) {
    return configFile.defaultBranch;
  }
  const defaultBranchRes = await exec(
    "git remote show origin | grep 'HEAD branch' | cut -d' ' -f5",
  );
  if (defaultBranchRes.status.success) {
    const defaultBranch = (defaultBranchRes.output as string).trim();
    await writeConfig<GitConfig>('git', {
      defaultBranch: defaultBranch,
      githubRepoOwner: configFile.githubRepoOwner,
      githubRepoName: configFile.githubRepoName,
    })
    return defaultBranch;
  }
  throw new Error("could not get default branch");
};

export const checkDirtyBranch = async (): Promise<boolean> => {
  const res = await exec("git status --porcelain");
  if (res.status.success) {
    return res.output !== "";
  }
  throw new Error("could not check if branch is dirty");
};

export const getCurrentBranch = async (): Promise<string> => {
  const res = await exec("git branch --show-current");
  if (res.status.success) {
    return res.output.trim();
  }
  throw new Error("could not get current branch");
};

export const getStashName = async (): Promise<string> => {
  const branchName = await getCurrentBranch();
  const formattedNow = new Date().toISOString().replace(/:/g, "-");
  return `${branchName}_${formattedNow}`;
};

export const stashCurrent = async (stashName?: string): Promise<void> => {
  const name = stashName || await getStashName();
  const res = await exec(`git stash save -u -m ${name}`);
  if (!res.status.success) {
    throw new Error("could not stash current branch");
  }
};

export const createBranch = async (branchName: string): Promise<void> => {
  if (branchName) {
    const defaultBranch = await getDefaultBranch();
    const isDirty = await checkDirtyBranch();
    if (isDirty) {
      await stashCurrent();
    }
    console.log('checking out default branch');
    await exec(`git checkout ${defaultBranch}`);
    console.log('updating default branch');
    await exec(`git pull`);
    console.log('creating new branch from default')
    const branchRes = await exec(`git checkout -b ${branchName}`);
    if (!branchRes.status.success) {
      throw new Error("could not create branch");
    }
  }
};

export const undoCommit = async (): Promise<void> => {
  const res = await exec("git reset --soft HEAD~1");
  if (!res.status.success) {
    throw new Error("could not undo commit");
  }
};

export const pushBranch = async (): Promise<void> => {
  const res = await exec("git push -u origin HEAD");
  if (!res.status.success) {
    throw new Error("could not push branch");
  }
};

export const updateBranch = async (): Promise<void> => {
  const defaultBranch = await getDefaultBranch();
  const res = await exec(
    `git fetch origin ${defaultBranch} : ${defaultBranch} && git merge ${defaultBranch}`,
  );
  if (!res.status.success) {
    throw new Error("could not update branch");
  }
};

const createPullRequest = async (
  taskId: number,
  prName: string,
  branchName: string,
  extraData?: Record<string, unknown>
): Promise<void> => {
  const configFile = await getConfig<GitConfig>('git');
  if (!configFile) {
    throw new Error("config file not found");
  }
  const res = await githubRequest(configFile, "/pulls", {
    method: "POST",
    body: JSON.stringify({
      title: prName,
      head: branchName,
      base: await getDefaultBranch(),
      body: `Card [[${taskId}]](https://app.clickup.com/t/${taskId})`,
      ...extraData,
    }),
  });
  if (!res.ok) {
    const response = await res.json()
    throw new Error(response.message);
  }
}

export const createDraftPullRequest = async (taskId: number, prName: string, branchName: string): Promise<void> => {
  try {
    await createPullRequest(taskId, prName, branchName, { draft: true });
  } catch (e) {
    if (e.message === 'Draft pull requests are not supported in this repository.') {
      console.log('draft pull requests are not supported on this repository, creating regular pull request');
      await createPullRequest(taskId, prName, branchName);
    } else {
      throw new Error("could not create pull request");
    }
  }
}
