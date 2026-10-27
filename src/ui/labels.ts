import { GROUPS } from '../data.ts';
import type { CardKind, Direction, GroupId, Level, ScriptSetting } from '../types.ts';

export const SCRIPT_LABEL: Record<ScriptSetting, string> = {
  hiragana: 'Hiragana',
  katakana: 'Katakana',
  both: 'Both scripts',
};

export const GROUP_LABEL = Object.fromEntries(GROUPS.map(group => [group.id, group.label])) as Record<GroupId, string>;

export const LEVEL_LABEL: Record<Level, string> = {
  new: 'Not seen',
  weak: 'Needs work',
  learning: 'Learning',
  mastered: 'Mastered',
};

export const KIND_BADGE: Record<CardKind, string> = {
  new: 'New',
  review: 'Review',
  ahead: 'Extra practice',
  drill: 'Drill',
};

export const DIRECTION_LABEL: Record<Direction, string> = {
  read: 'Read',
  recall: 'Recall',
  match: 'Match',
  listen: 'Listen',
};
