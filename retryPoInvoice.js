require('dotenv').config();
const csvService = require('./service/csv.service');
const supplierService = require('./service/supplier.service');
const userService = require('./service/user.service');
const fileUtils = require('./utils/file.utils');
const dateUtils = require('./utils/date.utils');
const { logger } = require('./utils/log.utils');

const refreshToken = async () => {
    logger.info(`refreshing tokens, last token ['${process.env.ACCESS_TOKEN}', '${process.env.REFRESH_TOKEN}']`);
    const tokens = await userService.refreshToken();
    process.env.ACCESS_TOKEN = tokens.body.idToken;
    process.env.REFRESH_TOKEN = tokens.body.refreshToken;
}

const clearCsv = () => {
    const header = [];
    const path = './errors/po_invoice.csv';
    logger.info(`Clearing csv...`);
    csvService.writeCsv(path, header);
    logger.info(`CSV cleared`);
}

(async () => {
    // backup
    fileUtils.copyFile('./errors/po_invoice.csv', `./errors/po_invoice_${dateUtils.getCurDateString()}.csv`);

    // read csv
    const path = './errors/po_invoice.csv';
    const rows = await csvService.readCsvAsync(path);

    // clear csv, because subsequent calls will also write to this file
    clearCsv();

    for (let i = 0; i < rows.length; i++) {
        if (i % parseInt(process.env.REFRESH_TOKEN_INTERVAL) == 0) {
            await refreshToken();
        }

        const row = rows[i];
        const poId = row[0];
        const po = {
            id: poId,
        }
        logger.info(`retrying po invoice ${poId}`);
        supplierService.getInvoice(po);
    }
})(); 