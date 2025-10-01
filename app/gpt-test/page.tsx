"use client";

import { useState } from "react";

export default function GptTestPage() {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setLoading(true);
    setError(null);
    setReply(null);

    try {
      const res = await fetch("/api/gpt-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setReply(data.reply);

      // hook for avatar (will do nothing now, but works once avatar is wired)
      if (typeof window !== "undefined" && (window as any).handleAvatarSpeak) {
        try {
          await (window as any).handleAvatarSpeak(data.reply);
        } catch (e) {
          console.warn("Avatar speak failed:", e);
        }
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", padding: 16, fontFamily: "sans-serif" }}>
      <h1 style={{ fontSize: 24, marginBottom: 12 }}>Custom GPT Test</h1>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Type your question..."
        rows={4}
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 8,
          border: "1px solid #ddd",
          marginBottom: 12,
          background: "#fff",
          color: "#000",
        }}
      />

      <button
        onClick={send}
        disabled={loading || !message.trim()}
        style={{
          padding: "10px 16px",
          borderRadius: 8,
          background: loading ? "#aaa" : "#0ea5e9",
          color: "white",
          border: "none",
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Sending..." : "Send"}
      </button>

      {error && <div style={{ marginTop: 12, color: "red" }}>{error}</div>}
      {reply && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #eee", borderRadius: 8 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Reply</div>
          <div>{reply}</div>
        </div>
      )}
    </div>
  );
}