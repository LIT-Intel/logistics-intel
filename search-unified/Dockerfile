FROM node:20-alpine
WORKDIR /srv
COPY package*.json ./
RUN npm install --only=production
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node","server.js"]

