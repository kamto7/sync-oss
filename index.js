const schedule = require("node-schedule");
const axios = require("axios");
const OSS = require("ali-oss");
const fs = require("fs");
const path = require("path");
const stream = require("stream");
const { promisify } = require("util");
const Core = require('@alicloud/pop-core');
require("dotenv").config();

const pipeline = promisify(stream.pipeline);

// 配置阿里云OSS客户端
const ossClient = new OSS({
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
});

// 配置阿里云CDN客户端
const cdnClient = new Core({
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  endpoint: 'https://cdn.aliyuncs.com',
  apiVersion: '2018-05-10'
});

// 要下载的资源
const resources = [
  {
    url: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.dat",
    filename: "clash-rules/geoip.dat",
  },
  {
    url: "https://testingcf.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geosite.dat",
    filename: "clash-rules/geosite.dat",
  },
  {
    url: "https://fastly.jsdelivr.net/gh/MetaCubeX/meta-rules-dat@release/geoip.metadb",
    filename: "clash-rules/geoip.metadb",
  },
  {
    url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/direct.txt",
    filename: "clash-rules/direct.txt",
  },
  {
    url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/proxy.txt",
    filename: "clash-rules/proxy.txt",
  },
  {
    url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/reject.txt",
    filename: "clash-rules/reject.txt",
  },
  {
    url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/private.txt",
    filename: "clash-rules/private.txt",
  },
  {
    url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/apple.txt",
    filename: "clash-rules/apple.txt",
  },
  {
    url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/icloud.txt",
    filename: "clash-rules/icloud.txt",
  },
  {
    url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/google.txt",
    filename: "clash-rules/google.txt",
  },
  {
    url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/gfw.txt",
    filename: "clash-rules/gfw.txt",
  },
  {
    url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/tld-not-cn.txt",
    filename: "clash-rules/tld-not-cn.txt",
  },
  {
    url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/telegramcidr.txt",
    filename: "clash-rules/telegramcidr.txt",
  },
  {
    url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/lancidr.txt",
    filename: "clash-rules/lancidr.txt",
  },
  {
    url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/cncidr.txt",
    filename: "clash-rules/cncidr.txt",
  },
  {
    url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/applications.txt",
    filename: "clash-rules/applications.txt",
  },
];

// 下载文件
async function downloadFile(url, filename) {
  const response = await axios({
    method: "GET",
    url: url,
    responseType: "stream",
  });

  const filePath = path.join(__dirname, "downloads", filename);

  // 确保目录存在
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

  const writer = fs.createWriteStream(filePath);

  try {
    await pipeline(response.data, writer);
    console.log(`文件下载成功: ${filename}`);
  } catch (error) {
    console.error(`文件下载失败: ${filename}`, error);
    throw error;
  } finally {
    writer.close();
  }

  // 验证文件是否成功下载
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    throw new Error(`文件下载失败或为空: ${filename}`);
  }
}

// 上传文件到OSS
async function uploadToOSS(filename) {
  try {
    const result = await ossClient.put(
      filename,
      path.join(__dirname, "downloads", filename)
    );
    console.log(`上传成功: ${filename}`);
    return result;
  } catch (error) {
    console.error(`上传失败: ${filename}`, error);
  }
}

// 刷新阿里云CDN缓存
async function refreshCDNCache(refreshDirectories) {
  try {
    const cdnUrl = process.env.CDN_URL;
    
    for (const directory of refreshDirectories) {
      const refreshUrl = `${cdnUrl}/${directory}/`;
      
      const params = {
        "ObjectPath": refreshUrl,
        "ObjectType": "Directory"
      };

      const requestOption = {
        method: 'POST'
      };

      const result = await cdnClient.request('RefreshObjectCaches', params, requestOption);
      console.log(`CDN缓存刷新成功: ${refreshUrl}`, result);
    }
  } catch (error) {
    console.error('CDN缓存刷新失败:', error);
  }
}

// 主任务
async function main() {
  console.log("开始下载和上传任务...");

  const directories = new Set();

  for (const resource of resources) {
    try {
      await downloadFile(resource.url, resource.filename);
      console.log(`下载成功: ${resource.filename}`);
      await uploadToOSS(resource.filename);
      // 删除本地文件
      fs.unlinkSync(path.join(__dirname, "downloads", resource.filename));
      
      // 提取目录
      const directory = path.dirname(resource.filename);
      directories.add(directory);
    } catch (error) {
      console.error(`处理 ${resource.filename} 时出错:`, error);
    }
  }

  // 所有文件上传完成后刷新CDN缓存
  await refreshCDNCache(Array.from(directories));

  console.log("任务完成");
}

// 项目启动时执行一次
console.log("项目已启动，立即执行任务...");
main()
  .then(() => {
    console.log("初始任务完成");

    // 设置每天凌晨2点执行的定时任务
    const job = schedule.scheduleJob("0 2 * * *", main);
    console.log("定时任务已设置，等待执行...");

    // 优雅退出
    process.on("SIGTERM", () => {
      console.log("收到SIGTERM信号，正在优雅退出...");
      job.cancel();
      process.exit(0);
    });
  })
  .catch((err) => {
    console.error("初始任务执行失败:", err);
  });
