FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node server.js ./
COPY --chown=node:node public ./public
RUN mkdir -p /app/data && chown node:node /app/data
USER node
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
VOLUME ["/app/data"]
CMD ["node", "server.js"]
