// Screenshots every page of the built desktop app at 1366x768 (the Clinic
// PC's likely screen) with a few sample records, for design review:
//   npm run desktop:build && node scripts/screenshot-clinic-pc.mjs /tmp/shots
import { _electron as electron } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
const repo = process.cwd();
const out = process.argv[2];
const app = await electron.launch({
  executablePath: path.join(repo, "desktop/node_modules/electron/dist/electron"),
  args: [path.join(repo, "desktop")],
  env: { ...process.env, CLINIC_DATA_DIR: mkdtempSync(path.join(tmpdir(), "audit-")), CLINIC_REMOVABLE_DRIVES: "" },
});
const win = await app.firstWindow();
await win.setViewportSize({ width: 1366, height: 768 });
await win.waitForTimeout(1500);
await win.evaluate(async () => {
  await fetch("/api/patients/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: "number,name,dob,sex,phone\n1041,Ananya Deshmukh,14/03/1994,f,98765 43210\n1042,Rohan Shah,02/11/1988,m,98220 11223\n1043,Kavya Mehta,,f,\n1044,माधुरी देशमुख,05/06/1961,f,97000 55442" }) });
  const res = await fetch("/api/patients?q=Ananya"); const { patients } = await res.json(); const p = patients[0];
  const consultation = { visitType: "new", linkedPriorVisit: null, doctorName: "Dr. Makarand Vishwas Apte",
    patient: { patientId: p.id, patientNumber: p.number, name: p.name, age: p.age, dateOfBirth: p.dateOfBirth, sex: "Female", phone: p.phone },
    consultationDate: "2026-09-19", vitals: { weight: "62", temperature: "100.2", pulse: "88", systolic: "118", diastolic: "76", spo2: "98" },
    complaints: ["Low-grade fever", "Dry cough"], examinationFindings: ["Throat congestion"], provisionalDiagnosis: "Viral upper respiratory tract infection",
    advice: ["Warm saline gargles", "Maintain hydration"], investigations: [],
    medicines: [{ name: "Paracetamol 500 mg tablet", dose: "1–0–1", duration: "5 days", method: "After food" }, { name: "Levocetirizine 5 mg tablet", dose: "", duration: "", method: "" }] };
  await fetch("/api/consultation-drafts/draft-audit-0001", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ consultation, revision: 1 }) });
  localStorage.setItem("vishwas-clinic-demo-draft-id", "draft-audit-0001");
});
for (const [name, route] of [["prescription","/"],["patients","/patients"],["receipts","/receipts"],["certificate","/medical-certificate"],["summaries","/summaries"],["backups","/backups"]]) {
  await win.goto(`clinic://app${route}`);
  await win.waitForTimeout(1500);
  await win.screenshot({ path: `${out}/${name}.png` });
  await win.screenshot({ path: `${out}/${name}-full.png`, fullPage: true });
}
await win.goto("clinic://app/");
await win.waitForTimeout(1200);
await win.getByRole("button", { name: "Review prescription" }).click();
await win.waitForTimeout(800);
await win.screenshot({ path: `${out}/review.png` });
await app.close();
