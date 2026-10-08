#!/usr/bin/env node
import { Command } from "commander";

if (Number(process.versions.node.split(".")[0]) < 22) {
  console.error(
    `Gimbal needs Node 22 or newer (this is ${process.versions.node}). Install it from https://nodejs.org and try again.`,
  );
  process.exit(1);
}

import { registerCommands } from "./commands.js";

const program = new Command("gimbal").description(
  "Gimbal — deterministic-first AI-native testing platform",
);
registerCommands(program);
program.parseAsync(process.argv);
