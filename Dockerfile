# 使用 node:20-alpine 作为基础镜像
FROM node:20-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json (如果存在)
COPY package*.json ./

# 安装依赖
RUN npm install

# 复制项目文件
COPY . .

# 创建下载目录
RUN mkdir -p downloads

# 运行应用
CMD ["node", "index.js"]