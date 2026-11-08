import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getUid, unauthorized } from "@/lib/session";
import { STAGED_MAX_BYTES } from "@/lib/telegram";

// Issues short-lived tokens so the browser can put ciphertext straight into the
// temporary blob store. The object is deleted as soon as storage has fetched it.
export async function POST(req: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "staged uploads are off" }, { status: 404 });
  const uid = await getUid();
  if (!uid) return unauthorized();
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!pathname.startsWith("tmp/")) throw new Error("bad path");
        return {
          allowedContentTypes: ["application/octet-stream"],
          maximumSizeInBytes: STAGED_MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: uid,
        };
      },
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(json);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
