const csvService = require('./service/csv.service');
const fileUtils = require('./utils/file.utils');
const { logger } = require('./utils/log.utils');

const getDate = (file) => {
    const parts = file.split('/');
    const lastPart = parts.pop();
    const date = lastPart.split('-pt-')[0];
    return date;
}

const getMonth = (file) => {
    const date = getDate(file);
    return date.substring(0, date.length-3);
}

const getSummedRows = (file, rows) => {
    const summedRows = rows.reduce((acc, cur) => {
        const currentStatus = cur.status;
        if (acc.status.has(currentStatus)) {
            const accumlatedStatus = acc.status.get(currentStatus);
            acc.status.set(currentStatus, accumlatedStatus + 1);
        } else {
            acc.status.set(currentStatus, 1);
        }
        acc.totalInvoice += parseInt(cur.invoiceCount);
        acc.totalTimeline += parseInt(cur.timelineCount);
        return acc;
    }, {
        name: file,
        date: getDate(file),
        order: rows.length,
        status: new Map(),
        totalInvoice: 0,
        totalTimeline: 0,
    });
    return summedRows;
}

const accumulateSummary = (summariesMap, summedRows) => {
    // let summary = summaries.find((el) => el.date === summedRows.date);
    // let summaryIndex = summaries.findIndex((el) => el.date === summedRows.date);
    let summary = {};
    if (!summariesMap.has(summedRows.date)) {
        summary.date = summedRows.date;
        summary.order = summedRows.order;
        summary.totalInvoice = summedRows.totalInvoice;
        summary.totalTimeline = summedRows.totalTimeline;
        for (const [key, value] of summedRows.status.entries()) {
            const prop = 'order_'+key.toLowerCase();
            summary[prop] = value;
        }
    } else {
        summary = summariesMap.get(summedRows.date);
        summary.order += summedRows.order;
        summary.totalInvoice += summedRows.totalInvoice;
        summary.totalTimeline += summedRows.totalTimeline;
        for (const [key, value] of summedRows.status.entries()) {
            const prop = 'order_'+key.toLowerCase();
            if (summary[prop]) {
                summary[prop] += value;
            } else {
                summary[prop] = value;
            }
        }
    }
    summariesMap.set(summedRows.date, summary);
    return summariesMap;
}

(async () => {
    const directories = fileUtils.getDirectoryContents('./storage/count', 'directory');
    for (const directory of directories) {
        const files = fileUtils.getDirectoryContents(directory, 'file');
        let currentMonth = '';
        let summariesMap = new Map();
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`processing file ${file}`);
            const rows = await csvService.readCsvAsync(file);
            const summedRows = getSummedRows(file, rows);
            summariesMap = accumulateSummary(summariesMap, summedRows);

            const month = getMonth(file);
            if (currentMonth !== month || i == files.length - 1) {
                // write summary
                console.log(`writing csv file ${month}.csv`);
                const summaryDir = `./storage/summary`;
                fileUtils.ensureDirectoryExistence(summaryDir);
                const summaryPath = `${summaryDir}/${month}.csv`;
                const summaries = [...summariesMap.values()];
                csvService.writeCsv(summaryPath, summaries);
                currentMonth = month;
                summariesMap = new Map();
            }
        }
    }
})();