import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ImageLightboxProvider } from "./lib/ImageLightboxContext";
import "./tailwind.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ImageLightboxProvider>
      <App />
    </ImageLightboxProvider>
  </React.StrictMode>
);
