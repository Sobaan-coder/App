import { z } from "zod";

export const brandSchema = z.object({
  name: z.string().trim().min(1).max(80),
  legal_name: z.string().max(120).default(""),
  tagline: z.string().max(160).default(""),
  description: z.string().max(3000).default(""),
  colors: z.array(z.string().regex(/^#[0-9a-f]{3,8}$/i)).max(8).default([]),
  font_preferences: z.string().max(300).default(""),
  visual_style: z.string().max(500).default(""),
  tone: z.string().max(500).default(""),
  location: z.string().max(200).default(""),
  currency: z.string().min(1).max(8).default("USD"),
  contact: z.record(z.string(), z.string().max(200)).default({}),
  website: z.string().max(300).default(""),
  social_links: z.record(z.string(), z.string().max(300)).default({}),
  default_hashtags: z.array(z.string().max(40)).max(30).default([]),
  posting_time: z.string().regex(/^\d{2}:\d{2}$/).default("19:00"),
  is_default: z.boolean().default(false),
  project_id: z.string().uuid().nullable().optional(),
});

export const productSchema = z.object({
  brand_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  category: z.string().max(60).default("General"),
  description: z.string().max(2000).default(""),
  price: z.number().nonnegative().max(1e9).nullable().default(null),
  ingredients: z.array(z.string().max(60)).max(40).default([]),
  special_offer: z.string().max(200).default(""),
  available: z.boolean().default(true),
  marketing_notes: z.string().max(2000).default(""),
  image_file_id: z.string().uuid().nullable().optional(),
});
