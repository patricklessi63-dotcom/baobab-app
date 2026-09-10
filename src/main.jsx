import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ImageLightboxProvider } from "./lib/ImageLightboxContext";
import RootErrorBoundary from "./components/RootErrorBoundary";
import { initErrorReporter } from "./lib/errorReporter";
import "./tailwind.css";

// Filet de suivi d'erreurs prod (aucun avant) : handlers globaux "error" /
// "unhandledrejection" qui écrivent dans la table Supabase `client_errors`.
// No-op en dev local. Voir src/lib/errorReporter.js.
initErrorReporter();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RootErrorBoundary>
      <ImageLightboxProvider>
        <App />
      </ImageLightboxProvider>
    </RootErrorBoundary>
  </React.StrictMode>
);
