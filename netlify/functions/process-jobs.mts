// Netlify Scheduled Function: the Netlify equivalent of the Vercel cron in vercel.json.
// Uploads are processed right away via after(); this only picks up retries and jobs
// that were cut off by a timeout.
export default async function processJobs(): Promise<Response> {
  const site = process.env.URL; // set by Netlify to the site's primary URL
  const secret = process.env.CRON_SECRET;
  if (!site || !secret) return new Response("URL or CRON_SECRET is not set", { status: 500 });
  const res = await fetch(`${site}/api/cron/process-jobs`, {
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(25_000),
  }).catch((err: unknown) => new Response(String(err), { status: 502 }));
  return new Response(await res.text(), { status: res.status });
}

export const config = { schedule: "*/10 * * * *" };
