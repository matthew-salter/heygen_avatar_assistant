"use client";

import { useEffect, useState } from "react";

export default function SelectAvatarPage() {
  const [avatars, setAvatars] = useState<string[]>([]);
  const [selected, setSelected] = useState("");

  // Load avatars when page opens
  useEffect(() => {
    fetch("/api/get-avatars")
      .then((res) => res.json())
      .then((data) => setAvatars(data));
  }, []);

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Select an Avatar</h1>

      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
      >
        <option value="">-- Choose Avatar --</option>
        {avatars.map((av) => (
          <option key={av} value={av}>
            {av.replace(/_/g, " ")}
          </option>
        ))}
      </select>

      {selected && (
        <p style={{ marginTop: "1rem" }}>
          You selected: <strong>{selected.replace(/_/g, " ")}</strong>
        </p>
      )}
    </div>
  );
}