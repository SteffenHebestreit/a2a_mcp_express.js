FROM node:18-alpine
WORKDIR /usr/src/app
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src
RUN npm install && \
    npm i --save-dev @types/cors && \
    npm i --save-dev @types/express && \
    npm run build
COPY . .
EXPOSE 9000
CMD ["node", "dist/server.js"]