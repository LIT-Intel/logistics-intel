# ---- build stage ----
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage ----
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
CMD ["node","dist/index.js"]
