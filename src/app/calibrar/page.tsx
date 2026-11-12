import type { Metadata } from "next";
import { Calibrate } from "@/components/calibrate";

export const metadata: Metadata = {
  title: "Calibrar con datos · Reactor Batch 2.0",
};

export default function CalibrarPage() {
  return <Calibrate />;
}
