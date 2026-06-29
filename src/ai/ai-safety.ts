// AI operation safety — prevents results from being applied to wrong context

import type { App, TFile } from 'obsidian';

/**
 * Tracks the active editor context at the start of an AI operation.
 * If the user switches notes or closes the editor during the operation,
 * results are discarded instead of being applied to the wrong file.
 */
export class AISafetyGuard {
  private sourcePath: string | null = null;

  /** Capture the current editor context before starting an AI operation */
  capture(sourcePath: string): void {
    this.sourcePath = sourcePath;
  }

  /** Check if the AI result can still be safely applied */
  isSafe(app: App): boolean {
    if (!this.sourcePath) return false;
    const activeFile = app.workspace.getActiveFile();
    return activeFile?.path === this.sourcePath;
  }

  /** Release the captured context */
  release(): void {
    this.sourcePath = null;
  }

  /** Get the captured source path */
  getSourcePath(): string | null {
    return this.sourcePath;
  }
}

/** Create an AbortController that can be signalled manually */
export function createCancellableOperation(): {
  controller: AbortController;
  cancel: () => void;
  isCancelled: () => boolean;
} {
  const controller = new AbortController();
  let cancelled = false;

  return {
    controller,
    cancel: () => {
      cancelled = true;
      controller.abort();
    },
    isCancelled: () => cancelled,
  };
}
