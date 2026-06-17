import { z } from "zod";
import { normalizePhone } from "@/lib/clients/phone";
import { normalizeSpz } from "@/lib/cars/spz";

/**
 * zod schemas for client/car Server Actions (spec 02 §2.3). Phone and ŠPZ are
 * normalized + validated in the schema (transform), so every action boundary
 * stores and looks up the canonical form.
 */

const phoneSchema = z
  .string()
  .trim()
  .min(1, "Telefónne číslo je povinné.")
  .transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Neplatné telefónne číslo." });
      return z.NEVER;
    }
    return normalized;
  });

// Optional ŠPZ: blank or whitespace-only normalizes to NULL (a plateless car —
// note 1: never an empty string). A non-blank value must be a plausible plate,
// else it's a validation error rather than a silent NULL.
const optionalSpzSchema = z
  .string()
  .trim()
  .optional()
  .transform((v, ctx) => {
    // `.optional()` covers an absent field (undefined); the `!v` check also
    // catches a present-but-blank "" — both mean "plateless" → NULL.
    if (!v) return null;
    const normalized = normalizeSpz(v);
    if (!normalized) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Neplatná ŠPZ." });
      return z.NEVER;
    }
    return normalized;
  });

// A plateless car must still be identifiable, so require a brand or model when
// the ŠPZ is absent (product decision).
const hasCarIdentity = (d: { spz: string | null; brand?: string; model?: string }) =>
  d.spz != null || Boolean(d.brand) || Boolean(d.model);
const carIdentityIssue = {
  message: "Bez ŠPZ zadajte aspoň značku alebo model.",
  path: ["spz"],
};

const nameSchema = z.string().trim().max(120, "Meno je príliš dlhé.").optional();
const brandSchema = z.string().trim().max(60, "Značka je príliš dlhá.").optional();
const modelSchema = z.string().trim().max(120, "Model je príliš dlhý.").optional();
const idSchema = z.string().uuid("Neplatný identifikátor.");
const categorySchema = z.enum(["os", "suv", "van", "dod", "motorka", "stavba"], {
  message: "Neplatná kategória.",
});

export const findClientByPhoneSchema = z.object({ phone: phoneSchema });

export const searchClientsSchema = z.object({
  query: z.string().trim().max(120),
  limit: z.number().int().min(1).max(50).optional(),
});

export const listClientsSchema = z.object({
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(50).default(5),
});

export const createClientSchema = z.object({
  phone: phoneSchema,
  name: nameSchema,
});

export const updateClientSchema = z.object({
  id: idSchema,
  phone: phoneSchema.optional(),
  name: nameSchema,
});

export const deleteClientSchema = z.object({ id: idSchema });

export const addCarToClientSchema = z
  .object({
    clientId: idSchema,
    spz: optionalSpzSchema,
    brand: brandSchema,
    model: modelSchema,
    pricingCategory: categorySchema,
  })
  .refine(hasCarIdentity, carIdentityIssue);

export const linkExistingCarSchema = z.object({
  clientId: idSchema,
  carId: idSchema,
});

export const updateCarSchema = z
  .object({
    id: idSchema,
    spz: optionalSpzSchema,
    brand: brandSchema,
    model: modelSchema,
    pricingCategory: categorySchema,
    // Gates the destructive merge when the new plate collides with another car
    // (spec 02 §2.6). Absent/false → return needsMergeConfirm; true → merge.
    confirmMerge: z.boolean().optional(),
  })
  .refine(hasCarIdentity, carIdentityIssue);

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type AddCarToClientInput = z.infer<typeof addCarToClientSchema>;
