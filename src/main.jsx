import React from "react";
import { createRoot } from "react-dom/client";
import { LhqApp as App } from "./lhq/LhqApp.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
