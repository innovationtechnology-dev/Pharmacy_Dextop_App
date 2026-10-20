import React, { useEffect, useMemo, useState } from 'react';
import {
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiAlertTriangle,
  FiPackage,
} from 'react-icons/fi';

interface CalendarPanelProps {
  userName?: string;
  expiringCount?: number;
  lowStockCount?: number;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const getGreeting = (hour: number) => {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
};

const getWeekNumber = (date: Date) => {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

const CalendarPanel: React.FC<CalendarPanelProps> = ({
  userName,
  expiringCount = 0,
  lowStockCount = 0,
}) => {
  const [now, setNow] = useState(new Date());
  const [viewDate, setViewDate] = useState(
    new Date(now.getFullYear(), now.getMonth(), 1)
  );
  const [selectedDate, setSelectedDate] = useState<Date>(now);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const calendarDays = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstWeekday = new Date(year, month, 1).getDay();
    const start = new Date(year, month, 1 - firstWeekday);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
  }, [viewDate]);

  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const daysInYear =
    (new Date(now.getFullYear() + 1, 0, 1).getTime() - startOfYear.getTime()) /
    86400000;
  const dayOfYear =
    Math.floor((now.getTime() - startOfYear.getTime()) / 86400000) + 1;
  const yearProgress = Math.round((dayOfYear / daysInYear) * 100);

  const timeParts = now
    .toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
    .split(' ');

  const changeMonth = (offset: number) =>
    setViewDate(
      new Date(viewDate.getFullYear(), viewDate.getMonth() + offset, 1)
    );

  const goToToday = () => {
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
  };

  return (
    <div className="space-y-4">
      {/* Clock */}
      <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 p-5 text-white shadow-md">
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full bg-white/10" />
        <div className="absolute -bottom-12 -left-8 w-28 h-28 rounded-full bg-white/5" />
        <div className="relative">
          <p className="text-xs font-medium text-blue-100">
            {getGreeting(now.getHours())}
            {userName ? `, ${userName.split(' ')[0]}` : ''}
          </p>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-4xl font-bold tracking-tight tabular-nums">
              {timeParts[0]}
            </span>
            <span className="mb-1 text-sm font-semibold text-blue-100">
              {timeParts[1]}
            </span>
          </div>
          <p className="mt-1 text-sm text-blue-100">
            {now.toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </p>
          <div className="mt-4 flex items-center justify-between text-[11px] text-blue-100">
            <span className="flex items-center gap-1.5">
              <FiClock className="w-3 h-3" />
              Week {getWeekNumber(now)}
            </span>
            <span>
              Day {dayOfYear} of {daysInYear}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 rounded-full bg-white/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-white/80"
              style={{ width: `${yearProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {viewDate.toLocaleDateString('en-US', {
              month: 'long',
              year: 'numeric',
            })}
          </h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goToToday}
              className="px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Previous month"
            >
              <FiChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="p-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="Next month"
            >
              <FiChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 mb-1">
          {WEEKDAYS.map((day) => (
            <span
              key={day}
              className="text-center text-[11px] font-semibold text-gray-400 dark:text-gray-500 py-1"
            >
              {day}
            </span>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-y-1">
          {calendarDays.map((day) => {
            const inMonth = day.getMonth() === viewDate.getMonth();
            const isToday = isSameDay(day, now);
            const isSelected = isSameDay(day, selectedDate);
            const isWeekend = day.getDay() === 0 || day.getDay() === 6;
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setSelectedDate(day)}
                className={`mx-auto w-8 h-8 flex items-center justify-center rounded-full text-xs tabular-nums transition-colors ${
                  isToday
                    ? 'bg-blue-600 text-white font-bold shadow-sm'
                    : isSelected
                    ? 'ring-2 ring-blue-500 text-blue-700 dark:text-blue-300 font-semibold'
                    : inMonth
                    ? `${
                        isWeekend
                          ? 'text-gray-500 dark:text-gray-400'
                          : 'text-gray-700 dark:text-gray-200'
                      } hover:bg-gray-100 dark:hover:bg-gray-700`
                    : 'text-gray-300 dark:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>

        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          {isSameDay(selectedDate, now)
            ? 'Today'
            : selectedDate.toLocaleDateString('en-US', { weekday: 'long' })}
          {' · '}
          <span className="font-medium text-gray-700 dark:text-gray-200">
            {selectedDate.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </div>
      </div>

      {/* Today's overview */}
      {/* <div className="rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-4 shadow-sm">
        <h3 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
          Today&apos;s Overview
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3">
            <FiAlertTriangle className="w-4 h-4 text-amber-500 mb-1.5" />
            <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
              {expiringCount}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Expiring soon
            </p>
          </div>
          <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-3">
            <FiPackage className="w-4 h-4 text-red-500 mb-1.5" />
            <p className="text-lg font-bold text-gray-900 dark:text-white tabular-nums">
              {lowStockCount}
            </p>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Low stock
            </p>
          </div>
        </div>
      </div> */}
    </div>
  );
};

export default CalendarPanel;
