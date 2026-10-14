// Run only in your deployment environment with an E2B account. This incurs
// provider build/storage charges; it is NOT run by npm install or npm run dev.
import { Template, defaultBuildLogger } from "e2b";
if (!process.env.E2B_API_KEY)
  throw new Error("Isi E2B_API_KEY di environment, bukan di kode.");
const name = process.env.E2B_TEMPLATE || "piwuapp-node-audit";
const template = Template()
  .fromNodeImage("22-bookworm")
  .runCmd(
    "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends chromium ca-certificates fonts-liberation && rm -rf /var/lib/apt/lists/*",
    { user: "root" },
  )
  .runCmd("npm install -g lighthouse@13.5.0", { user: "root" })
  .runCmd(
    "id -u user >/dev/null 2>&1 || useradd -m -s /bin/bash user; mkdir -p /home/user/project; chown -R user:user /home/user/project",
    { user: "root" },
  )
  .setEnvs({ CHROME_PATH: "/usr/bin/chromium" })
  .setUser("user")
  .setWorkdir("/home/user/project");
try {
  await Template.build(template, name, {
    apiKey: process.env.E2B_API_KEY,
    cpuCount: 2,
    memoryMB: 2048,
    onBuildLogs: defaultBuildLogger(),
  });
  console.log(
    "Template siap. Set E2B_TEMPLATE=" + name + " di environment server.",
  );
} catch {
  console.error(
    "Template gagal dibuat. Periksa konfigurasi dan dashboard E2B; jangan membagikan kredensial.",
  );
  process.exitCode = 1;
}
