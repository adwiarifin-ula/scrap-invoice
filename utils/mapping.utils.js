const dateUtils = require('./date.utils');

const mapTimelineData = (timelines) => {
    return timelines.map(t => ({
        actual_time: dateUtils.getReadableDateTime(t.actual_time),
        expected_time: dateUtils.getReadableDateTime(t.expected_time),
        status: t.status,
        breach_status: t.breach_status,
        updated_by: t.name,
        comment: t.comment,
    }));
}

module.exports = {
    mapTimelineData
}