/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import chalk from "chalk";
import { HIR, HIRFunction, ReactiveFunction } from "../HIR/HIR";
import { printFunction, printHIR } from "../HIR/PrintHIR";
import { printReactiveFunction } from "../ReactiveScopes";

let ENABLED: boolean = false;

let lastLogged: string;

export function toggleLogging(enabled: boolean): void {
  ENABLED = enabled;
}

export function logHIR(step: string, ir: HIR): void {
  if (ENABLED) {
    const printed = printHIR(ir);
    if (printed !== lastLogged) {
      lastLogged = printed;
      process.stdout.write(`${chalk.green(step)}:\n${printed}\n\n`);
    } else {
      process.stdout.write(`${chalk.blue(step)}: (no change)\n\n`);
    }
  }
}

export function logHIRFunction(step: string, fn: HIRFunction): void {
  if (ENABLED) {
    const printed = printFunction(fn);
    if (printed !== lastLogged) {
      lastLogged = printed;
      process.stdout.write(`${chalk.green(step)}:\n${printed}\n\n`);
    } else {
      process.stdout.write(`${chalk.blue(step)}: (no change)\n\n`);
    }
  }
}

export function logReactiveFunction(step: string, fn: ReactiveFunction): void {
  if (ENABLED) {
    const printed = printReactiveFunction(fn);
    if (printed !== lastLogged) {
      lastLogged = printed;
      process.stdout.write(`${chalk.green(step)}:\n${printed}\n\n`);
    } else {
      process.stdout.write(`${chalk.blue(step)}: (no change)\n\n`);
    }
  }
}

export function log(fn: () => string): void {
  if (ENABLED) {
    const message = fn();
    process.stdout.write(message.trim() + "\n\n");
  }
}
