FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
COPY pnpm-lock.yaml ./

RUN npm install -g pnpm

RUN pnpm install

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
ENV DISABLE_CORS=false

EXPOSE 3000

CMD ["pnpm", "start"]