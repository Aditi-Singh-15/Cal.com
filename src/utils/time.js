import { DateTime, IANAZone } from "luxon";

export function isValidTimezone(timezone) {
  return IANAZone.isValidZone(timezone);
}

export function dayOfWeekSundayZero(dateTime) {
  return dateTime.weekday % 7;
}

export function minuteOfDay(dateTime) {
  return dateTime.hour * 60 + dateTime.minute;
}

export function parseIsoInTimezone(iso, timezone) {
  const hasOffset = /([zZ]|[+-]\d{2}:\d{2})$/.test(iso);
  if (hasOffset) {
    const parsedWithZone = DateTime.fromISO(iso, { setZone: true });
    if (!parsedWithZone.isValid) {
      return null;
    }

    return parsedWithZone.toUTC();
  }

  const parsedInTimezone = DateTime.fromISO(iso, { zone: timezone });
  if (!parsedInTimezone.isValid) {
    return null;
  }

  return parsedInTimezone.toUTC();
}

export function getDisplayDayBounds(date, displayTimezone) {
  const dayStart = DateTime.fromISO(date, { zone: displayTimezone }).startOf("day");
  if (!dayStart.isValid) {
    return null;
  }

  return {
    dayStart,
    dayEnd: dayStart.plus({ days: 1 }),
  };
}
