import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ProfileEditor } from "../../../shared/options/App";
import { HttpProfileRepository } from "../src/client";

const root = document.getElementById("root");
if (root === null) throw new Error("Profile host root element is missing.");

const repository = new HttpProfileRepository();

createRoot(root).render(
  <StrictMode>
    <ProfileEditor repository={repository} localDataRepository={repository} />
  </StrictMode>
);
