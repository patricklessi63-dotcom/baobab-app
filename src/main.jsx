import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./tailwind.css";

const debugParam = new URLSearchParams(window.location.search).get("debug");

async function render() {
  if (debugParam === "mic") {
    const { default: DebugMic } = await import("./_debugMic.jsx");
    ReactDOM.createRoot(document.getElementById("root")).render(
      <React.StrictMode>
        <DebugMic />
      </React.StrictMode>
    );
    return;
  }
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

render();
