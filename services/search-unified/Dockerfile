FROM node:20-alpine
WORKDIR /srv
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
RUN npm run build
ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
CMD ["npm","run","start"]
