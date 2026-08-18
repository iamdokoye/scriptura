import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import PresentationView from "./views/PresentationView";
import "./styles/globals.css";

const isPresentation = (window as { __SCRIPTURA_PRESENTATION__?: boolean }).__SCRIPTURA_PRESENTATION__ === true;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isPresentation ? <PresentationView /> : <App />}
  </React.StrictMode>
);
