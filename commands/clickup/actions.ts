import { sub } from "https://cdn.skypack.dev/date-fns";
import inquirer from "npm:inquirer";
import { createBranch } from "../git/actions.ts";

const configFileName = ".dev_cli_clickup_config.json";
const cacheFileName = ".dev_cli_clickup_cache.json";

const tokenFileName = `${Deno.env.get("HOME")}/.clickup_token`;

let clickupToken = "";
try {
  clickupToken = await Deno.readTextFile(tokenFileName);
} catch (e) {
  throw new Error("Clickup token not found");
}

const clickupApiUrl = "https://api.clickup.com/api/v2";

type ClickupConfig = {
  teamName: string;
  teamId?: number;
  spaceName: string;
  spaceId?: number;
  backlogFolderName: string;
  backlogFolderId?: number;
  sprintFolderName: string;
  sprintFolderId?: number;
};

type ClickupCache = {
  currentSprintListId: number;
  date: number;
};

type InnerResponse<T> = {
  body: T;
  clickupConfig: ClickupConfig;
};

type Team = {
  id: number;
  name: string;
};

type Space = {
  id: number;
  name: string;
};

type Folder = {
  id: number;
  name: string;
};

type Task = {
  id: number;
  name: string;
  description: string;
  status: {
    status: string;
  };
};

const getConfigFile = async (): Promise<ClickupConfig | null> => {
  try {
    const res = await Deno.readTextFile(`./${configFileName}`);
    return JSON.parse(res);
  } catch (e) {
    return null;
  }
};

const writeConfigFile = async (config: ClickupConfig): Promise<void> => {
  await Deno.writeTextFile(`./${configFileName}`, JSON.stringify(config));
};

const getCacheFile = async (): Promise<ClickupCache | null> => {
  try {
    const res = await Deno.readTextFile(`./${cacheFileName}`);
    return JSON.parse(res);
  } catch (e) {
    return null;
  }
};

const writeCacheFile = async (cache: ClickupCache): Promise<void> => {
  await Deno.writeTextFile(`./${cacheFileName}`, JSON.stringify(cache));
};

const verifyCache = (cache: ClickupCache): boolean => {
  const yesterday = sub(new Date(), { days: 1 });
  const cacheDate = new Date(cache.date);
  return yesterday < cacheDate;
};

const clickupRequest = (url: string, data?: Record<string, unknown>) => {
  return fetch(`${clickupApiUrl}${url}`, {
    ...data,
    headers: {
      "Authorization": clickupToken,
    },
  });
};

const getTeamId = async (
  config: ClickupConfig,
): Promise<InnerResponse<number>> => {
  if (config.teamId) {
    return {
      body: config.teamId,
      clickupConfig: config,
    };
  }
  const res = await clickupRequest("/team");
  const resJson = await res.json();
  const team = resJson.teams.find((team: Team) =>
    team.name === config.teamName
  );
  const newConfig = {
    ...config,
    teamId: team.id,
  };
  await writeConfigFile(newConfig);
  return {
    body: team.id,
    clickupConfig: newConfig,
  };
};

const getSpaceId = async (
  config: ClickupConfig,
): Promise<InnerResponse<number>> => {
  if (config.spaceId) {
    return {
      body: config.spaceId,
      clickupConfig: config,
    };
  }
  let teamId;
  let updatedConfig = config;
  if (!config.teamId) {
    const { body, clickupConfig } = await getTeamId(config);
    teamId = body;
    updatedConfig = clickupConfig;
  } else {
    teamId = config.teamId;
  }
  const res = await clickupRequest(`/team/${teamId}/space`);
  const resJson = await res.json();
  const space = resJson.spaces.find((space: Space) =>
    space.name === updatedConfig.spaceName
  );
  const newConfig = {
    ...updatedConfig,
    spaceId: space.id,
  };
  await writeConfigFile(newConfig);
  return {
    body: space.id,
    clickupConfig: newConfig,
  };
};

