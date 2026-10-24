const MONTHS_LONG =
  "January,February,March,April,May,June,July,August,September,October,November,December".split(
    ",",
  );
const MONTHS_SHORT = MONTHS_LONG.map((m) => m.slice(0, 3));
const WEEKDAYS_LONG =
  "Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday".split(",");
const WEEKDAYS_SHORT = WEEKDAYS_LONG.map((d) => d.slice(0, 3));
const WEEKDAYS_MIN = WEEKDAYS_LONG.map((d) => d.slice(0, 2));

export type MomentInput =
  Date | number | string | MomentObject | null | undefined;

export interface MomentObject {
  _isAMomentObject: boolean;
  _d: Date;
  format(pattern?: string): string;
  valueOf(): number;
  unix(): number;
  toDate(): Date;
  toISOString(): string;
  isValid(): boolean;
  clone(): MomentObject;
  startOf(unit: string): MomentObject;
  endOf(unit: string): MomentObject;
  add(amount: number | Record<string, number>, unit?: string): MomentObject;
  subtract(
    amount: number | Record<string, number>,
    unit?: string,
  ): MomentObject;
  diff(other: MomentInput, unit?: string, precise?: boolean): number;
  isSame(other: MomentInput, unit?: string): boolean;
  isBefore(other: MomentInput, unit?: string): boolean;
  isAfter(other: MomentInput, unit?: string): boolean;
  isSameOrBefore(other: MomentInput, unit?: string): boolean;
  isSameOrAfter(other: MomentInput, unit?: string): boolean;
  fromNow(withoutSuffix?: boolean): string;
  from(other: MomentInput, withoutSuffix?: boolean): string;
  locale(loc?: string): string | MomentObject;
  utc(): MomentObject;
  local(): MomentObject;
  year(val?: number): number | MomentObject;
  month(val?: number): number | MomentObject;
  date(val?: number): number | MomentObject;
  day(val?: number): number | MomentObject;
  isoWeekday(val?: number): number | MomentObject;
  hour(val?: number): number | MomentObject;
  hours(val?: number): number | MomentObject;
  minute(val?: number): number | MomentObject;
  minutes(val?: number): number | MomentObject;
  second(val?: number): number | MomentObject;
  seconds(val?: number): number | MomentObject;
  millisecond(val?: number): number | MomentObject;
  milliseconds(val?: number): number | MomentObject;
  set(unitOrObj: string | Record<string, number>, val?: number): MomentObject;
}

function parseInputDate(input?: MomentInput): Date {
  if (input === undefined) {
    return new Date();
  }
  if (input === null) {
    return new Date(Number.NaN);
  }
  if (typeof input === "object" && "_d" in input && input._d instanceof Date) {
    return new Date(input._d.getTime());
  }
  if (input instanceof Date) {
    return new Date(input.getTime());
  }
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    const [y, m, d] = input.split("-").map(Number);
    return new Date(y!, m! - 1, d!, 0, 0, 0, 0);
  }
  return new Date(input as string | number);
}

function formatDateTokens(date: Date, pattern: string): string {
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  const hours24 = date.getHours();
  const hours12 = hours24 % 12 || 12;
  const tzOffset = -date.getTimezoneOffset();
  const tzSign = tzOffset >= 0 ? "+" : "-";
  const tzAbs = Math.abs(tzOffset);
  const tzStr = `${tzSign}${pad(Math.floor(tzAbs / 60))}:${pad(tzAbs % 60)}`;
  const tokens: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    YY: String(date.getFullYear()).slice(-2),
    MMMM: MONTHS_LONG[date.getMonth()] ?? "",
    MMM: MONTHS_SHORT[date.getMonth()] ?? "",
    MM: pad(date.getMonth() + 1),
    M: String(date.getMonth() + 1),
    DD: pad(date.getDate()),
    D: String(date.getDate()),
    dddd: WEEKDAYS_LONG[date.getDay()] ?? "",
    ddd: WEEKDAYS_SHORT[date.getDay()] ?? "",
    dd: WEEKDAYS_MIN[date.getDay()] ?? "",
    d: String(date.getDay()),
    HH: pad(hours24),
    H: String(hours24),
    hh: pad(hours12),
    h: String(hours12),
    mm: pad(date.getMinutes()),
    m: String(date.getMinutes()),
    ss: pad(date.getSeconds()),
    s: String(date.getSeconds()),
    SSS: pad(date.getMilliseconds(), 3),
    A: hours24 < 12 ? "AM" : "PM",
    a: hours24 < 12 ? "am" : "pm",
    Z: tzStr,
  };
  return pattern.replace(
    /\[([^\]]+)\]|YYYY|YY|MMMM|MMM|MM|M|DD|D|dddd|ddd|dd|d|HH|H|hh|h|mm|m|ss|s|SSS|A|a|Z/g,
    (match, escaped: string | undefined) =>
      escaped !== undefined ? escaped : (tokens[match] ?? match),
  );
}

