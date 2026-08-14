// Three-way merge for markdown files — common-prefix/suffix line merge with conflict markers

import { createLogger } from '../utils/logger';

const log = createLogger('Sync:Merge');

export interface MergeResult {
  merged: string;
  hasConflicts: boolean;
  conflictCount: number;
}

function splitLines(text: string): { lines: string[]; trailingNewline: boolean } {
  if (text === '') return { lines: [], trailingNewline: false };
  const trailingNewline = text.endsWith('\n');
  const trimmed = trailingNewline ? text.slice(0, -1) : text;
  return { lines: trimmed === '' ? [] : trimmed.split('\n'), trailingNewline };
}

function joinLines(lines: string[], trailingNewline: boolean): string {
  if (lines.length === 0) return trailingNewline ? '\n' : '';
  return lines.join('\n') + (trailingNewline ? '\n' : '');
}

function commonPrefixLen(a: string[], b: string[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

function commonSuffixLen(a: string[], b: string[], aEnd: number, bEnd: number): number {
  let i = 0;
  while (i < aEnd && i < bEnd && a[aEnd - 1 - i] === b[bEnd - 1 - i]) i++;
  return i;
}

/**
 * Two-way merge using common-prefix/suffix.
 * Lines identical at start and end are kept; the middle region is resolved.
 */
function mergeTwoWayLines(localLines: string[], remoteLines: string[]): MergeResult {
  if (localLines.length === 0 && remoteLines.length === 0) {
    return { merged: '', hasConflicts: false, conflictCount: 0 };
  }
  if (localLines.length === 0) {
    return { merged: remoteLines.join('\n'), hasConflicts: false, conflictCount: 0 };
  }
  if (remoteLines.length === 0) {
    return { merged: localLines.join('\n'), hasConflicts: false, conflictCount: 0 };
  }

  // Fast path: identical
  if (localLines.length === remoteLines.length &&
      localLines.every((l, i) => l === remoteLines[i])) {
    return { merged: localLines.join('\n'), hasConflicts: false, conflictCount: 0 };
  }

  const prefix = commonPrefixLen(localLines, remoteLines);

  // Work on the remaining slices after prefix
  const localRem = localLines.slice(prefix);
  const remoteRem = remoteLines.slice(prefix);
  const suffix = commonSuffixLen(localRem, remoteRem, localRem.length, remoteRem.length);

  const localMid = localRem.slice(0, localRem.length - suffix);
  const remoteMid = remoteRem.slice(0, remoteRem.length - suffix);

  const result: string[] = [];
  if (prefix > 0) result.push(...localLines.slice(0, prefix));

  if (localMid.length === 0) {
    result.push(...remoteMid);
  } else if (remoteMid.length === 0) {
    result.push(...localMid);
  } else if (localMid.join('\n') === remoteMid.join('\n')) {
    result.push(...localMid);
  } else {
    result.push('<<<<<<< LOCAL');
    result.push(...localMid);
    result.push('=======');
    result.push(...remoteMid);
    result.push('>>>>>>> REMOTE');
    if (suffix > 0) result.push(...localRem.slice(localRem.length - suffix));
    return { merged: result.join('\n'), hasConflicts: true, conflictCount: 1 };
  }

  if (suffix > 0) result.push(...localRem.slice(localRem.length - suffix));

  return { merged: result.join('\n'), hasConflicts: false, conflictCount: 0 };
}

export function mergeThreeWay(
  base: string,
  local: string,
  remote: string,
): MergeResult {
  const { lines: baseLines } = splitLines(base);
  const { lines: localLines, trailingNewline } = splitLines(local);
  const { lines: remoteLines } = splitLines(remote);

  // When base matches one side, the other side wins unconditionally
  if (base === local && base !== remote) {
    return {
      merged: joinLines(remoteLines, trailingNewline),
      hasConflicts: false,
      conflictCount: 0,
    };
  }
  if (base === remote && base !== local) {
    return {
      merged: joinLines(localLines, trailingNewline),
      hasConflicts: false,
      conflictCount: 0,
    };
  }

  // Base empty or all three identical → two-way merge
  if (baseLines.length === 0 || base === local || base === remote) {
    const result = mergeTwoWayLines(localLines, remoteLines);
    result.merged = joinLines(result.merged.split('\n'), trailingNewline);
    return result;
  }

  // True three-way merge
  const result = mergeThreeWayLines(baseLines, localLines, remoteLines);
  result.merged = joinLines(result.merged.split('\n'), trailingNewline);
  return result;
}

interface SimpleHunk {
  baseStart: number;
  baseEnd: number;
  deletedCount: number;
  inserted: string[];
}

function diffHunk(baseLines: string[], targetLines: string[]): SimpleHunk {
  const prefix = commonPrefixLen(baseLines, targetLines);

  const baseRem = baseLines.slice(prefix);
  const targetRem = targetLines.slice(prefix);
  const suffix = commonSuffixLen(baseRem, targetRem, baseRem.length, targetRem.length);

  const deletedCount = baseRem.length - suffix;
  const inserted = targetRem.slice(0, targetRem.length - suffix);

  return {
    baseStart: prefix,
    baseEnd: prefix + Math.max(0, deletedCount),
    deletedCount: Math.max(0, deletedCount),
    inserted,
  };
}

function mergeThreeWayLines(
  baseLines: string[],
  localLines: string[],
  remoteLines: string[],
): MergeResult {
  const localHunk = diffHunk(baseLines, localLines);
  const remoteHunk = diffHunk(baseLines, remoteLines);

  // If neither side changed, files are identical
  if (localHunk.deletedCount === 0 && localHunk.inserted.length === 0 &&
      remoteHunk.deletedCount === 0 && remoteHunk.inserted.length === 0) {
    return { merged: baseLines.join('\n'), hasConflicts: false, conflictCount: 0 };
  }

  // Check if hunks overlap in the base
  const overlaps =
    localHunk.baseStart < remoteHunk.baseEnd &&
    remoteHunk.baseStart < localHunk.baseEnd;

  if (!overlaps) {
    const result: string[] = [];

    // Deduplicate identical hunks at the same position
    const isDuplicate =
      localHunk.baseStart === remoteHunk.baseStart &&
      localHunk.baseEnd === remoteHunk.baseEnd &&
      localHunk.inserted.join('\n') === remoteHunk.inserted.join('\n');

    if (isDuplicate) {
      result.push(...baseLines.slice(0, localHunk.baseStart));
      result.push(...localHunk.inserted);
      result.push(...baseLines.slice(localHunk.baseEnd));
      return { merged: result.join('\n'), hasConflicts: false, conflictCount: 0 };
    }

    // Non-overlapping changes: apply both in order
    const hunks = [localHunk, remoteHunk].sort((a, b) => a.baseStart - b.baseStart);

    let pos = 0;
    for (const h of hunks) {
      if (h.baseStart > pos) {
        result.push(...baseLines.slice(pos, h.baseStart));
      }
      result.push(...h.inserted);
      pos = h.baseEnd;
    }
    if (pos < baseLines.length) {
      result.push(...baseLines.slice(pos));
    }

    return { merged: result.join('\n'), hasConflicts: false, conflictCount: 0 };
  }

  // Overlapping changes: check if identical
  if (localHunk.inserted.join('\n') === remoteHunk.inserted.join('\n') &&
      localHunk.deletedCount === remoteHunk.deletedCount) {
    const result: string[] = [];
    result.push(...baseLines.slice(0, Math.min(localHunk.baseStart, remoteHunk.baseStart)));
    result.push(...localHunk.inserted);
    result.push(...baseLines.slice(Math.max(localHunk.baseEnd, remoteHunk.baseEnd)));
    return { merged: result.join('\n'), hasConflicts: false, conflictCount: 0 };
  }

  // Conflict. Each side's block shows that side's ACTUAL content of the
  // affected region (base[minStart, maxEnd) with that side's edit applied).
  // Never include the deleted base lines inside a side's block: users copy
  // these blocks verbatim when resolving, and base lines that a side deleted
  // would be resurrected or duplicated in the resolved file.
  const minStart = Math.min(localHunk.baseStart, remoteHunk.baseStart);
  const maxEnd = Math.max(localHunk.baseEnd, remoteHunk.baseEnd);
  const result: string[] = [];
  result.push(...baseLines.slice(0, minStart));

  result.push('<<<<<<< LOCAL');
  result.push(
    ...baseLines.slice(minStart, localHunk.baseStart),
    ...localHunk.inserted,
    ...baseLines.slice(localHunk.baseEnd, maxEnd),
  );

  result.push('=======');
  result.push(
    ...baseLines.slice(minStart, remoteHunk.baseStart),
    ...remoteHunk.inserted,
    ...baseLines.slice(remoteHunk.baseEnd, maxEnd),
  );

  result.push('>>>>>>> REMOTE');
  result.push(...baseLines.slice(maxEnd));

  return { merged: result.join('\n'), hasConflicts: true, conflictCount: 1 };
}

export function mergeMarkdown(
  base: string,
  local: string,
  remote: string,
): MergeResult & { conflictCopy: string | null } {
  const result = mergeThreeWay(base, local, remote);
  return {
    ...result,
    conflictCopy: result.hasConflicts ? result.merged : null,
  };
}
