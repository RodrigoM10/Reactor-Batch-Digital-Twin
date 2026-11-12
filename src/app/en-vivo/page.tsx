import type { Metadata } from "next";
import { LiveView } from "@/components/live";

export const metadata: Metadata = {
  title: "En vivo · Reactor Batch 2.0",
};

export default function EnVivoPage() {
  return <LiveView />;
}
