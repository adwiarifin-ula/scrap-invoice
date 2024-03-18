const Moment = require('moment');
const MomentRange = require('moment-range');

const moment = MomentRange.extendMoment(Moment);

const getDateRange = () => {
    const start = moment.utc(process.env.START_DATE);
    const end = moment.utc(process.env.END_DATE);
    const range = moment.range(start, end);
    return range;
}

const getCurDateString = () => {
    return moment.utc().format().replace(/-/g, '').replace(/:/g, '');
}

const getDateString = (originalDateString) => {
    const date = moment.utc(originalDateString);
    return date.format('YYYY-MM-DD');
}

const getMonthString = (originalDateString) => {
    const date = moment.utc(originalDateString);
    return date.format('YYYY-MM');
}

const getReadableDateTime = (originalDateString) => {
    if (originalDateString === 'NA') return '';
    const format = 'ddd MMM DD YYYY HH:mm:ss [GMT]ZZ [(]zz[)]';
    return moment(originalDateString, format).format('D-MMM-YYYY HH:mm:ss');
}

module.exports = {
    getDateRange,
    getDateString,
    getMonthString,
    getReadableDateTime,
    getCurDateString,
}