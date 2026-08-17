"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export function AutoRefresh({ ms = 30000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(()=>{ const id=setInterval(()=>router.refresh(),ms); return()=>clearInterval(id); },[ms,router]);
  return null;
}
