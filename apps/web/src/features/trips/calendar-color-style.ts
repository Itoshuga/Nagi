import type { CSSProperties } from 'react';
import { calendarColorStyle as rawCalendarColorStyle } from '@nagi/shared';

export const calendarColorStyle = (color: string): CSSProperties =>
  rawCalendarColorStyle(color) as CSSProperties;
