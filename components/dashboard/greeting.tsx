"use client";
import { useEffect, useState } from "react";

export function Greeting({ name }: { name: string }) {
  const [part, setPart] = useState<string | null>(null);
  useEffect(() => {
    const h = new Date().getHours();
    setPart(h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening");
  }, []);
  return (
    <span>
      {part ?? "Welcome back"}, {name}
    </span>
  );
}
