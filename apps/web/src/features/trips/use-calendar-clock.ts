'use client';
import { useEffect, useState } from 'react';
import { calendarLocalTime } from './calendar-presentation';

export function useCalendarClock(timezone: string) {
  const [clock, setClock] = useState<ReturnType<typeof calendarLocalTime> | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const update = () => {
      clearTimeout(timer);
      if (document.hidden) return;
      setClock(calendarLocalTime(new Date(), timezone));
      timer = setTimeout(update, 60000 - (Date.now() % 60000) + 20);
    };
    update();
    document.addEventListener('visibilitychange', update);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', update);
    };
  }, [timezone]);
  return clock;
}
