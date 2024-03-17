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
const requestUtils = require('./utils/request.utils');
const dateUtils = require('./utils/date.utils');
const { logger } = require('./utils/log.utils');

const delay = ms => new Promise(res => setTimeout(res, ms));

const readCsv = async () => {
  const path = "./errors/invoice.csv";
  logger.info(`Reading csv ${path}`);
  const csvOriginal = await csvService.processFile(path);
  logger.info(`Mapping csv ${path}`);
  return csvOriginal.map(col => mappingUtils.mapCsvColumnToInvoiceData(col));
}

const clearCsv = () => {
  const header = [['order_id', 'order_status', 'order_at']];
  const path = './errors/invoice.csv';
  logger.info(`Clearing csv...`);
  csvService.writeCsv(path, header);
  logger.info(`CSV cleared`);
}

const extractZippedFile = (order, zipPath) => {
  return new Promise((resolve, reject) => {
    const dateFormatted = dateUtils.getDateString(order.createdAt);
    const dir = `storage/invoice/retry/${dateFormatted}`;
    const unzipper = new DecompressZip(zipPath);
    unzipper.on('progress', (fileIndex, fileCount) => {
      logger.info(`Extracted file ${fileIndex + 1} of ${fileCount} for ${order.id}`);
    });
    unzipper.on('extract', () => {
      logger.info(`Invoice for ${order.id} has been extracted`);
      fileUtils.moveDir(dir, `./storage/combined/retry`);
      fs.rmSync(zipPath);
      resolve();
    });
    unzipper.on('error', (err) => {
      reject(err);
    });
    unzipper.extract({
      path: dir,
      strip: 1,
    });
  });
}

const downloadZippedFile = (order) => {
  return new Promise((resolve) => {
    const dir = `./storage/zippedInvoice/retry`;
    const path = `${dir}/${order.id}.zip`;
    const invoiceStream = fs.createWriteStream(path);
    invoiceStream.on('finish', () => {
      resolve(path);
    });
    requestUtils.defaultClient
      .get(order.result.url)
      .pipe(invoiceStream);
  });
}

const downloadInvoice = async (order) => {
  try {
    logger.info(`Downloading invoice for ${order.id} [${order.createdAt}] and last status was ${order.status}`);
    const zippedPath = await downloadZippedFile(order);
    await extractZippedFile(order, zippedPath);
    await uploadToS3(order);
    logger.info(`Invoice for ${order.id} downloaded`);
  } catch(err) {
    logger.error(`Got error while download invoice :: ${err}`);
  }
}

const refreshToken = async () => {
  logger.info(`refreshing tokens, last token ['${process.env.ACCESS_TOKEN}', '${process.env.REFRESH_TOKEN}']`);
  const tokens = await userService.refreshToken();
  process.env.ACCESS_TOKEN = tokens.body.idToken;
  process.env.REFRESH_TOKEN = tokens.body.refreshToken;
}

const downloadInvoices = async (orders) => {
  const excludedStatus = ['CANCELLED', 'REJECTED', 'FAILED_DELIVERY', 'PARTIAL_DELIVERED'];
  const invoicePromises = [];
  for (const order of orders) {
    if (!excludedStatus.includes(order.status)) {
      invoicePromises.push(orderService.getInvoice(order));
    }
  }

  logger.info(`awaiting getInvoice :: ${invoicePromises.length} to be completed`);
  const results = await Promise.all(invoicePromises);

  const downloadPromises = [];
  for (const order of results) {
    if (order.result && order.result.url) {
      downloadPromises.push(downloadInvoice(order));
    } else {
      logger.info(`Invoice for ${order.id} [${order.createdAt}] was not exists because status ${order.status}`);
    }
  }

  logger.info(`awaiting downloadInvoice :: ${invoicePromises.length} to be completed`);
  await Promise.all(downloadPromises);
}

const uploadToS3 = async (order) => {
  const s3Bucket = process.env.S3_BUCKET;
  const pattern = `./storage/combined/retry/${order.id}*.pdf`;
  const files = await glob(pattern);
  for (const file of files) {
    await s3Service.uploadFile(file, s3Bucket);
    fs.rmSync(file);
  }
}

(async () => {
  // backup
  fileUtils.copyFile('./errors/invoice.csv', `./errors/invoice_${dateUtils.getCurDateString()}.csv`);

  // read input
  const data = await readCsv();
  logger.info(`csv has ${data.length} records`);

  // clear csv, because subsequent calls will also write to this file
  clearCsv();

  // ensure directory exists
  fileUtils.ensureDirectoryExistence(`./storage/zippedInvoice/retry`);

  // heavy process
  const chunkSize = parseInt(process.env.PER_PAGE || 10);
  const chunkedOrders = _.chunk(data, chunkSize);
  for (const [index, orders] of chunkedOrders.entries()) {
    logger.info(`prosessing chunk ${index + 1} of ${chunkedOrders.length}`);
    if (index % parseInt(process.env.REFRESH_TOKEN_INTERVAL) == 0) {
      await refreshToken();
    }
    await downloadInvoices(orders);
    // break;
  }

  // gracefull exit
  logger.info('process complete, exiting...')
  process.exit(0);
})(); 