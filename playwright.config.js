// Real Chromium tests exercise the frontend and HTTP server with isolated in-memory telemetry.
import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/browser',
  fullyParallel:false, // Browser scenarios share a single local server and saved configuration.
  workers:1,
  reporter:'list',
  use:{baseURL:'http://127.0.0.1:3107',headless:true,launchOptions:{
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})
  }},
  projects:[{name:'desktop',use:{viewport:{width:1440,height:1000}}},{name:'mobile',use:{viewport:{width:390,height:844},isMobile:true,hasTouch:true}}],
  webServer:{command:'node src/server.js',url:'http://127.0.0.1:3107/health',reuseExistingServer:false,
    env:{PORT:'3107',HOST:'127.0.0.1',DB_PATH:':memory:',SETTINGS_PATH:'./.tools/browser-settings.json',AI_PROVIDER:'none',EMAIL_MODE:'preview',MONITOR_API_KEY:''}}
});
