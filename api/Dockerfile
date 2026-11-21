FROM node:24-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --chown=node:node app.js server.js ./
USER node
ARG VERSION=dev
ENV NODE_ENV=production APP_VERSION=$VERSION PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]
