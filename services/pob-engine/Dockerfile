FROM node:22-bookworm-slim
ARG POB_COMMIT=32d4c87bf7888bf82c01d9e544f3bbb30f01f267
ENV POB_COMMIT=$POB_COMMIT POB_SRC=/opt/pob/src POB_BRIDGE=/opt/service/bridge.lua LUA_PATH=/opt/pob/runtime/lua/?.lua;/opt/pob/runtime/lua/?/init.lua;;
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git luajit luarocks build-essential && rm -rf /var/lib/apt/lists/*
RUN luarocks --lua-version=5.1 --lua-dir=/usr install luautf8 0.2.1-1
RUN git clone https://github.com/PathOfBuildingCommunity/PathOfBuilding.git /opt/pob && cd /opt/pob && git checkout "$POB_COMMIT"
WORKDIR /opt/service
COPY bridge.lua server.mjs ./
EXPOSE 8080
CMD ["node", "server.mjs"]
