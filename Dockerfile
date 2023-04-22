FROM node:slim
WORKDIR /app
COPY . .
RUN npm install
CMD [ "node", "app.js" ]
