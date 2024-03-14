require('dotenv').config();
const fs = require('fs');
const DecompressZip = require('decompress-zip');
const csvService = require('./service/csv.service');
const mappingUtils = require('./utils/mapping.utils');
const orderService = require('./service/order.service');
const s3Service = require('./service/s3.service');
const fileUtils = require('./utils/file.utils');
const requestUtils = require('./utils/request.utils');
const dateUtils = require('./utils/date.utils');
const { logger } = require('./utils/log.utils');

const delay = ms => new Promise(res => setTimeout(res, ms));

const readCsv = async () => {
  return new Promise((resolve, reject) => {
    const csvData = [];
    const path = "./errors/invoice.csv";
    logger.info('reading csv...');
    csvService.readCsv(
      path, 
      (col) => {
        csvData.push(mappingUtils.mapCsvColumnToInvoiceData(col));
      },
      () => {
        logger.info('read csv finished');
        resolve(csvData);
      },
      (err) => {
        logger.error(`read csv error :: ${JSON.stringify(err)}`);
        reject();
      }
    );
  });
}

const clearCsv = () => {
  const header = [['order_id','order_status','order_at']];
  const path = './errors/invoice.csv';
  csvService.writeCsv(path, header);
}

const extractZip = (order, zipPath) => {
  const dir = `storage/invoice/retry`;
  const unzipper = new DecompressZip(zipPath);
  unzipper.on('progress', function (fileIndex, fileCount) {
      logger.info(`Extracted file ${fileIndex + 1} of ${fileCount} for ${order.id}`);
  });
  unzipper.on('extract', function () {
      logger.info(`Invoice for ${order.id} has been extracted`);
  });
  unzipper.extract({
      path: dir,
      strip: 1,
  });
}

const downloadInvoice = (order) => {
  const dir = `./storage/zippedInvoice/retry`;
  fileUtils.ensureDirectoryExistence(dir);
  const path = `${dir}/${order.id}.zip`;
  const invoiceStream = fs.createWriteStream(path);
  invoiceStream.on('finish', () => {
      extractZip(order, path);
  });
  requestUtils.defaultClient
      .get(order.result.url)
      .pipe(invoiceStream);
}

const downloadInvoices = async (orders) => {
  const excludedStatus = ['CANCELLED', 'REJECTED', 'FAILED_DELIVERY', 'PARTIAL_DELIVERED'];
  const promises = [];
  for (const order of orders) {
      if (!excludedStatus.includes(order.status)) {
          promises.push(orderService.getInvoice(order));
      }
  }

  for await (const order of promises) {
      logger.info(`Downloading invoice for ${order.id} [${order.createdAt}] and last status was ${order.status}`);
      // const invoiceResult = await orderService.getInvoice(order);
      if (order.result && order.result.url) {
          downloadInvoice(order);
          logger.info(`Invoice for ${order.id} downloaded`);
      } else {
          logger.info(`Invoice for ${order.id} [${order.createdAt}] was not exists because status ${order.status}`);
      }
  }
}

const uploadToS3 = async () => {
  const path = `./storage/invoice/retry`;
  const zippedInvoicePath = `./storage/zippedInvoice/retry`;
  if (fileUtils.existsDir(path)) {
      const s3Bucket = process.env.S3_BUCKET;
      s3Service.uploadDir(path, s3Bucket);
      // clear local file
      fileUtils.removeDirIfEmpty(path);
      if (fileUtils.existsDir(zippedInvoicePath)) {
        fileUtils.removeDir(zippedInvoicePath);
      }
  } else {
      logger.info(`Skipping upload to s3 for`);
  }
}

(async () => {
  // backup
  fileUtils.copyFile('./errors/invoice.csv', `./errors/invoice_${dateUtils.getCurDateString()}.csv`);
  
  // read input
  const data = await readCsv();

  // clear csv, because subsequent calls will also write to this file
  clearCsv();
  
  // heavy process
  await downloadInvoices(data);
  await delay(5000);
  await uploadToS3();
})();