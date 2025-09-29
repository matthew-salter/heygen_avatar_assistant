const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY;
const BASE_API_URL = process.env.NEXT_PUBLIC_BASE_API_URL;

export async function POST() {
  try {
    if (!HEYGEN_API_KEY) {
      throw new Error("HEYGEN_API_KEY environment variable is not set.");
    }

    if (!BASE_API_URL) {
      throw new Error(
        "NEXT_PUBLIC_BASE_API_URL environment variable is not set.",
      );
    }

    const res = await fetch(`${BASE_API_URL}/v1/streaming.create_token`, {
      method: "POST",
      headers: {
        "x-api-key": HEYGEN_API_KEY,
      },
    });

    console.log("Response:", res);

    const data = await res.json();

    return new Response(data.data.token, {
      status: 200,
    });
  } catch (error) {
    console.error("Error retrieving access token:", error);

    const message =
      error instanceof Error && error.message
        ? error.message
        : "Failed to retrieve access token";

    return new Response(message, {
      status: 500,
    });
  }
}
