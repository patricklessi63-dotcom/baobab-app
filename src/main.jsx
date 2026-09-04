import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ImageLightboxProvider } from "./lib/ImageLightboxContext";
import RootErrorBoundary from "./components/RootErrorBoundary";
import "./tailwind.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <ImageLightboxProvider>
        <App />
      </ImageLightboxProvider>
    </RootErrorBoundary>
  </React.StrictMode>
);
