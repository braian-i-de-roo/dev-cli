import inquirer from "npm:inquirer";
import {createBranch, createDraftPullRequest, pushBranch} from "../git/actions.ts";
import {exec} from "https://deno.land/x/exec/mod.ts";
import chalk from "https://esm.sh/chalk";
import {
  getCachedConfig,
  getConfig,
  getPrivateConfig,
  writeCachedConfig,
  writeConfig,
  writePrivateConfig
} from "../../utils/configUtils.ts";

enum PriorityType {
  URGENT = "urgent",
  HIGH = "high",
  NORMAL = "normal",
  LOW = "low",
}

let clickupToken = "";
try {
  clickupToken = await getPrivateConfig<string>('clickupToken')
} catch (_e) {
  throw new Error("Clickup token not found");
}

const clickupApiUrl = "https://api.clickup.com/api/v2";


const clickupRequest = (url: string, data?: Record<string, unknown>) => {
  return fetch(`${clickupApiUrl}${url}`, {
    ...data,
    headers: {
      "Content-Type": "application/json",
      "Authorization": clickupToken,
    },
  });
};

const getUser = (): Promise<User> => {
  return clickupRequest("/user")
    .then((res) => res.json())
    .then((resJson) => resJson.user);
}

const getUserId = async (config?: PersonalClickupConfig): Promise<number> => {
  if (config?.userId) {
    return config.userId;
  }
  const user = await getUser();
  const newConfig = {
    ...config,
    userId: user.id,
  }
  await writePrivateConfig('clickup_private', newConfig);
  return user.id;
}

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
  await writeConfig('clickup', newConfig);
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
  await writeConfig('clickup', newConfig);
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
  await writeConfig('clickup', newConfig);
  return {
    body: folder.id,
    clickupConfig: newConfig,
  };
};

