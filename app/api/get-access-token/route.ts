import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.HEYGEN_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing HEYGEN_API_KEY" },
      { status: 500 }
    );
  }

  try {
    const res = await fetch("https://api.heygen.com/v1/streaming.create_token", {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
    });

    const json = await res.json();

    if (!res.ok) {
      return NextResponse.json(
        { error: json?.error || "Failed to create token", details: json },
        { status: res.status }
      );
    }

    // HeyGen responds with { data: { token: "<JWT>" } }
    return NextResponse.json({ token: json.data.token });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Unexpected error" },
      { status: 500 }
    );
  }
}