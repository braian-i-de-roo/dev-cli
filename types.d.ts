type ClickupConfig = {
  teamName: string;
  teamId?: number;
  spaceName: string;
  spaceId?: number;
  backlogFolderName: string;
  backlogFolderId?: number;
  sprintFolderName: string;
  sprintFolderId?: number;
  backlogLists?: string[];
};

type PersonalClickupConfig = {
  userId: number;
}

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

type Assignee = {
  id: number;
}

type Task = {
  id: number;
  name: string;
  description: string;
  status: {
    status: string;
  };
  priority: Priority | null;
  tags: Tag[];
  assignees: Assignee[];
};

type List = {
  id: number;
}

enum PriorityType {
  URGENT = "urgent",
  HIGH = "high",
  NORMAL = "normal",
  LOW = "low",
}

type Priority = {
  id: string,
  priority: PriorityType,
  color: string,
  orderindex: string,
}

type Tag = {
  name: string,
  tag_fg: string,
  tag_bg: string,
}

type CachedData<A> = {
  lastUpdated: number,
  ttl: number,
  data: A,
}

type User = {
  id: number,
  username: string,
  color: string,
}
