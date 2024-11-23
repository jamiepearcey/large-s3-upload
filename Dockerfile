FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV NODE_ENV=production

# These will be overridden by Docker environment variables
ENV PORT=3000
ENV API_KEY=change-this-in-production
ENV USE_S3=true
ENV S3_BUCKET=prod-bucket
ENV AWS_REGION=eu-west-1
ENV AWS_ACCESS_KEY_ID=prod-access-key
ENV AWS_SECRET_ACCESS_KEY=prod-secret-key
ENV S3_ENDPOINT=http://minio:9000

EXPOSE $PORT

CMD ["npm", "run", "start:prod"]