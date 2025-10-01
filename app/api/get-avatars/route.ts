import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data, error } = await supabase
    .storage
    .from("panelitix") // 👈 use your bucket name here
    .list("Heygen_Avatar_Assistant");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Only return folders
  const avatars = data
    .filter((d) => d.metadata?.name === null) // ensures it's a folder
    .map((d) => d.name);

  return NextResponse.json(avatars);
}