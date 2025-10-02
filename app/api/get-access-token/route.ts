import { NextResponse } from "next/server";

export async function GET() {
  // Debug: check if env var is actually injected
  console.log("DEBUG HEYGEN_API_KEY:", process.env.HEYGEN_API_KEY?.slice(0, 6));

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
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}), // body can be empty
  });

  const raw = await res.text();
  let json: any;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { error: "Unexpected response from HeyGen", raw: raw.slice(0, 300) },
      { status: 502 }
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: json?.error || "HeyGen token error", details: json },
      { status: res.status }
    );
  }

  const token = json?.data?.token;
  if (!token) {
    return NextResponse.json(
      { error: "No token in HeyGen response", details: json },
      { status: 502 }
    );
  }

  return NextResponse.json({ token });
}