const UNIT_ALIASES: Readonly<Record<string, string>> = {
  y: "year",
  m: "minute",
  d: "day",
  w: "week",
  h: "hour",
};

function normalizeUnit(unit?: string): string {
  const u = (unit ?? "millisecond").toLowerCase().replace(/s$/, "");
  return UNIT_ALIASES[u] ?? u;
}

function mutateDateBoundary(date: Date, u: string, isStart: boolean): void {
  if (u === "year") {
    date.setMonth(isStart ? 0 : 11, isStart ? 1 : 31);
  } else if (u === "month") {
    if (isStart) {
      date.setDate(1);
    } else {
      date.setMonth(date.getMonth() + 1, 0);
    }
  } else if (u === "week" || u === "isoweek") {
    const day = date.getDay();
    let diff = -day;
    if (u === "isoweek") {
      diff = day === 0 ? -6 : 1 - day;
    }
    date.setDate(date.getDate() + (isStart ? diff : diff + 6));
  }
}

function mutateBoundary(date: Date, unit: string, isStart: boolean): void {
  const u = normalizeUnit(unit);
  mutateDateBoundary(date, u, isStart);
  if (["year", "month", "week", "isoweek", "day", "date"].includes(u)) {
    const h = isStart ? 0 : 23;
    const m = isStart ? 0 : 59;
    const ms = isStart ? 0 : 999;
    date.setHours(h, m, m, ms);
  } else if (u === "hour") {
    const m = isStart ? 0 : 59;
    date.setMinutes(m, m, isStart ? 0 : 999);
  } else if (u === "minute") {
    date.setSeconds(isStart ? 0 : 59, isStart ? 0 : 999);
  } else if (u === "second") {
    date.setMilliseconds(isStart ? 0 : 999);
  }
}

const UNIT_ADDERS: Readonly<Record<string, (d: Date, n: number) => void>> = {
  year: (d, n) => d.setFullYear(d.getFullYear() + n),
  month: (d, n) => d.setMonth(d.getMonth() + n),
  week: (d, n) => d.setDate(d.getDate() + n * 7),
  day: (d, n) => d.setDate(d.getDate() + n),
  date: (d, n) => d.setDate(d.getDate() + n),
  hour: (d, n) => d.setHours(d.getHours() + n),
  minute: (d, n) => d.setMinutes(d.getMinutes() + n),
  second: (d, n) => d.setSeconds(d.getSeconds() + n),
};

function addUnitOffset(date: Date, amount: number, unit?: string): void {
  const u = normalizeUnit(unit ?? "millisecond");
  const adder = UNIT_ADDERS[u];
  if (adder) {
    adder(date, amount);
  } else {
    date.setMilliseconds(date.getMilliseconds() + amount);
  }
}

const DIFF_DIVISORS: Readonly<Record<string, number>> = {
  second: 1000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  date: 86_400_000,
  week: 86_400_000 * 7,
  month: 86_400_000 * 30.436875,
  year: 86_400_000 * 365.2425,
};

