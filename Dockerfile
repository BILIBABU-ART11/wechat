FROM node:20-alpine

ENV NODE_ENV=production
ENV PORT=80
WORKDIR /app

COPY server/package*.json ./
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/ \
  && npm ci --omit=dev

COPY server/src ./src

EXPOSE 80

CMD ["npm", "start"]
