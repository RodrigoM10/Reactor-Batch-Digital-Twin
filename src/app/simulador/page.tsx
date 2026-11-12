import type { Metadata } from "next";
import { Simulator } from "@/components/simulator";

export const metadata: Metadata = {
  title: "Simulador · Reactor Batch 2.0",
};

export default function SimuladorPage() {
  return <Simulator />;
}
