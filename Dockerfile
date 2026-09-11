FROM node:20-slim AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY data ./data

# Cloud Run sets PORT and expects the container to listen on it.
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/index.js"]
