import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router/dom";
import { router } from "./App";
import "./styles.css";

// app.html の <div id="root"> に、URL に合った画面を描く（どの URL でどの画面かは App.tsx の router）。
// StrictMode は開発中だけ、副作用の書き忘れを見つけやすくするために部品を2回描く（本番では1回）
const root = document.getElementById("root");
if (!root) throw new Error("app.html に #root がありません");
createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
