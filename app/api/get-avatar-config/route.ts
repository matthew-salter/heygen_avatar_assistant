import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Uses your current Render env: CUSTOM_GPT_FOLDER=Heygen_Avatar_Assistant/Test_Avatar
export async function GET() {
  const bucket = process.env.SUPABASE_BUCKET_NAME!; // set this in Render to your actual bucket
  const base = process.env.CUSTOM_GPT_FOLDER!;      // "Heygen_Avatar_Assistant/Test_Avatar"
  const filePath = `${base}/Config/config.json`;

  const { data, error } = await supabase.storage.from(bucket).download(filePath);
  if (error) {
    return NextResponse.json({ error: `Config not found: ${error.message}` }, { status: 404 });
  }
  const text = await data.text();

  // validate JSON + add fallback displayName if missing
  let config: any;
  try { config = JSON.parse(text); } 
  catch { return NextResponse.json({ error: "Invalid JSON in config.json" }, { status: 500 }); }

  if (!config.displayName) {
    const folderName = base.split("/").pop() ?? "Avatar";
    config.displayName = folderName.replace(/_/g, " ");
  }

  return NextResponse.json(config);
}