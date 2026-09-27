import { useApp, useProfile } from "../app-context";
import { PageHead, Seg } from "../ui/components";
import { BodyTab } from "./track/BodyTab";
import { ChastityTab } from "./track/ChastityTab";
import { FoodTab } from "./track/FoodTab";
import { HrtLogTab } from "./track/HrtLogTab";
import { HypnoTab } from "./track/HypnoTab";
import { MobilityTab } from "./track/MobilityTab";

type Sub = "food" | "body" | "hrt" | "hypno" | "chastity" | "mobility";

export function Track({ sub }: { sub?: string }) {
  const { go } = useApp();
  const p = useProfile();
  const tab = (sub as Sub) || "food";
  const options: { value: Sub; label: string }[] = [
    { value: "food", label: "Food" },
    { value: "body", label: "Body" },
    { value: "hrt", label: "HRT" },
    ...(p.modules.hypno ? [{ value: "hypno" as Sub, label: "Hypno" }] : []),
    ...(p.modules.chastity ? [{ value: "chastity" as Sub, label: "Chastity" }] : []),
    { value: "mobility", label: "Mobility" },
  ];
  return (
    <>
      <PageHead eyebrow="Track" title={options.find((o) => o.value === tab)?.label ?? "Track"} />
      <Seg value={tab} options={options} onChange={(v) => go("track", v)} />
      {tab === "food" && <FoodTab />}
      {tab === "body" && <BodyTab />}
      {tab === "hrt" && <HrtLogTab />}
      {tab === "hypno" && <HypnoTab />}
      {tab === "chastity" && <ChastityTab />}
      {tab === "mobility" && <MobilityTab />}
    </>
  );
}
