require('dotenv').config();
const csvService = require('./service/csv.service');
const orderService = require('./service/order.service');
const userService = require('./service/user.service');
const s3Service = require('./service/s3.service');
const dateUtils = require('./utils/date.utils');
const fileUtils = require('./utils/file.utils');
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

const downloadTimeline = async (order) => {
    try {
        logger.info(`Downloading timeline for ${order.id} [${order.createdAt}] and last status was ${order.status}`);
        const dir = `./storage/timeline/checker`;
        fileUtils.ensureDirectoryExistence(dir);
        const path = `${dir}/${order.id}-order-timeline-${dateUtils.getDateString(order.createdAt)}.csv`;
        const mappedData = mappingUtils.mapTimelineData(order.result);
        csvService.writeCsv(path, mappedData);
        logger.info(`succesfully download timeline file for ${order.id}`);
        await uploadToS3(order, 'timeline');
    } catch (err) {
        logger.error(`failed download timeline file for ${order.id} :: ${err}`);
    }
}

const downloadInvoice = async (order) => {
    try {
        logger.info(`Downloading invoice for ${order.id} [${order.createdAt}] and last status was ${order.status}`);
        const zippedPath = await downloadZippedFile(order);
        await extractZippedFile(order, zippedPath);
        logger.info(`succesfully download invoice file for ${order.id}`);
        await uploadToS3(order, 'invoice');
    } catch (err) {
        logger.error(`failed download invoice file for ${order.id} :: ${err}`);
    }
}

const downloadZippedFile = (order) => {
    return new Promise((resolve) => {
        const dir = `./storage/zippedInvoice/checker`;
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

const extractZippedFile = (order, zipPath) => {
    return new Promise((resolve, reject) => {
        const dateFormatted = dateUtils.getDateString(order.createdAt);
        const dir = `storage/invoice/checker/${dateFormatted}`;
        const unzipper = new DecompressZip(zipPath);
        unzipper.on('progress', (fileIndex, fileCount) => {
            logger.info(`Extracted file ${fileIndex + 1} of ${fileCount} for ${order.id}`);
        });
        unzipper.on('extract', () => {
            logger.info(`Invoice for ${order.id} has been extracted`);
            fileUtils.moveDir(dir, `./storage/combined/checker`);
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

const uploadToS3 = async (order, type) => {
    const s3Bucket = process.env.S3_BUCKET;
    const fileExt = type == 'invoice' ? 'pdf' : 'csv';
    const pattern = `./storage/combined/checker/${order.id}*.${fileExt}`;
    const files = await glob(pattern);
    for (const file of files) {
        try {
            await s3Service.uploadFile(file, s3Bucket);
            fs.rmSync(file);
            logger.info(`sucesfully stored ${type} file to s3 for ${order.id}`);
        } catch (err) {
            logger.info(`failed stored ${type} file to s3 for ${order.id}`);
        }
    }
}

const refreshToken = async () => {
    logger.info(`refreshing tokens, last token ['${process.env.ACCESS_TOKEN}', '${process.env.REFRESH_TOKEN}']`);
    const tokens = await userService.refreshToken();
    process.env.ACCESS_TOKEN = tokens.body.idToken;
    process.env.REFRESH_TOKEN = tokens.body.refreshToken;
}

const checkOnS3 = async (orders) => {
    // prepare static values
    const s3Bucket = process.env.S3_BUCKET;

    // prepare promises
    const s3Promises = [];
    for (const order of orders) {
        s3Promises.push(s3Service.listFiles(order.id, s3Bucket));
    }

    // execute Promise
    const s3Results = await Promise.all(s3Promises);

    // iterate results
    for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        const s3Files = s3Results[i];

        logger.info(`checking s3 file for ${order.id}`);
        const invoiceFiles = s3Files.filter(e => e.endsWith('.pdf'));
        const timelineFiles = s3Files.filter(e => e.endsWith('.csv'));

        if (invoiceFiles.length > 0) {
            logger.info(`succesfully found ${invoiceFiles.length} invoice file on s3 for ${order.id} ${invoiceFiles.join(',')}`);
        } else {
            const excludedStatus = ['CANCELLED', 'REJECTED', 'FAILED_DELIVERY', 'PARTIAL_DELIVERED'];
            const needRedownload = !excludedStatus.includes(order.status);
            logger.info(`failed found invoice file on s3 for ${order.id}, because status ${order.status}, ${needRedownload ? 'proceeding download' : 'skipping download'}`);
            if (needRedownload) {
                const orderResult = orderService.getInvoice(order);
                if (orderResult.result && orderResult.result.url) {
                    await downloadInvoice(orderResult);
                } else {
                    logger.info(`failed download invoice file for ${order.id}`);
                }
            }
        }

        if (timelineFiles.length > 0) {
            logger.info(`succesfully found ${timelineFiles.length} timeline file on s3 for ${order.id} ${timelineFiles.join(',')}`);
        } else {
            logger.info(`failed found timeline file on s3 for ${order.id}`);
            const timelineResult = orderService.getTimeline(order);
            if (timelineResult.result) {
                await downloadTimeline(timelineResult);
            } else {
                logger.info(`failed download timeline file for ${order.id}`);
            }
        }
    }
}

const getCounts = async (orders) => {
    // prepare promises
    const invoicePromises = [];
    const timelinePromises = [];
    for (const order of orders) {
        invoicePromises.push(orderService.getInvoiceCount(order));
        timelinePromises.push(orderService.getTimeline(order));
    }

    // execute Promise
    const invoiceResults = await Promise.all(invoicePromises);
    const timelineResults = await Promise.all(timelinePromises);

    // iterate results
    const counts = [];
    for (let i = 0; i < orders.length; i++) {
        const order = orders[i];
        const invoice = invoiceResults[i];
        const timeline = timelineResults[i];

        const result = {
            id: order.id,
            status: order.status,
            createdAt: order.createdAt,
            invoiceCount: 0,
            timelineCount: 0,
        }
        if (invoice.result) {
            result.invoiceCount = invoice.result.length;
        }
        if (timeline.result) {
            result.timelineCount = 1;
        }
        counts.push(result);
    }
    return counts;
}

const writeCounts = (counts, page) => {
    if (counts.length > 0) {
        const firstCount = counts[0];
        const monthString = dateUtils.getMonthString(firstCount.createdAt);
        const dateString = dateUtils.getDateString(firstCount.createdAt);
        const dir = `./storage/count/${monthString}`;
        const filePath = `${dir}/${dateString}-pt-${String(page).padStart(3, '0')}.csv`;
        fileUtils.ensureDirectoryExistence(dir);
        csvService.writeCsv(filePath, counts);
    }
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
            if (nextPage % parseInt(process.env.REFRESH_TOKEN_INTERVAL) == 1) {
                await refreshToken();
            }

            // get orders
            const params = buildParams(day, nextPage);
            let orderResult = await orderService.getOrders(params);
            while (!orderResult) {
                // maybe got 401
                await refreshToken();
                orderResult = await orderService.getOrders(params);
            }
            const { data, page } = orderResult;
            logger.info(`processing page ${page.currentPage} of ${page.totalPages} [${day.format()}]`, params);

            // heavy process
            const counts = await getCounts(data);
            writeCounts(counts, page.currentPage);

            // heavy proses (2)
            await checkOnS3(data);

            // iteration control
            nextPage = page.currentPage + 1;
            totalPage = page.totalPages;
            // if (nextPage === 2) break;
        } while (nextPage <= totalPage);
        firstRun = false;
    }

    // exit gracefully
    // await delay(1000);
    // process.exit(0);
})();