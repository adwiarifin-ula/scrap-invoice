const { ulaClient } = require('../utils/request.utils');
const { logger } = require('../utils/log.utils');
const csvService = require('./csv.service');

const getGraphQLQuery = (params) => {
    const query = `query {
        adminOrdersV2(
            startDate: "${params.startDate}",
            endDate: "${params.endDate}",
            offset: ${params.offset},
            limit: ${params.limit}
        ) {
            data {
                id,
                status,
                createdAt
            }
            page {
                currentPage
                totalPages
            }
        }
    }`;
    return { query };
}

const getOrders = async (params) => {
    try {
        const query = getGraphQLQuery(params);
        const result = await ulaClient()
            .post('/orders-graphql')
            .send(query);
        const graphQLResult = result.body.data.adminOrdersV2;
        if (graphQLResult == null) {
            logger.info('orders graphql was null', { body: result.body, status: result.status });
        }
        return graphQLResult;
    } catch (error) {
        logger.error(`error while getting orders :: status ${error.status} :: statusCode ${error.statusCode}`, params);
        return null;
    }
}

const getInvoice = async (order) => {
    let result = null;
    try {
        const response = await ulaClient()
            .post(`/orders/${order.id}/invoice`);
        result = response.body;
    } catch (error) {
        csvService.appendCsv('errors/invoice.csv', [order]);
        logger.error('error while getting invoice', order);
    }
    return {
        ...order,
        result,
    }
}

const getInvoiceCount = async (order) => {
    let result = null;
    try {
        const response = await ulaClient()
            .post(`/orders/${order.id}/invoice/count`);
        result = response.body;
    } catch (error) {
        csvService.appendCsv('errors/invoice_count.csv', [order]);
        logger.error('error while getting invoice', order);
    }
    return {
        ...order,
        result,
    }
}

const getTimeline = async (order) => {
    let result = null;
    try {
        const response = await ulaClient()
            .get(`/orders/logs/${order.id}`);
        result = response.body;
    } catch (error) {
        csvService.appendCsv('errors/timeline.csv', [order]);
        logger.error('error while getting timeline', order);
    }
    return {
        ...order,
        result,
    }
}

module.exports = {
    getOrders,
    getInvoice,
    getInvoiceCount,
    getTimeline,
}