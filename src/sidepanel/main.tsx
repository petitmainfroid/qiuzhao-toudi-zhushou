import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { DeveloperTools } from "@developer-tools";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Side panel root element is missing.");

createRoot(root).render(
  <StrictMode>
    <App developerTools={<DeveloperTools />} />
  </StrictMode>
);
