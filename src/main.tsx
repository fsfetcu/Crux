import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./drag-planner.css";
import "./accounts/accounts.css";
import "./app-feel.css";
import { startAppUpdates } from "./appUpdates";
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
startAppUpdates();
