import { AwsClient } from "aws4fetch";

/**
 * Cloudflare R2, spoken to over its S3-compatible API.
 *
 * The bucket is private and stays private. An invitation card carries a venue,
 * a date and a family's names, and a public object URL for one is public
 * forever — so nothing here ever produces a shareable link. WhatsApp gets the
 * bytes through Meta's media endpoint, and the organizer's own preview is
 * streamed back through an authenticated route.
 *
 * `aws4fetch` rather than the AWS SDK: this needs request signing and nothing
 * else, and the SDK is megabytes of client machinery to get it.
 */

export type R2Config = {
  client: AwsClient;
  endpoint: string;
  bucket: string;
};

/**
 * Null when unset, mirroring `configFromEnv` in the WhatsApp client — an
 * unconfigured environment makes the feature unavailable, never broken.
 */
export function r2FromEnv(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;

  return {
    client: new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" }),
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    bucket,
  };
}

const url = (config: R2Config, key: string) =>
  `${config.endpoint}/${config.bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

export async function putObject(
  config: R2Config,
  key: string,
  body: ArrayBuffer | Uint8Array,
  contentType: string,
): Promise<void> {
  // A copy on its own ArrayBuffer: exactly the bytes, nothing either side.
  const bytes = new Uint8Array(body);

  // Signed here, sent with plain `fetch` — never `client.fetch`, which hands
  // `fetch` a Request object. On Vercel something between us and the network
  // rebuilds that Request, its body becomes a stream of unknown length, and it
  // goes out chunked: R2 answers 411 MissingContentLength. It worked on every
  // Node version and in a local production build, so the fix cannot rely on
  // whoever wraps `fetch` — raw bytes and an explicit length leave no room.
  const signed = await config.client.sign(url(config, key), {
    method: "PUT",
    body: bytes,
    headers: { "content-type": contentType },
  });
  const headers = new Headers(signed.headers);
  headers.set("content-length", String(bytes.byteLength));

  const response = await fetch(signed.url, {
    method: "PUT",
    headers,
    body: bytes,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`R2 PUT ${key} failed: ${response.status} ${await response.text()}`);
  }
}

/** The bytes back, for re-uploading to Meta when a media handle expires. */
export async function getObject(config: R2Config, key: string): Promise<ArrayBuffer | null> {
  const response = await config.client.fetch(url(config, key));
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`R2 GET ${key} failed: ${response.status} ${await response.text()}`);
  }
  return response.arrayBuffer();
}

export async function deleteObject(config: R2Config, key: string): Promise<void> {
  const response = await config.client.fetch(url(config, key), { method: "DELETE" });
  // 404 is success for our purposes: the object is not there, which is the goal.
  if (!response.ok && response.status !== 404) {
    throw new Error(`R2 DELETE ${key} failed: ${response.status} ${await response.text()}`);
  }
}
