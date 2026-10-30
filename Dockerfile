# The classroom relay (server/relay.mjs) as a container, for any host that runs one (Fly.io, Railway, a VPS, a lab machine).
#   docker build -t paperclip-relay .
#   docker run -p 8787:8787 paperclip-relay          (PORT is read from the environment, 8787 by default)
# The relay is one file with one dependency (ws). It keeps nothing on disk: rooms live in memory. docs/HOSTING.md.
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev
COPY server/relay.mjs ./
ENV PORT=8787
EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "relay.mjs"]
