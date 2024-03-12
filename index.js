require('dotenv').config();
const fs = require('fs');
const DecompressZip = require('decompress-zip');
const csvService = require('./service/csv.service');
const orderService = require('./service/order.service');
const userService = require('./service/user.service');
const dateUtils = require('./utils/date.utils');
const fileUtils = require('./utils/file.utils');
const requestUtils = require('./utils/request.utils');
const mappingUtils = require('./utils/mapping.utils');
const { logger } = require('./utils/log.utils');

const buildParams = (date, page) => {
    const perPage = parseInt(process.env.PER_PAGE);
    const localDate = date.clone();
    return {
        startDate: localDate.format(),
        endDate: localDate.add(1, 'day').format(),
        offset: (page - 1) * perPage,
        limit: perPage,
    }
}

const extractZip = (order, zipPath) => {
    const dir = `storage/invoice/${dateUtils.getDateString(order.createdAt)}`;
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
    const dir = `./storage/zippedInvoice/${dateUtils.getDateString(order.createdAt)}`;
    fileUtils.ensureDirectoryExistence(dir);
    const path = `${dir}/${order.id}.zip`;
    const invoiceStream = fs.createWriteStream(path);
    invoiceStream.on('finish', () => {
        // console.log('extracting ' + path);
        extractZip(order, path);
    });
    requestUtils.defaultClient
        .get(order.result.url)
        .pipe(invoiceStream);
}

const downloadInvoices = async (orders) => {
    const excludedStatus = ['CANCELLED', 'REJECTED', 'FAILED_DELIVERY'];
    const promises = [];
    for (const order of orders) {
        if (!excludedStatus.includes(order.status)) {
            promises.push(orderService.getInvoice(order));
        }
    }
    // const results = await Promise.all(promises);

    // const chunkedPromises = chunk(promises, 10);
    // let results = [];
    // for (const part of chunkedPromises) {
    //     logger.info(`execute chunk part x of ${chunkedPromises.length}`);
    //     const partialResult = await Promise.all(part);
    //     results.push(...partialResult);
    // }

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

function downloadTimeline(order) {
    const dir = `./storage/timeline/${dateUtils.getDateString(order.createdAt)}`;
    fileUtils.ensureDirectoryExistence(dir);
    const path = `${dir}/${order.id} - timeline.csv`;
    const mappedData = mappingUtils.mapTimelineData(order.result);
    csvService.writeCsv(path, mappedData);
}


const downloadTimelines = async (orders) => {
    const promises = [];
    for (const order of orders) {
        promises.push(orderService.getTimeline(order));
    }

    for await (const order of promises) {
        if (order.result) {
            logger.info(`Downloading timeline for ${order.id} [${order.createdAt}] and last status was ${order.status}`);
            downloadTimeline(order);
            logger.info(`Timeline for ${order.id} downloaded`);
        } else {
            logger.info(`Skipping timeline for ${order.id} due to empty result`);
        }
    }
}

const combineFiles = (day) => {
    logger.info(`Copying invoice and timeline data`);
    const dateFormatted = dateUtils.getDateString(day.format());
    fileUtils.moveDir(`./storage/invoice/${dateFormatted}`, `./storage/combined/${dateFormatted}`);
    fileUtils.moveDir(`./storage/timeline/${dateFormatted}`, `./storage/combined/${dateFormatted}`);
    fileUtils.removeDir(`./storage/zippedInvoice/${dateFormatted}`);
}

const refreshToken = async () => {
    logger.info(`refreshing tokens, last token ['${process.env.ACCESS_TOKEN}', '${process.env.REFRESH_TOKEN}']`);
    const tokens = await userService.refreshToken();
    process.env.ACCESS_TOKEN = tokens.body.idToken;
    process.env.REFRESH_TOKEN = tokens.body.refreshToken;
}

(async () => {
    const range = dateUtils.getDateRange();
    let firstRun = true;
    for (let day of range.by('day')) {
        // process daily
        logger.info(`processing date of ${day.format()}`);
        let nextPage = firstRun ? process.env.START_PAGE : 1;
        let totalPage = 1;
        do {
            // refresh token
            if (nextPage % 25 == 1) {
                refreshToken();
            }

            // get orders
            const params = buildParams(day, nextPage);
            const { data, page } = await orderService.getOrders(params);
            logger.info(`processing page ${page.currentPage} of ${page.totalPages}`, params);
            
            // heavy process
            await downloadInvoices(data);
            await downloadTimelines(data);

            // iteration control
            nextPage = page.currentPage + 1;
            totalPage = page.totalPages;
            // if (nextPage === 3) break;
        } while(nextPage <= totalPage);
        combineFiles(day);
        firstRun = false;
    }
})();