function computeDiff(a: Date, b: Date, unit?: string, precise = false): number {
  const ms = a.getTime() - b.getTime();
  const divisor = DIFF_DIVISORS[normalizeUnit(unit)] ?? 1;
  const raw = ms / divisor;
  if (precise) {
    return raw;
  }
  return raw < 0 ? Math.ceil(raw) : Math.floor(raw);
}

function applyOffsetArg(
  date: Date,
  amount: number | Record<string, number>,
  unit: string | undefined,
  sign: 1 | -1,
): void {
  if (typeof amount === "object" && amount !== null) {
    for (const [k, v] of Object.entries(amount)) {
      addUnitOffset(date, sign * Number(v), k);
    }
  } else {
    addUnitOffset(date, sign * Number(amount), unit);
  }
}

function formatRelativeDays(
  date: Date,
  other: MomentInput,
  withoutSuffix = false,
): string {
  const days = Math.round(
    (date.getTime() - parseInputDate(other).getTime()) / 86_400_000,
  );
  if (days === 0) {
    return "today";
  }
  const abs = `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"}`;
  if (withoutSuffix) {
    return abs;
  }
  return days > 0 ? `in ${abs}` : `${abs} ago`;
}

function buildMomentInstance(date: Date): MomentObject {
  const self: MomentObject = Object.create(
    (moment as unknown as { prototype: object }).prototype,
  ) as MomentObject;
  self._isAMomentObject = true;
  self._d = date;
  self.format = (pattern = "YYYY-MM-DDTHH:mm:ssZ") =>
    formatDateTokens(date, pattern);
  self.valueOf = () => date.getTime();
  self.unix = () => Math.floor(date.getTime() / 1000);
  self.toDate = () => new Date(date.getTime());
  self.toISOString = () =>
    Number.isNaN(date.getTime()) ? "Invalid date" : date.toISOString();
  self.isValid = () => !Number.isNaN(date.getTime());
  self.clone = () => moment(new Date(date.getTime()));
  self.startOf = (unit: string) => (mutateBoundary(date, unit, true), self);
  self.endOf = (unit: string) => (mutateBoundary(date, unit, false), self);
  self.add = (amount, unit) => (applyOffsetArg(date, amount, unit, 1), self);
  self.subtract = (amount, unit) => (
    applyOffsetArg(date, amount, unit, -1),
    self
  );
  self.diff = (other, unit, precise) =>
    computeDiff(date, parseInputDate(other), unit, precise);
  attachComparisons(self, date);
  attachDateAccessors(self, date);
  return self;
}

function attachComparisons(self: MomentObject, date: Date): void {
  self.isSame = (other, unit) =>
    unit
      ? self.clone().startOf(unit).valueOf() ===
        moment(other).startOf(unit).valueOf()
      : date.getTime() === parseInputDate(other).getTime();
  self.isBefore = (other, unit) =>
    unit
      ? self.clone().startOf(unit).valueOf() <
        moment(other).startOf(unit).valueOf()
      : date.getTime() < parseInputDate(other).getTime();
  self.isAfter = (other, unit) =>
    unit
      ? self.clone().startOf(unit).valueOf() >
        moment(other).startOf(unit).valueOf()
      : date.getTime() > parseInputDate(other).getTime();
  self.isSameOrBefore = (other, unit) =>
    self.isSame(other, unit) || self.isBefore(other, unit);
  self.isSameOrAfter = (other, unit) =>
    self.isSame(other, unit) || self.isAfter(other, unit);
  self.from = (other, withoutSuffix = false) =>
    formatRelativeDays(date, other, withoutSuffix);
  self.fromNow = (withoutSuffix = false) =>
    formatRelativeDays(date, new Date(), withoutSuffix);
  self.locale = (loc?: string) => (loc === undefined ? "en" : self);
  self.utc = () => self;
  self.local = () => self;
}

const UNIT_SETTERS: Readonly<Record<string, (d: Date, v: number) => void>> = {
  year: (d, v) => d.setFullYear(v),
  month: (d, v) => d.setMonth(v),
  date: (d, v) => d.setDate(v),
  day: (d, v) => d.setDate(v),
  hour: (d, v) => d.setHours(v),
  minute: (d, v) => d.setMinutes(v),
  second: (d, v) => d.setSeconds(v),
  millisecond: (d, v) => d.setMilliseconds(v),
};

