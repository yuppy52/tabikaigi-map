import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// app.html の <div id="root"> に、アプリの画面を描く。
// StrictMode は開発中だけ、副作用の書き忘れを見つけやすくするために部品を2回描く（本番では1回）
const root = document.getElementById("root");
if (!root) throw new Error("app.html に #root がありません");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
