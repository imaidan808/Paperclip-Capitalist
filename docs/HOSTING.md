# Hosting the game for a class

Written 2026-10-30. What runs where, how to put the missing piece on a free host in about ten minutes, and what to expect from it.

## What runs where

- **The game** is a folder of static files. **GitHub Pages** serves it (the workflow `.github/workflows/pages.yml` runs the tests and publishes on every push to `main`) at `https://imaidan808.github.io/Paperclip-Capitalist/` (the address is case-sensitive). Anyone with the link can open it and play solo, try the Academy, or open a room.
- **A room between the tabs of one browser** needs nothing else: it works on Pages as it is (each tab is its own founder). That is a demo or a single shared lab machine.
- **A room between devices** (a class on their own laptops and phones) needs the **relay**: `server/relay.mjs`, about 250 lines of Node with one dependency (`ws`). It forwards the room's messages, keeps the last snapshot of each founder in memory, writes nothing to disk and never logs what a message holds. GitHub Pages can only serve files, so the relay runs on a host of its own. Students never see it: the instructor's **Copy student link** carries the room code and the relay (`?room=CODE&relay=wss://...`), so a student opens the link, picks an alias and plays.

"Free code-based session", as it stands: an instructor opens the page, presses **Create a room** (a four-letter code), and sends the link or the code; nobody makes an account.

## Put the relay on Render (free)

Render runs a Node service from this repository with no changes, and gives it an https address with the WebSocket support the game needs. You need a Render account of your own (the repository cannot make one).

1. On render.com: **New > Blueprint**, connect the GitHub account, pick `imaidan808/Paperclip-Capitalist`. Render reads `render.yaml` (a free web service, built in `server/`, started with `npm start`, health-checked at `/health`) and asks you to confirm. Press **Apply**.
2. When the deploy finishes, the service has an address like `https://paperclip-relay.onrender.com` (the exact one is on the service's page). Open `https://paperclip-relay.onrender.com/health`: it answers `ok`.
3. Tell the game where it is, one of two ways:
   - **Per room:** the instructor pastes that address into **Relay URL** when creating a room (https is fine: the game turns `https://...` into the `wss://...` a browser needs, and warns when what was typed is not an address). The student link carries it.
   - **For everyone:** set `DEFAULT_RELAY` in `js/config.js` to `wss://paperclip-relay.onrender.com` (the game's own form of the address) and merge it; the title screen then offers it in both forms, and a student who opens the page with no link only types the room code. A relay typed into the form, or carried by a link, wins over it.

## What to expect of the free tier

*(Render's terms change; check its pricing page before relying on any of this. They could not be looked up when this was written.)*

- **The free instance sleeps** after about fifteen minutes with no traffic, and wakes on the next request in about a minute. Open `/health` two minutes before class; a student's browser that arrives early keeps retrying by itself (every 0.8 to 15 seconds), so a late wake is a pause, not a failure.
- **Everything is in memory.** A restart (a deploy of the relay's files, a crash, a wake after sleep) forgets the rooms. The instructor takes the room back with the **recovery code** the dashboard shows (**Keep this room**; write it down at the start of the class), and the students' browsers reconnect by themselves (a class is back as each student next sends a snapshot).
- **Do not merge changes to `server/` during a class**: Render redeploys on a push that touches it (`buildFilter` in `render.yaml`), which restarts the relay.
- **Size.** A room holds 400 connections and a relay 200 rooms (`MAX_ROOM`, `MAX_ROOMS`), and every snapshot is capped (`MAX_SNAP`, `MAX_SNAP_BYTES`); these are the relay's own limits, not measurements of a free instance, which was not tried here.

## Other hosts

- **Any container host** (Fly.io, Railway, a VPS): the `Dockerfile` builds the relay alone: `docker build -t paperclip-relay .` and `docker run -p 8787:8787 paperclip-relay` (the port comes from `PORT`). Put it behind the host's https so the address is `wss://`.
- **No container:** `cd server && npm ci && PORT=8787 npm start`.
- **A lab:** `ws://192.168.1.20:8787` works only for a game page served over plain http from the same lab (`node server/static.mjs` on that machine): a page served over https, as Pages is, cannot open a plain `ws://` socket (the browser blocks it). The game accepts an address like `192.168.1.20:8787` and makes it `ws://`.
- **Cloudflare Workers with Durable Objects** would keep a relay awake on a free plan, but the relay would have to be rewritten as a Worker. Not done.

## What a public relay means

The relay sees the room code, a random Founder ID, the alias a student chose and the game numbers in each message. Anyone who knows its address can open a room on it (rooms are bounded: `MAX_ROOMS`), and it has no check of where a page came from and no Content-Security-Policy on the site: both are decisions waiting for the author (`docs/CLOUD_HANDOFF.md`, "Decisions for the author"). That is fine for a pilot with a class you know; it is not what a university would be sold. The public pages do not call the game free for everyone: it is to be sold to universities and free for their students and classes.

## Checking it

`tests/hosting.test.mjs` holds the address cleaning, the default relay, and that the relay is one file with one dependency and the files above exist. The relay's own behaviour is `tests/multiplayer.test.mjs`, `tests/cloud-audit.test.mjs` and the relay tests of `tests/remaining-engine.test.mjs`. Nothing here was run on Render itself (that needs your account), and the `Dockerfile` was not built: no Docker daemon was running. What was run by hand: `render.yaml` parsed as YAML, and a clean folder holding only what the image holds (`relay.mjs`, `package.json`, `package-lock.json`, `node_modules/ws`) started as a program with `PORT` set, answered `/health` with 200 and accepted a real WebSocket handshake.
