import { route } from "@/lib/api";
import { withUser } from "@/lib/db";
import { AppError, notFound } from "@/lib/errors";
import { saveFile } from "@/services/storage";
import { recheckPost } from "@/services/content/posts";

/** Replace the post image with your own upload (e.g. from the manual Gemini workflow). */
export const POST = route<{ id: string }>({ rateLimit: 20 }, async ({ req, user, params }) => {
  const form = await req.formData();
  const f = form.get("file");
  if (!f || typeof f !== "object" || !("arrayBuffer" in f)) throw new AppError("No image received");
  const file = f as File;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new AppError("Upload a PNG, JPEG or WebP image");
  const data = Buffer.from(await file.arrayBuffer());
  const sharp = (await import("sharp")).default;
  const meta = await sharp(data).metadata().catch(() => null);
  if (!meta?.width) throw new AppError("That file is not a valid image");
  return withUser(user.id, async (db) => {
    const post = await db.one("select id from content_posts where id = $1", [params.id]);
    if (!post) throw notFound("Post");
    const saved = await saveFile(db, user.id, { name: file.name, folder: "media", data, mime: file.type, source: "upload", tags: ["content", "manual"] });
    const gi = await db.one<{ id: string }>(
      "insert into generated_images(user_id, post_id, file_id, provider, prompt, width, height, status) values ($1,$2,$3,'manual','(uploaded by you)',$4,$5,'generated') returning id",
      [user.id, params.id, saved.id, meta.width, meta.height],
    );
    await db.query("update content_posts set image_id = $2 where id = $1", [params.id, gi!.id]);
    return { imageId: gi!.id, quality: await recheckPost(db, params.id) };
  });
});
