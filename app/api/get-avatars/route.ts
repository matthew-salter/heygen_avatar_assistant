import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { data, error } = await supabase
    .storage
    .from("panelitix") // 👈 replace with your actual bucket name
    .list("Heygen_Avatar_Assistant");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const avatars = data.map((d) => d.name); // folder names
  return NextResponse.json(avatars);
}