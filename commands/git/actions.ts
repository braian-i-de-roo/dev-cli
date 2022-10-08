import { exec } from "https://deno.land/x/exec/mod.ts";

const configFileName = ".dev_cli_git_config.json";

type GitConfig = {
  defaultBranch: string;
};

const getConfigFile = async (): Promise<GitConfig | null> => {
  try {
    const res = await Deno.readTextFile(`./${configFileName}`);
    return JSON.parse(res);
  } catch (e) {
    return null;
  }
};

const writeConfigFile = async (config: GitConfig): Promise<void> => {
  await Deno.writeTextFile(`./${configFileName}`, JSON.stringify(config));
};

export const getDefaultBranch = async (): Promise<string> => {
  const configFile = await getConfigFile();
  if (configFile) {
    return configFile.defaultBranch;
  }
  const defaultBranchRes = await exec(
    "git remote show origin | grep 'HEAD branch' | cut -d' ' -f5",
  );
  if (defaultBranchRes.status.success) {
    const defaultBranch = (defaultBranchRes.output as string).trim();
    await writeConfigFile({
      defaultBranch: defaultBranch,
    });
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
    const res = await exec(
      `git checkout ${defaultBranch} && git pull && git checkout -b ${branchName}`,
    );
    if (!res.status.success) {
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
