FROM node:20-alpine

ENV NODE_ENV=production
ENV PORT=80
WORKDIR /app

COPY package*.json ./
RUN npm config set registry https://mirrors.cloud.tencent.com/npm/ \
  && npm install --omit=dev

COPY index.js ./index.js
COPY server/src ./server/src

EXPOSE 80

CMD ["npm", "start"]
