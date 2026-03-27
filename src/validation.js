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

export const bookingRequestSchema = z.object({
  name: z.string().trim().min(1, "name is required").max(100, "name is too long"),
  email: z.string().trim().email("valid email is required"),
  startAt: z.string().trim().min(1, "startAt is required"),
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

export const availabilityUpdateSchema = z
  .object({
    timezone: timezoneSchema,
    rules: z.array(availabilityRuleSchema).max(7),
  })
  .superRefine((value, ctx) => {
    const seenDays = new Set();
    for (const rule of value.rules) {
      if (rule.endMinute <= rule.startMinute) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `endMinute must be greater than startMinute for day ${rule.dayOfWeek}`,
        });
      }

      if (seenDays.has(rule.dayOfWeek)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate dayOfWeek ${rule.dayOfWeek} in rules`,
        });
      }
      seenDays.add(rule.dayOfWeek);
    }
  });

export const bookingsQuerySchema = z.object({
  scope: z.enum(["upcoming", "past", "cancelled", "all"]).optional().default("upcoming"),
});