export const getCurrentSprintFolderId = async (
  config: ClickupConfig,
): Promise<InnerResponse<number>> => {
  if (config.sprintFolderId) {
    return {
      body: config.sprintFolderId,
      clickupConfig: config,
    };
  }
  let spaceId;
  let updatedConfig = config;
  if (!config.spaceId) {
    const { body, clickupConfig } = await getSpaceId(config);
    spaceId = body;
    updatedConfig = clickupConfig;
  } else {
    spaceId = config.spaceId;
  }
  const res = await clickupRequest(`/space/${spaceId}/folder`);
  const resJson = await res.json();
  const folder = resJson.folders.find((folder: Folder) =>
    folder.name === updatedConfig.sprintFolderName
  );
  const newConfig = {
    ...updatedConfig,
    sprintFolderId: folder.id,
  };
  await writeConfigFile(newConfig);
  return {
    body: folder.id,
    clickupConfig: newConfig,
  };
};

export const getCurrentSprintListId = async (
  config: ClickupConfig,
): Promise<InnerResponse<number>> => {
  const cache = await getCacheFile();
  if (cache && verifyCache(cache)) {
    return {
      body: cache.currentSprintListId,
      clickupConfig: config,
    };
  }
  let sprintFolderId;
  let newConfig = config;
  if (!config.sprintFolderId) {
    const { body, clickupConfig } = await getCurrentSprintFolderId(config);
    sprintFolderId = body;
    newConfig = clickupConfig;
  } else {
    sprintFolderId = config.sprintFolderId;
  }
  const res = await clickupRequest(`/folder/${sprintFolderId}/list`);
  const resJson = await res.json();
  const list = resJson.lists[resJson.lists.length - 1];
  const newCache = {
    currentSprintListId: list.id,
    date: new Date().getTime(),
  };
  await writeCacheFile(newCache);
  return {
    body: list.id,
    clickupConfig: newConfig,
  };
};

const moveTask = (taskId: number, status: string) => {
  return clickupRequest(`/task/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({
      status,
    }),
  });
};

export const getOpenTasks = async (): Promise<Task[]> => {
  const config = await getConfigFile();
  if (!config) {
    throw new Error("Clickup config file not found");
  }
  const { body: listId } = await getCurrentSprintListId(config);
  const res = await clickupRequest(`/list/${listId}/task`);
  const resJson = await res.json();
  return resJson.tasks
    .filter((task: Task) => {
      const status = task.status.status.toLowerCase();
      return status === "open" || status === "in progress";
    });
};

const chooseTask = (tasks: Task[]): Promise<Task> => {
  return inquirer.prompt([
    {
      type: "list",
      name: "SelectedTask",
      message: "Select a task",
      choices: tasks.map((task: Task) => task.name),
    },
  ])
    .then((answers: { SelectedTask: string }) => {
      return tasks.find((task: Task) => task.name === answers.SelectedTask);
    });
};

const chooseTaskAction = async (task: Task): Promise<boolean> => {
  const actionResponse = await inquirer.prompt([
    {
      type: "list",
      name: "SelectedAction",
      message: "What do you want to do?",
      choices: [
        "Start working on it",
        "View Description",
        "Exit",
      ],
    },
  ])
    .then((answers: { SelectedAction: string }) => {
      return answers.SelectedAction;
    });
  if (actionResponse === "Start working on it") {
    await moveTask(task.id, "In Progress");
    const branchName = `[${task.id}] ${task.name}`;
    await createBranch(branchName);
    return true;
  } else if (actionResponse === "View Description") {
    console.log(task.description);
    return false;
  } else {
    return true;
  }
};

const taskActionLoop = async (
  task: Task,
  wantsToExit: boolean,
): Promise<void> => {
  if (wantsToExit) {
    return;
  }
  return taskActionLoop(task, await chooseTaskAction(task));
};

export const tasksAction = async (): Promise<void> => {
  console.log('fetching tasks...');
  const tasks = await getOpenTasks();
  const selectedTask = await chooseTask(tasks);
  await taskActionLoop(selectedTask, false);
};
