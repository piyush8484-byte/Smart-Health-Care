FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY server/package.json ./server/package.json
RUN npm install
COPY server ./server
RUN npm run build --workspace server

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
COPY server/package.json ./server/package.json
RUN npm install --omit=dev
COPY --from=build /app/server/dist ./server/dist
WORKDIR /app/server
EXPOSE 5000
CMD ["node", "dist/server.js"]