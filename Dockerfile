FROM node:18-alpine

WORKDIR /app

# 设置镜像代理
RUN sed -i 's|https://dl-cdn.alpinelinux.org|https://mirrors.aliyun.com|g' /etc/apk/repositories

# 安装依赖
COPY package*.json ./
RUN npm install --production --registry=https://registry.npmmirror.com

# 源码通过volume挂载，无需复制

# 创建音乐目录
RUN mkdir -p /music

# 暴露端口
EXPOSE 3001

# 启动命令
CMD ["node", "src/server.js"]
