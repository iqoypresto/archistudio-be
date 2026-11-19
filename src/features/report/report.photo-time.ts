interface LocalExifTime {
  values: number[];
  milliseconds: number;
}

function parseLocalExifTime(value: string): LocalExifTime | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(value);
  if (!match) return null;
  const values = match.slice(1, 7).map((part) => Number(part ?? "0"));
  const milliseconds = Number((match[7] ?? "0").padEnd(3, "0"));
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0] = values;
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const actual = [
    check.getUTCFullYear(), check.getUTCMonth() + 1, check.getUTCDate(),
    check.getUTCHours(), check.getUTCMinutes(), check.getUTCSeconds(),
  ];
  return values.every((part, index) => part === actual[index])
    ? { values, milliseconds }
    : null;
}

function resolveProjectTime(parts: LocalExifTime, timeZone: string): Date {
  const [year = 0, month = 0, day = 0, hour = 0, minute = 0, second = 0] = parts.values;
  const target = Date.UTC(year, month - 1, day, hour, minute, second, parts.milliseconds);
  let candidate = target;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const local = new Intl.DateTimeFormat("en-CA", {
      timeZone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(candidate));
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      Number(local.find((item) => item.type === type)?.value ?? 0);
    const represented = Date.UTC(
      part("year"), part("month") - 1, part("day"), part("hour"),
      part("minute"), part("second"), parts.milliseconds,
    );
    candidate += target - represented;
  }
  return new Date(candidate);
}

/** Menormalkan EXIF; timestamp tanpa offset ditafsirkan pada zona waktu project. */
export function normalizePhotoTakenAt(value: string | null | undefined, timeZone: string): Date | null {
  if (!value) return null;
  const explicitOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  if (explicitOffset) {
    const localValue = value.replace(/(?:Z|[+-]\d{2}:?\d{2})$/i, "");
    if (!parseLocalExifTime(localValue)) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parts = parseLocalExifTime(value);
  return parts ? resolveProjectTime(parts, timeZone) : null;
}
