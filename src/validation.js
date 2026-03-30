import { z } from "zod";
import { isValidTimezone } from "./utils/time.js";

const timezoneSchema = z
  .string()
  .trim()
  .refine((value) => isValidTimezone(value), "Invalid timezone");

export const slotsQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  tz: timezoneSchema.optional(),
});

export const calendarQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month must be YYYY-MM"),
  tz: timezoneSchema.optional(),
});

export const bookingRequestSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100, "name is too long"),
  email: z.string().trim().email("valid email is required"),
  startAt: z.string().trim().min(1, "startAt is required"),
  timezone: timezoneSchema.optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().email("valid email is required"),
  password: z.string().trim().min(1, "password is required"),
});

export const signupSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(120, "name is too long"),
  email: z.string().trim().email("valid email is required"),
  password: z.string().trim().min(6, "password must be at least 6 characters"),
  timezone: timezoneSchema.optional(),
});

const slugSchema = z
  .string()
  .trim()
  .min(1, "slug is required")
  .max(100, "slug is too long")
  .regex(/^[a-z0-9-]+$/, "slug must contain only lowercase letters, numbers, and hyphens");

export const eventTypeCreateSchema = z.object({
  title: z.string().trim().min(1, "title is required").max(120, "title is too long"),
  slug: slugSchema,
  description: z.string().trim().max(500, "description is too long").optional().default(""),
  durationMinutes: z
    .number()
    .int("durationMinutes must be an integer")
    .min(1, "durationMinutes must be greater than 0")
    .max(1440, "durationMinutes is too large"),
});

export const eventTypeUpdateSchema = eventTypeCreateSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, "at least one field is required");

export const eventTypeActiveSchema = z.object({
  isActive: z.boolean(),
});

const availabilityRuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startMinute: z.number().int().min(0).max(1439),
  endMinute: z.number().int().min(1).max(1440),
});

const uuidSchema = z.string().uuid("Invalid id");

export const availabilityQuerySchema = z.object({
  scheduleId: uuidSchema.optional(),
});

export const availabilityScheduleCreateSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(80, "name is too long"),
});

export const availabilityScheduleUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "name is required").max(80, "name is too long"),
    timezone: timezoneSchema,
    isDefault: z.boolean(),
    rules: z.array(availabilityRuleSchema).max(70),
  })
  .superRefine((value, ctx) => {
    const byDay = new Map();

    for (const rule of value.rules) {
      if (rule.endMinute <= rule.startMinute) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `endMinute must be greater than startMinute for day ${rule.dayOfWeek}`,
        });
      }

      if (rule.startMinute % 15 !== 0 || rule.endMinute % 15 !== 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `startMinute and endMinute must be 15-minute intervals for day ${rule.dayOfWeek}`,
        });
      }

      if (!byDay.has(rule.dayOfWeek)) {
        byDay.set(rule.dayOfWeek, []);
      }
      byDay.get(rule.dayOfWeek).push(rule);
    }

    for (const [dayOfWeek, rules] of byDay) {
      const sortedRules = [...rules].sort((a, b) => a.startMinute - b.startMinute);
      for (let index = 1; index < sortedRules.length; index += 1) {
        const previous = sortedRules[index - 1];
        const current = sortedRules[index];
        if (current.startMinute < previous.endMinute) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Overlapping time slots are not allowed for day ${dayOfWeek}`,
          });
        }
      }
    }
  });

export const bookingsQuerySchema = z.object({
  scope: z.enum(["upcoming", "past", "cancelled", "all"]).optional().default("upcoming"),
});
