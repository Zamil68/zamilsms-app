FROM node:20-slim
WORKDIR /opt/zamil
COPY server/ /opt/zamil/server/
COPY web/ /home/sk-khan/htdocs/sk-khan.online/
WORKDIR /opt/zamil/server
RUN npm ci --omit=dev
EXPOSE 8787
CMD ["node","v2.js"]
