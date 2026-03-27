import { DateTime } from "luxon";
import { dayOfWeekSundayZero, getDisplayDayBounds, minuteOfDay } from "../utils/time.js";

function sortByStart(slots) {
  return slots.sort((a, b) => a.startAt.toMillis() - b.startAt.toMillis());
}

function overlaps(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

export function buildCandidateSlots({
  date,
  displayTimezone,
  hostTimezone,
  durationMinutes,
  availabilityRules,
  nowUtc = DateTime.utc(),
}) {
  const dayBounds = getDisplayDayBounds(date, displayTimezone);
  if (!dayBounds) {
    return null;
  }

  const { dayStart, dayEnd } = dayBounds;
  const hostRangeStart = dayStart.setZone(hostTimezone).startOf("day").minus({ days: 1 });
  const hostRangeEnd = dayEnd.setZone(hostTimezone).startOf("day").plus({ days: 1 });

  const slots = [];
  for (let cursor = hostRangeStart; cursor <= hostRangeEnd; cursor = cursor.plus({ days: 1 })) {
    const weekday = dayOfWeekSundayZero(cursor);
    const rulesForDay = availabilityRules.filter((rule) => rule.dayOfWeek === weekday);

    for (const rule of rulesForDay) {
      const intervalStart = cursor.startOf("day").plus({ minutes: rule.startMinute });
      const intervalEnd = cursor.startOf("day").plus({ minutes: rule.endMinute });

      for (
        let slotStart = intervalStart;
        slotStart.plus({ minutes: durationMinutes }) <= intervalEnd;
        slotStart = slotStart.plus({ minutes: durationMinutes })
      ) {
        const slotEnd = slotStart.plus({ minutes: durationMinutes });
        const slotStartUtc = slotStart.toUTC();
        const slotEndUtc = slotEnd.toUTC();
        const slotStartDisplay = slotStartUtc.setZone(displayTimezone);

        if (slotStartUtc <= nowUtc) {
          continue;
        }

        if (slotStartDisplay < dayStart || slotStartDisplay >= dayEnd) {
          continue;
        }

        slots.push({
          startAt: slotStartUtc,
          endAt: slotEndUtc,
        });
      }
    }
  }

  return sortByStart(slots);
}

export async function getAvailableSlotsForDate({
  prisma,
  hostUserId,
  date,
  displayTimezone,
  hostTimezone,
  durationMinutes,
  availabilityRules,
  nowUtc = DateTime.utc(),
}) {
  const candidateSlots = buildCandidateSlots({
    date,
    displayTimezone,
    hostTimezone,
    durationMinutes,
    availabilityRules,
    nowUtc,
  });

  if (candidateSlots === null) {
    return null;
  }

  if (candidateSlots.length === 0) {
    return [];
  }

  const minStart = candidateSlots[0].startAt.toJSDate();
  const maxEnd = candidateSlots[candidateSlots.length - 1].endAt.toJSDate();

  const conflictingBookings = await prisma.booking.findMany({
    where: {
      hostUserId,
      status: "confirmed",
      startAt: { lt: maxEnd },
      endAt: { gt: minStart },
    },
    select: {
      startAt: true,
      endAt: true,
    },
  });

  return candidateSlots.filter((slot) => {
    return !conflictingBookings.some((booking) =>
      overlaps(
        slot.startAt.toMillis(),
        slot.endAt.toMillis(),
        booking.startAt.getTime(),
        booking.endAt.getTime(),
      ),
    );
  });
}

export function isSlotInsideAvailability({
  startUtc,
  durationMinutes,
  hostTimezone,
  availabilityRules,
}) {
  const startHost = startUtc.setZone(hostTimezone);
  const endHost = startHost.plus({ minutes: durationMinutes });
  if (dayOfWeekSundayZero(startHost) !== dayOfWeekSundayZero(endHost) || !startUtc.isValid) {
    return false;
  }

  const weekday = dayOfWeekSundayZero(startHost);
  const startMinute = minuteOfDay(startHost);
  const endMinute = minuteOfDay(endHost);

  if (startHost.second !== 0 || startHost.millisecond !== 0) {
    return false;
  }

  return availabilityRules.some((rule) => {
    if (rule.dayOfWeek !== weekday) {
      return false;
    }

    return startMinute >= rule.startMinute && endMinute <= rule.endMinute;
  });
}
