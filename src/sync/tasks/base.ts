// BaseTask — abstract base for all sync task types

import type { Vault } from 'obsidian';
import type { SyncBackend } from '../backend/interface';
import type { SyncRecordData, TaskResult, TaskKind } from '../types';
import { TaskError as TaskErrorClass } from '../types';

export { TaskErrorClass as TaskError };

export function makeTaskError(message: string, kind: TaskKind, path: string, cause?: Error): TaskErrorClass {
  return new TaskErrorClass(message, kind, path, cause);
}

export abstract class BaseTask {
  constructor(
    protected readonly backend: SyncBackend,
    protected readonly vault: Vault,
    protected readonly getRecord: () => SyncRecordData,
    readonly localPath: string,
    readonly remotePath: string,
  ) {}

  abstract readonly kind: TaskKind;
  abstract exec(): Promise<TaskResult>;
  abstract describe(): string;
}
