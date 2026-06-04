export function getClientTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

function hasExplicitTimeZone(value: string): boolean {
  return /[zZ]$|[+-]\d{2}:\d{2}$/.test(value);
}

function normalizeUtcTimestamp(value: string): string {
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value)) {
    return `${value.replace(' ', 'T')}Z`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value) && !hasExplicitTimeZone(value)) {
    return `${value}Z`;
  }

  return value;
}

export function parseUtcTimestamp(value: string): Date {
  return new Date(normalizeUtcTimestamp(value));
}

export function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function formatInTimeZone(date: Date, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: getClientTimeZone(),
    ...options,
  }).format(date);
}

export function formatUtcDateTime(value: string, options?: Intl.DateTimeFormatOptions): string {
  return formatInTimeZone(parseUtcTimestamp(value), {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    ...options,
  });
}

export function formatUtcDate(value: string, options?: Intl.DateTimeFormatOptions): string {
  return formatInTimeZone(parseUtcTimestamp(value), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  });
}

export function formatDateOnly(value: string, options?: Intl.DateTimeFormatOptions): string {
  return formatInTimeZone(parseDateOnly(value), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    ...options,
  });
}

export function formatDateOnlyShort(value: string, options?: Intl.DateTimeFormatOptions): string {
  return formatInTimeZone(parseDateOnly(value), {
    month: 'short',
    day: 'numeric',
    ...options,
  });
}

function getTodayDateKey(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: getClientTimeZone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());

  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

export function isDateOnlyPast(value?: string): boolean {
  if (!value) return false;
  return value < getTodayDateKey();
}
