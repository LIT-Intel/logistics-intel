# ---- build stage ----
FROM node:20-alpine AS build

# Work inside /srv
WORKDIR /srv

# Install deps for search-unified service
COPY services/search-unified/package*.json ./
RUN npm ci

# Copy the service source into the image
COPY services/search-unified ./

# Build TypeScript -> dist/
RUN npm run build

# ---- runtime stage ----
FROM node:20-alpine

WORKDIR /srv
ENV NODE_ENV=production PORT=8080

# Install production deps for the service
COPY services/search-unified/package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

# Copy built JS
COPY --from=build /srv/dist ./dist

EXPOSE 8080
CMD ["node", "dist/index.js"]
