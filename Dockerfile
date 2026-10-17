FROM node:22-alpine
WORKDIR /app
COPY . .
RUN npm ci --omit=dev
ENV PORT=8787
ENV TTR_DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "apps/api/src/server.ts"]
