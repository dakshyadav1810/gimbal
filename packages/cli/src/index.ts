#!/usr/bin/env node
import { Command } from "commander";
import { registerCommands } from "./commands.js";

const program = new Command("gimbal").description(
  "Gimbal — deterministic-first AI-native testing platform",
);
registerCommands(program);
program.parseAsync(process.argv);