function attachDateAccessors(self: MomentObject, date: Date): void {
  self.year = (v?: number) =>
    v === undefined ? date.getFullYear() : (date.setFullYear(v), self);
  self.month = (v?: number) =>
    v === undefined ? date.getMonth() : (date.setMonth(v), self);
  self.date = (v?: number) =>
    v === undefined ? date.getDate() : (date.setDate(v), self);
  self.day = (v?: number) =>
    v === undefined
      ? date.getDay()
      : (date.setDate(date.getDate() + (v - date.getDay())), self);
  self.isoWeekday = (v?: number) => {
    const cur = date.getDay() || 7;
    return v === undefined
      ? cur
      : (date.setDate(date.getDate() + (v - cur)), self);
  };
  const hr = (v?: number) =>
    v === undefined ? date.getHours() : (date.setHours(v), self);
  const mn = (v?: number) =>
    v === undefined ? date.getMinutes() : (date.setMinutes(v), self);
  const sc = (v?: number) =>
    v === undefined ? date.getSeconds() : (date.setSeconds(v), self);
  const ms = (v?: number) =>
    v === undefined ? date.getMilliseconds() : (date.setMilliseconds(v), self);
  self.hour = hr;
  self.hours = hr;
  self.minute = mn;
  self.minutes = mn;
  self.second = sc;
  self.seconds = sc;
  self.millisecond = ms;
  self.milliseconds = ms;
  self.set = (unitOrObj, val) => {
    if (typeof unitOrObj === "object" && unitOrObj !== null) {
      for (const [k, v] of Object.entries(unitOrObj)) {
        self.set(k, v);
      }
      return self;
    }
    if (val !== undefined) {
      UNIT_SETTERS[normalizeUnit(unitOrObj)]?.(date, val);
    }
    return self;
  };
}

export function moment(
  input?: MomentInput,
  _format?: string | string[],
  _strict?: boolean,
): MomentObject {
  return buildMomentInstance(parseInputDate(input));
}

moment.locale = (_loc?: string) => "en";
moment.unix = (seconds: number) => moment(seconds * 1000);
moment.utc = (input?: MomentInput) => moment(input);
moment.invalid = () => moment(null);
moment.isMoment = (obj: unknown): obj is MomentObject =>
  Boolean(obj && typeof obj === "object" && "_isAMomentObject" in obj);
moment.isDate = (obj: unknown): obj is Date => obj instanceof Date;
moment.months = () => [...MONTHS_LONG];
moment.monthsShort = () => [...MONTHS_SHORT];
moment.weekdays = () => [...WEEKDAYS_LONG];
moment.weekdaysShort = () => [...WEEKDAYS_SHORT];
moment.weekdaysMin = () => [...WEEKDAYS_MIN];
moment.duration = (amount?: number, unit?: string) => {
  const n = Number(amount ?? 0);
  const factor = DIFF_DIVISORS[normalizeUnit(unit)] ?? 1;
  const ms = n * factor;
  return {
    asMilliseconds: () => ms,
    asSeconds: () => ms / 1000,
    asMinutes: () => ms / 60_000,
    asHours: () => ms / 3_600_000,
    asDays: () => ms / 86_400_000,
    humanize: () => `${ms}ms`,
  };
};
moment.HTML5_FMT = {
  DATETIME_LOCAL: "YYYY-MM-DDTHH:mm",
  DATETIME_LOCAL_SECONDS: "YYYY-MM-DDTHH:mm:ss",
  DATETIME_LOCAL_MS: "YYYY-MM-DDTHH:mm:ss.SSS",
  DATE: "YYYY-MM-DD",
  TIME: "HH:mm",
  TIME_SECONDS: "HH:mm:ss",
  TIME_MS: "HH:mm:ss.SSS",
  WEEK: "GGGG-[W]WW",
  MONTH: "YYYY-MM",
};

export function getLanguage(): string {
  return "en";
}
