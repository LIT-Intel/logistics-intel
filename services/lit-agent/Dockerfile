FROM node:20-slim
WORKDIR /srv
COPY package.json package-lock.json ./
RUN npm ci --only=production
COPY src ./src
ENV PORT=8080
CMD ["npm","start"]