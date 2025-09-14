# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /srv
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine
WORKDIR /srv
ENV NODE_ENV=production PORT=8080
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY --from=build /srv/dist ./dist
EXPOSE 8080
CMD ["node","dist/index.js"]
