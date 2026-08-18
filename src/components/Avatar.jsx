import React from "react";
import { C } from "../constants";

export default function Avatar({ name, size = 44, url }) {
  const initial = (name || "?").trim().charAt(0).toUpperCase();
  if (url) {
    return (
      <img
        src={url}
        alt={name}
        loading="lazy"
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          flexShrink: 0,
          boxShadow: "0 1px 3px rgba(20,29,56,0.15)",
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `linear-gradient(135deg, ${C.clay}, ${C.ochre})`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontFamily: "'Fraunces', serif",
        fontWeight: 600,
        fontSize: size * 0.4,
        flexShrink: 0,
      }}
    >
      {initial}
    </div>
  );
}
