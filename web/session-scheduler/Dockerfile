#Dockerfile
FROM node:22.13.1-alpine

WORKDIR /app

COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./

RUN npm install

COPY . .

EXPOSE 3000

CMD [ "npm", "run", "dev" ]