export const getCurrentSprintListId = async (
  config: ClickupConfig,
): Promise<InnerResponse<number>> => {
  const cache = await getCachedConfig<ClickupCache>("clickup").catch(() => null);
  if (cache) {
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
  if (resJson.lists && resJson.lists.length > 0) {
    const list = resJson.lists[resJson.lists.length - 1];
    const newCache = {
      currentSprintListId: list.id,
      date: new Date().getTime(),
    };
    await writeCachedConfig("clickup", newCache, 86400);
    return {
      body: list.id,
      clickupConfig: newConfig,
    };
  } else {
    return {
      body: null,
      clickupConfig: newConfig,
    };
  }
};

const moveTask = (taskId: number, status: string) => {
  return clickupRequest(`/task/${taskId}`, {
    method: "PUT",
    body: JSON.stringify({
      status,
    }),
  });
};

const getBacklogFolderId = async (config: ClickupConfig) => {
  if (config.backlogFolderId) {
    return {
      body: config.backlogFolderId,
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
    folder.name === updatedConfig.backlogFolderName
  );
  const newConfig = {
    ...updatedConfig,
    backlogFolderId: folder.id,
  };
  await writeConfig('clickup', newConfig);
  return {
    body: folder.id,
    clickupConfig: newConfig,
  };
}

const getBacklogListsIds = async (config: ClickupConfig): Promise<string[]> => {
  if (config.backlogLists) {
    return config.backlogLists;
  }
  let folderId;
  let newConfig = config;
  if (!config.backlogFolderId) {
    const { body, clickupConfig } = await getBacklogFolderId(config);
    folderId = body;
    newConfig = clickupConfig;
  } else {
    folderId = config.backlogFolderId;
  }
  const res = await clickupRequest(`/folder/${folderId}/list`);
  const resJson = await res.json();
  const lists = resJson.lists.map((list: List) => list.id);
  const newConfigWithLists = {
    ...newConfig,
    backlogLists: lists,
  }
  await writeConfig('clickup', newConfigWithLists);
  return lists;
}

const getBacklogTasks = async (config: ClickupConfig, userId: number): Promise<Task[]> => {
  const backlogLists = await getBacklogListsIds(config);
  const tasks = await Promise.all(backlogLists.map(async (list: string) => {
    const res = await clickupRequest(`/list/${list}/task?statuses[]=open&statuses[]=to do&assignees[]=${userId}`);
    const resJson = await res.json();
    return resJson.tasks
      .filter((task: Task) => task.assignees.length !== 0)
  }))
  return tasks.flat();
}

const getOpenTasks = async (config: ClickupConfig, userId: number): Promise<Task[]> => {
  const { body: listId } = await getCurrentSprintListId(config);
  const res = await clickupRequest(`/list/${listId}/task?statuses[]=open&statuses[]=to do&assignees[]=${userId}`);
  const resJson = await res.json();
  return resJson.tasks
};

const orderTasks = (tasks: Task[]): Task[] => {
  return tasks.sort((task1: Task, task2: Task) => {
    const priority1 = task1.priority? task1.priority.priority : PriorityType.NORMAL
    const priority2 = task2.priority? task2.priority.priority : PriorityType.NORMAL
    if (priority1 === priority2) {
      return 0;
    }
    if (priority1 === PriorityType.URGENT || priority2 === PriorityType.LOW) {
      return -1;
    }
    if (priority1 === PriorityType.LOW || priority2 === PriorityType.URGENT) {
      return 1;
    }
    if (priority1 === PriorityType.HIGH || priority2 === PriorityType.NORMAL) {
      return -1;
    }
    if (priority1 === PriorityType.NORMAL || priority2 === PriorityType.HIGH) {
      return 1;
    }
  })
}

const getAllOpenTasks = async (): Promise<Task[]> => {
  const config = await getConfig<ClickupConfig>("clickup");
  let personalConfig
  try {
    personalConfig = await getPrivateConfig<PersonalClickupConfig>("clickup_private");
  } catch (_e) {
    personalConfig = undefined;
  }
  const userId = await getUserId(personalConfig);
  if (!config) {
    throw new Error("Clickup config file not found");
  }
  const tasks = await getOpenTasks(config, userId);
  const backlogTasks = await getBacklogTasks(config, userId);
  const unorderedTasks = [...tasks, ...backlogTasks]
  return orderTasks(unorderedTasks);
}

const getPriorityString = (priority: Priority | null): string => {
  let text
  if (priority) {
    switch (priority.priority) {
      case PriorityType.URGENT:
        text = chalk.red.bold("Urgent");
        break;
      case PriorityType.HIGH:
        text = chalk.yellow("High");
        break;
      case PriorityType.NORMAL:
        text =chalk.blue("Normal");
        break;
      case PriorityType.LOW:
        text = chalk.grey("Low");
        break
      default:
        text = chalk.grey("Low");
    }
  } else {
    text = chalk.blue("Normal")
  }
  return `${chalk.white("[")}${text}${chalk.white("]")}`
}

const getTagString = (tag: Tag): string => {
  switch (tag.name) {
    case "bug":
      return chalk.bgRed("Bug");
    case "blocked":
      return chalk.bgRed("Blocked");
    case "web":
      return chalk.bgBlue("Web");
    case "mobile":
      return chalk.bgBlue("Mobile");
    case "backend":
      return chalk.bgBlue("Backend");
    default:
      return chalk.bgGrey(tag.name);
  }
}

const getTagsString = (tags: Tag[]): string => {
  if (tags.length === 0) {
    return "";
  }
  const aux = tags.map((tag) => getTagString(tag));
  return `${chalk.white("[")}${aux.join(" ")}${chalk.white("]")}`;
}

const chooseTask = (tasks: Task[]): Promise<Task> => {
  return inquirer.prompt([
    {
      type: "list",
      name: "SelectedTask",
      message: "Select a task",
      choices: tasks.map((task: Task) => {
        const aux = task.name
        const priorityString = getPriorityString(task.priority)
        const tagsString = getTagsString(task.tags)
        return `${aux} ${priorityString} ${tagsString}`
      }),
    },
  ])
    .then((answers: { SelectedTask: string }) => {
      return tasks.find((task: Task) => task.name === answers.SelectedTask);
    });
};

const genPrName = (task: Task): string => {
  const bugReplace = task.name.replace("[BUG]", "Fix:");
  return bugReplace.replace("[FEATURE]", "Feature:");
}

const genBranchName = (task: Task): string => {
  return task.name
    .replace(/[^a-zA-Z0\d\-\[\] ]/g, "")
    .replace("[BUG] ", "fix/")
    .replace("[FEATURE] ", "feature/")
    .toLowerCase()
    .replace(/\s+/g, "-")
}

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
    console.log('moving task to "In Progress"');
    await moveTask(task.id, "In Progress");
    const prName = `[${task.id}] ${genPrName(task)}`;
    const branchName = genBranchName(task);
    console.log('creating branch');
    await createBranch(branchName);
    console.log('creating empty commit');
    await exec(`git commit --allow-empty -m "create draft PR"`);
    console.log('pushing branch');
    await pushBranch();
    console.log('creating draft PR');
    await createDraftPullRequest(task.id, prName, branchName);
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
  const tasks = await getAllOpenTasks();
  const selectedTask = await chooseTask(tasks);
  await taskActionLoop(selectedTask, false);
};
