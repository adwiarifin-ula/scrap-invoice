require('dotenv').config();
const fs = require('fs');
const _ = require('lodash');
const DecompressZip = require('decompress-zip');
const { glob } = require('glob');
const csvService = require('./service/csv.service');
const mappingUtils = require('./utils/mapping.utils');
const orderService = require('./service/order.service');
const userService = require('./service/user.service');
const s3Service = require('./service/s3.service');
const fileUtils = require('./utils/file.utils');
const dateUtils = require('./utils/date.utils');
const { logger } = require('./utils/log.utils');

const delay = ms => new Promise(res => setTimeout(res, ms));

const readCsv = async () => {
  const path = "./errors/timeline.csv";
  logger.info(`Reading csv ${path}`);
  const csvOriginal = await csvService.processFile(path);
  logger.info(`Mapping csv ${path}`);
  return csvOriginal.map(col => mappingUtils.mapCsvColumnToInvoiceData(col));
}

const clearCsv = () => {
  const header = [['order_id', 'order_status', 'order_at']];
  const path = './errors/timeline.csv';
  logger.info(`Clearing csv...`);
  csvService.writeCsv(path, header);
  logger.info(`CSV cleared`);
}

const downloadTimeline = async (order) => {
  try {
    logger.info(`Downloading timeline for ${order.id} [${order.createdAt}] and last status was ${order.status}`);
    const dir = `./storage/timeline/retry`;
    fileUtils.ensureDirectoryExistence(dir);
    const path = `${dir}/${order.id}-order-timeline-${dateUtils.getDateString(order.createdAt)}.csv`;
    const mappedData = mappingUtils.mapTimelineData(order.result);
    csvService.writeCsv(path, mappedData);
    await uploadToS3(order);
    logger.info(`Timeline for ${order.id} downloaded`);
  } catch(err) {
    logger.error(`Got error while download timeline :: ${err}`);
  }
}

const refreshToken = async () => {
  logger.info(`refreshing tokens, last token ['${process.env.ACCESS_TOKEN}', '${process.env.REFRESH_TOKEN}']`);
  const tokens = await userService.refreshToken();
  process.env.ACCESS_TOKEN = tokens.body.idToken;
  process.env.REFRESH_TOKEN = tokens.body.refreshToken;
}

const downloadTimelines = async (orders) => {
  const excludedStatus = [];
  const timelinePromises = [];
  for (const order of orders) {
    if (!excludedStatus.includes(order.status)) {
      timelinePromises.push(orderService.getTimeline(order));
    }
  }

  logger.info(`awaiting getTimeline :: ${timelinePromises.length} to be completed`);
  const results = await Promise.all(timelinePromises);

  const downloadPromises = [];
  for (const order of results) {
    if (order.result && order.result.url) {
      downloadPromises.push(downloadTimeline(order));
    } else {
      logger.info(`Timeline for ${order.id} [${order.createdAt}] was not exists because status ${order.status}`);
    }
  }

  logger.info(`awaiting downloadTimeline :: ${downloadPromises.length} to be completed`);
  await Promise.all(downloadPromises);
}

const uploadToS3 = async (order) => {
  const s3Bucket = process.env.S3_BUCKET;
  const pattern = `./storage/combined/retry/${order.id}*.csv`;
  const files = await glob(pattern);
  for (const file of files) {
    logger.info(`Uploading timeline ${order.id} to s3...`);
    await s3Service.uploadFile(file, s3Bucket);
    fs.rmSync(file);
  }
}

(async () => {
  // backup
  fileUtils.copyFile('./errors/timeline.csv', `./errors/timeline_${dateUtils.getCurDateString()}.csv`);

  // read input
  const data = await readCsv();
  logger.info(`csv has ${data.length} records`);

  // clear csv, because subsequent calls will also write to this file
  clearCsv();

  // ensure directory exists
  fileUtils.ensureDirectoryExistence(`./storage/timeline/retry`);

  // heavy process
  const chunkSize = parseInt(process.env.PER_PAGE || 10);
  const chunkedOrders = _.chunk(data, chunkSize);
  for (const [index, orders] of chunkedOrders.entries()) {
    logger.info(`prosessing chunk ${index + 1} of ${chunkedOrders.length}`);
    if (index % parseInt(process.env.REFRESH_TOKEN_INTERVAL) == 0) {
      await refreshToken();
    }
    await downloadTimelines(orders);
    // break;
  }

  // gracefull exit
  logger.info('process complete, exiting...')
  process.exit(0);
})(); 