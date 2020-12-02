FROM node:13.8-alpine

ARG SHORT_LATEST_COMMIT="None"
ARG LOG_LATEST_COMMIT="None"

ENV NODE_ENV=production
WORKDIR /usr/src/lion
COPY package.json .
RUN npm install\
	&& npm install tsc -g
COPY . .

RUN mkdir -p /var/status_plugin;\
	echo ${SHORT_LATEST_COMMIT} > /var/status_plugin/short_latest_commit;\
	echo ${LOG_LATEST_COMMIT} > /var/status_plugin/log_latest_commit;

RUN npm run build
CMD ["node", "./dist/index.js"]
