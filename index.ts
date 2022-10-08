import { Command } from "https://esm.sh/commander";
import {
  createBranch,
  pushBranch,
  undoCommit,
  updateBranch,
} from "./commands/git/actions.ts";
import { tasksAction } from "./commands/clickup/actions.ts";

const program = new Command();

program
  .name("dev-cli")
  .description("Tools for development")
  .version("1.0.0");

program.command("branch")
  .description("creates a new branch")
  .argument(
    "<branchName>",
    "name of the branch to create, stashes all current changes that are not committed",
  )
  .action(async (branchName) => {
    await createBranch(branchName);
  });

program.command("undo_commit")
  .description("undo the last commit")
  .action(async () => {
    await undoCommit();
  });

program.command("push")
  .description("pushes the current branch")
  .action(async () => {
    await pushBranch();
  });

program.command("update_branch")
  .description("updates the current branch")
  .action(async () => {
    await updateBranch();
  });

program.command("tasks")
  .description("connects to clickup tasks")
  .action(async () => {
    await tasksAction();
  });

program.parse();
