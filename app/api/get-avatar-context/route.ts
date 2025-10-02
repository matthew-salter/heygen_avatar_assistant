import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function readFolderText(bucket: string, prefix: string) {
  const { data: list, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(error.message);

  let out = "";
  for (const item of list ?? []) {
    // only read .txt for this first pass
    if (!item.name.toLowerCase().endsWith(".txt")) continue;

    const path = `${prefix}/${item.name}`;
    const { data: file, error: dlErr } = await supabase.storage.from(bucket).download(path);
    if (dlErr) continue;

    out += `\n\n===== ${item.name} =====\n`;
    out += await file.text();
  }
  return out.trim();
}

export async function GET() {
  const bucket = process.env.SUPABASE_BUCKET_NAME!;
  const base = process.env.CUSTOM_GPT_FOLDER!; // "Heygen_Avatar_Assistant/Test_Avatar"

  try {
    const instructions = await readFolderText(bucket, `${base}/Instructions`);
    const knowledge    = await readFolderText(bucket, `${base}/Knowledge_Base`);
    return NextResponse.json({ instructions, knowledge });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}