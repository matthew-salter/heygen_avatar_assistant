import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.HEYGEN_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing HEYGEN_API_KEY" },
      { status: 500 }
    );
  }

  const res = await fetch("https://api.heygen.com/v1/streaming.create_token", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
  });

  const json = await res.json();

  if (!res.ok) {
    return NextResponse.json(
      { error: json?.error || "HeyGen token error", details: json },
      { status: res.status }
    );
  }

  // ✅ Return just the raw JWT string
  return NextResponse.json({ token: json.data.token });
}