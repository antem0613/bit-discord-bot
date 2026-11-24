#Dockerfile
FROM node:24.22.3-alpine

WORKDIR /app

COPY package.json package-lock.json ./

# @discordjs/opus ships prebuilt binaries only for specific Node ABI x musl versions; when none matches
# (e.g. after an Alpine update) it compiles from source. Install the toolchain just for that step and
# remove it in the same layer so the image doesn't keep it.
RUN apk add --no-cache --virtual .build-deps python3 make g++ \
 && npm ci --no-audit --no-fund \
 && apk del .build-deps

COPY . .

EXPOSE 3000

CMD [ "node", "main.js" ]
