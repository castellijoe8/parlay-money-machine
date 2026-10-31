import { defineConfig } from "@playwright/test";
export default defineConfig({
 testDir:"./tests/e2e",testMatch:"*.spec.ts",workers:1,fullyParallel:false,
 use:{baseURL:"http://127.0.0.1:3200",headless:true,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}},
 webServer:[
  {command:"node --experimental-strip-types tests/e2e/supabase-fixture.mts",url:"http://127.0.0.1:54329/__counts",reuseExistingServer:false,timeout:30000},
  {command:"npm run dev -- --hostname 127.0.0.1 --port 3200",url:"http://127.0.0.1:3200/login",reuseExistingServer:false,timeout:60000,
   env:{NEXT_PUBLIC_SUPABASE_URL:"http://127.0.0.1:54329",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:"test-publishable",SUPABASE_SECRET_KEY:"test-secret",CRON_SECRET:"test-only-cron"}},
 ],
});
