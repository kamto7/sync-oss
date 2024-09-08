const schedule = require("node-schedule");
const axios = require("axios");
const OSS = require("ali-oss");
const fs = require("fs");
const path = require("path");
const stream = require("stream");
const { promisify } = require("util");
require("dotenv").config();

const pipeline = promisify(stream.pipeline);

// Configure Alibaba Cloud OSS client
const ossClient = new OSS({
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
});

// List of resources to download
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

// Download file
async function downloadFile(url, filename) {
  const response = await axios({
    method: "GET",
    url: url,
    responseType: "stream",
  });

  const filePath = path.join(__dirname, "downloads", filename);

  // Ensure directory exists
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });

  const writer = fs.createWriteStream(filePath);

  try {
    await pipeline(response.data, writer);
    console.log(`File downloaded successfully: ${filename}`);
  } catch (error) {
    console.error(`Failed to download file: ${filename}`, error);
    throw error;
  } finally {
    writer.close();
  }

  // Verify if file was successfully downloaded
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size === 0) {
    throw new Error(`File download failed or is empty: ${filename}`);
  }
}

// Upload file to OSS
async function uploadToOSS(filename) {
  try {
    const result = await ossClient.put(
      filename,
      path.join(__dirname, "downloads", filename)
    );
    console.log(`Upload successful: ${filename}`);
    return result;
  } catch (error) {
    console.error(`Upload failed: ${filename}`, error);
  }
}

// Main task
async function main() {
  console.log("Starting download and upload tasks...");

  for (const resource of resources) {
    try {
      await downloadFile(resource.url, resource.filename);
      console.log(`Download successful: ${resource.filename}`);
      await uploadToOSS(resource.filename);
      // Delete local file after upload
      fs.unlinkSync(path.join(__dirname, "downloads", resource.filename));
    } catch (error) {
      console.error(`Error processing ${resource.filename}:`, error);
    }
  }

  console.log("Tasks completed");
}

// Execute once when project starts
console.log("Project started, executing tasks immediately...");
main()
  .then(() => {
    console.log("Initial tasks completed");

    // Set up scheduled task to run at 2 AM daily
    const job = schedule.scheduleJob("0 2 * * *", main);
    console.log("Scheduled task set, waiting for execution...");

    // Graceful exit
    process.on("SIGTERM", () => {
      console.log("Received SIGTERM signal, gracefully exiting...");
      job.cancel();
      process.exit(0);
    });
  })
  .catch((err) => {
    console.error("Initial task execution failed:", err);
  });
