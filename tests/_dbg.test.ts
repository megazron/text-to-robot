import { designDiffDrive, designFourWheel, designMecanum, interference } from "@ttr/design";
for (const [n, f] of [["diff", designDiffDrive], ["four", designFourWheel], ["mec", designMecanum]] as const) {
  const s = f({}); const d = (s.metadata as any).design;
  console.log(n, "fail:", d.checks.filter((c: any) => !c.pass).map((c: any) => c.name + " " + c.detail.slice(0, 80)).join(" | "), "| enclosure:", s.links.filter((l) => /enclosure|lid/.test(l.name)).map((l) => l.name).join(","), "| overlaps:", interference(s).overlaps.map((o: any) => o.a + "/" + o.b).join(","));
}
