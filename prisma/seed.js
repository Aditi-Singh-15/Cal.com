import { DateTime } from "luxon";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function makeUtcFromHostDate({ hostTimezone, dayOffset, hour, minute, durationMinutes }) {
  const startHost = DateTime.now()
    .setZone(hostTimezone)
    .plus({ days: dayOffset })
    .startOf("day")
    .plus({ hours: hour, minutes: minute });
  const endHost = startHost.plus({ minutes: durationMinutes });

  return {
    startAt: startHost.toUTC().toJSDate(),
    endAt: endHost.toUTC().toJSDate(),
  };
}

async function main() {
  const host = await prisma.user.upsert({
    where: { email: "host@calclone.local" },
    update: { name: "Default Host", timezone: "Asia/Kolkata" },
    create: {
      name: "Default Host",
      email: "host@calclone.local",
      timezone: "Asia/Kolkata",
    },
  });

  await prisma.$transaction([
    prisma.booking.deleteMany({ where: { hostUserId: host.id } }),
    prisma.availabilityRule.deleteMany({ where: { userId: host.id } }),
    prisma.eventType.deleteMany({ where: { userId: host.id } }),
  ]);

  const introCall = await prisma.eventType.create({
    data: {
      userId: host.id,
      title: "Intro Call",
      description: "30-minute intro discussion",
      durationMinutes: 30,
      slug: "intro-call",
      isActive: true,
    },
  });

  const deepDive = await prisma.eventType.create({
    data: {
      userId: host.id,
      title: "Deep Dive",
      description: "60-minute technical deep dive",
      durationMinutes: 60,
      slug: "deep-dive",
      isActive: true,
    },
  });

  await prisma.availabilityRule.createMany({
    data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
      userId: host.id,
      dayOfWeek,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
      timezone: host.timezone,
    })),
  });

  const upcoming = makeUtcFromHostDate({
    hostTimezone: host.timezone,
    dayOffset: 1,
    hour: 10,
    minute: 0,
    durationMinutes: introCall.durationMinutes,
  });
  const past = makeUtcFromHostDate({
    hostTimezone: host.timezone,
    dayOffset: -1,
    hour: 14,
    minute: 0,
    durationMinutes: deepDive.durationMinutes,
  });
  const cancelled = makeUtcFromHostDate({
    hostTimezone: host.timezone,
    dayOffset: 2,
    hour: 11,
    minute: 0,
    durationMinutes: introCall.durationMinutes,
  });

  await prisma.booking.create({
    data: {
      eventTypeId: introCall.id,
      hostUserId: host.id,
      bookerName: "Alice",
      bookerEmail: "alice@example.com",
      startAt: upcoming.startAt,
      endAt: upcoming.endAt,
      status: "confirmed",
    },
  });

  await prisma.booking.create({
    data: {
      eventTypeId: deepDive.id,
      hostUserId: host.id,
      bookerName: "Bob",
      bookerEmail: "bob@example.com",
      startAt: past.startAt,
      endAt: past.endAt,
      status: "confirmed",
    },
  });

  await prisma.booking.create({
    data: {
      eventTypeId: introCall.id,
      hostUserId: host.id,
      bookerName: "Charlie",
      bookerEmail: "charlie@example.com",
      startAt: cancelled.startAt,
      endAt: cancelled.endAt,
      status: "cancelled",
      cancelledAt: new Date(),
    },
  });

  console.log("Seed completed");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
