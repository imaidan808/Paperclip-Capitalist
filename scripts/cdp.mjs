// Headless Chrome over the DevTools protocol, for driving the app in tests and screenshots.
// launch(port) starts a Chrome with a throw-away profile (under CHROME_PROFILES, default the OS temp folder; removed on close, so call close()).
// open(browser, url, {w,h,mobile,dsf,reduced}) opens a page and returns helpers: send, logs, eval, shot, key, click, clickSel, mouse, drag, rect, sleep, close.
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { CHROME as CH, chromeArgs, chromeReady } from "./chrome.mjs"; // the Chrome this machine has (CHROME_BIN names one): scripts/chrome.mjs
const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function launch(port = 9333) {
  const base = process.env.CHROME_PROFILES || tmpdir();
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(base + "/pl-chrome-");
  if (!CH) throw new Error("No Chrome or Chromium found: set CHROME_BIN to one (scripts/chrome.mjs looks for the usual places)");
  const proc = spawn(CH, [...chromeArgs(), `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  try { await chromeReady(proc, port); } catch (e) { try { proc.kill("SIGKILL"); } catch {} try { rmSync(dir, { recursive: true, force: true }); } catch {} throw e; } // (the reason, not "fetch failed" later)
  return { port, close: () => { try { proc.kill("SIGKILL"); } catch {} setTimeout(() => { try { rmSync(dir, { recursive: true, force: true }); } catch {} }, 700); } };
}
// A page's DevTools socket: opened, or an error that says which socket and why (a socket that never opens used to leave `open` waiting for ever, and a test then ended only at its own timeout, 15 minutes later)
const connect = (url, ms = 30000) => new Promise((ok, no) => {
  const ws = new WebSocket(url), fail = (why) => { clearTimeout(timer); no(new Error(`the page's DevTools socket ${why}: ${url}`)); }, timer = setTimeout(() => fail(`did not open in ${ms / 1000} s`), ms);
  ws.addEventListener("open", () => { clearTimeout(timer); ok(ws); }, { once: true });
  ws.addEventListener("error", () => fail("could not be opened"), { once: true });
  ws.addEventListener("close", () => fail("closed before it opened"), { once: true });
});
export async function open(b, url, { w = 1280, h = 900, mobile = false, dsf = 1, reduced = false } = {}) {
  const root = `http://127.0.0.1:${b.port}`;
  let t, ws; // a page that would not open its socket is closed and another is made: three tries
  for (let tries = 1; ; tries++) {
    t = await (await fetch(`${root}/json/new?about:blank`, { method: "PUT", signal: AbortSignal.timeout(30000) })).json();
    try { ws = await connect(t.webSocketDebuggerUrl); break; }
    catch (e) { try { await fetch(`${root}/json/close/${t.id}`, { signal: AbortSignal.timeout(5000) }); } catch {} if (tries >= 3) throw e; await sleep(300 * tries); }
  }
  let id = 0, ending = false; const pend = new Map(), logs = [];
  // a socket that closes by itself (Chrome let the page go) answers every request that is waiting with an error; one that this side closes (`close`) leaves them as they were
  let why = ""; // what Chrome said when it let the page go (a code and a reason: 1006 is a connection that was cut), for the error of every request that was, or comes, after
  ws.addEventListener("close", (ev) => { if (ending) return; why = `closed (code ${ev.code}${ev.reason ? ", " + ev.reason : ""})`; for (const f of pend.values()) f({ error: { message: "the page's DevTools socket " + why } }); pend.clear(); });
  ws.addEventListener("message", ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } else if (m.method === "Runtime.consoleAPICalled") logs.push(m.params.type + ": " + m.params.args.map(a => a.value ?? a.description).join(" ")); else if (m.method === "Runtime.exceptionThrown") logs.push("EXC: " + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)); });
  const send = (method, params = {}) => new Promise((res, rej) => { if (ws.readyState !== 1 && !ending) return rej(new Error(method + ": the page's DevTools socket is " + (why || "closed"))); const i = ++id; pend.set(i, m => m.error ? rej(new Error(method + ": " + m.error.message)) : res(m.result)); ws.send(JSON.stringify({ id: i, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: dsf, mobile });
  if (reduced) await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await send("Page.navigate", { url });
  await sleep(700);
  const api = {
    send, logs,
    async eval(expr) { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; },
    async shot(path, o = {}) { const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!o.full, ...(o.clip ? { clip: { ...o.clip, scale: 1 } } : {}) }); writeFileSync(path, Buffer.from(r.data, "base64")); },
    async key(key, o = {}) { const code = o.code || (key.length === 1 ? "Key" + key.toUpperCase() : key); const base = { key, code, windowsVirtualKeyCode: o.vk || ({ Tab: 9, Enter: 13, Escape: 27, " ": 32, ArrowRight: 39, ArrowLeft: 37, ArrowDown: 40, ArrowUp: 38, Home: 36, End: 35 }[key] || key.toUpperCase().charCodeAt(0)), modifiers: o.mod || 0 };
      await send("Input.dispatchKeyEvent", { type: o.text !== undefined || key.length === 1 || key === "Enter" || key === " " ? "keyDown" : "rawKeyDown", ...base, text: key === "Enter" ? "\r" : key.length === 1 ? key : undefined });
      await send("Input.dispatchKeyEvent", { type: "keyUp", ...base }); await sleep(o.wait ?? 120); },
    async click(x, y) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }); await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 }); await sleep(150); },
    async clickSel(sel) { const r = await api.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'center'});const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`); if (!r) throw new Error("no " + sel); await sleep(150); const r2 = await api.eval(`(()=>{const b=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}})()`); await api.click(r2.x, r2.y); },
    async mouse(type, x, y, o = {}) { await send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" && !o.down ? "none" : "left", buttons: o.down ? 1 : 0, clickCount: type === "mouseMoved" ? 0 : 1, modifiers: o.mod || 0 }); },
    async drag(a, b, o = {}) { await api.mouse("mouseMoved", a.x, a.y); await api.mouse("mousePressed", a.x, a.y, { down: true }); const n = o.steps || 8; for (let i = 1; i <= n; i++) { await api.mouse("mouseMoved", a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n, { down: true, mod: o.mod }); await sleep(20); } if (o.mid) await o.mid(); await api.mouse("mouseReleased", b.x, b.y, { down: false, mod: o.mod }); await sleep(250); },
    async rect(sel) { return await api.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,cx:b.x+b.width/2,cy:b.y+b.height/2}})()`); },
    sleep, close: async () => { ending = true; try { ws.close(); await fetch(`${root}/json/close/${t.id}`); } catch {} },
  };
  return api;
}
