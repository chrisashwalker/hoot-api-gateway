## Creation
npx express-generator --view=ejs hoot-api-gateway

## Install dependencies
npm install

## Run
npm start

## Build image
docker build -t hoot-api-gateway .

## Create and run container
docker run --name hoot-api-gateway-container -p 8004:8004 hoot-api-gateway