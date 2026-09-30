export const PLATFORMS = ["instagram", "facebook", "tiktok", "youtube", "snapchat"] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface Brand {
  id: string;
  user_id: string;
  name: string;
  legal_name: string;
  tagline: string;
  description: string;
  logo_file_id: string | null;
  colors: string[];
  font_preferences: string;
  visual_style: string;
  tone: string;
  location: string;
  currency: string;
  contact: Record<string, string>;
  website: string;
  social_links: Record<string, string>;
  default_hashtags: string[];
  posting_time: string;
  is_default: boolean;
}

export interface Product {
  id: string;
  user_id: string;
  brand_id: string;
  name: string;
  category: string;
  description: string;
  price: string | number | null;
  ingredients: string[];
  image_file_id: string | null;
  special_offer: string;
  available: boolean;
  marketing_notes: string;
}

export interface CaptionSet {
  platform: Platform;
  title: string;
  caption: string;
  hashtags: string[];
  extra?: Record<string, unknown>;
}

export interface ContentPost {
  id: string;
  user_id: string;
  brand_id: string | null;
  product_id: string | null;
  campaign_id: string | null;
  title: string;
  idea: string;
  content_category: string;
  status: "idea" | "draft" | "approval" | "approved" | "scheduled" | "published" | "failed" | "rejected";
  platforms: Platform[];
  scheduled_at: string | null;
  image_id: string | null;
  image_prompt: unknown;
  quality_report: unknown;
  run_id: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export const PLATFORM_LIMITS: Record<Platform, { caption: number; title?: number; hashtags: number; label: string }> = {
  instagram: { caption: 2200, hashtags: 30, label: "Instagram" },
  facebook: { caption: 63206, hashtags: 10, label: "Facebook" },
  tiktok: { caption: 2200, hashtags: 10, label: "TikTok" },
  youtube: { caption: 5000, title: 100, hashtags: 15, label: "YouTube Shorts" },
  snapchat: { caption: 250, hashtags: 3, label: "Snapchat" },
};

export const CONTENT_CATEGORIES = [
  "Pizza",
  "Burger",
  "Wrap",
  "Shawarma",
  "Deals",
  "Behind the scenes",
  "Kitchen",
  "Customers",
  "Staff",
  "Brand",
  "Promotions",
  "Educational",
  "Entertainment",
] as const;
