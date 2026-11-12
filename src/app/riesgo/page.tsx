import type { Metadata } from "next";
import { RiskMapView } from "@/components/risk-map";

export const metadata: Metadata = {
  title: "Mapa de riesgo · Reactor Batch 2.0",
};

export default function RiesgoPage() {
  return <RiskMapView />;
}
