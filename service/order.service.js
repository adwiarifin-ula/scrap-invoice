const { ulaClient } = require('../utils/request.utils');
const { logger } = require('../utils/log.utils');

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
        const result = await ulaClient
            .post('/orders-graphql')
            .send(query);
        return result.body.data.adminOrdersV2;
    } catch (error) {
        logger.error('error while getting orders', params);
        return null;
    }
}

const getInvoice = async (order) => {
    let result = null;
    try {
        const response = await ulaClient
            .post(`/orders/${order.id}/invoice`);
        result = response.body;
    } catch (error) {
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
        const response = await ulaClient
            .get(`/orders/logs/${order.id}`);
        result = response.body;
    } catch (error) {
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
    getTimeline,
}