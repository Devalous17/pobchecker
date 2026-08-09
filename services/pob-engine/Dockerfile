FROM node:22-bookworm-slim
ARG POB_COMMIT=32d4c87bf7888bf82c01d9e544f3bbb30f01f267
ENV POB_COMMIT=$POB_COMMIT POB_SRC=/opt/pob/src POB_BRIDGE=/opt/service/bridge.lua
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git luajit && rm -rf /var/lib/apt/lists/*
RUN git clone https://github.com/PathOfBuildingCommunity/PathOfBuilding.git /opt/pob && cd /opt/pob && git checkout "$POB_COMMIT"
WORKDIR /opt/service
COPY bridge.lua server.mjs ./
EXPOSE 8080
CMD ["node", "server.mjs"]
