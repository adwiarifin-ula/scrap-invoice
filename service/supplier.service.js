const { ulaClient } = require('../utils/request.utils');
const { logger } = require('../utils/log.utils');
const csvService = require('./csv.service');

const getPurchaseOrders = async (params) => {
    try {
        // const query = getGraphQLQuery(params);
        const result = await ulaClient()
            .get('/v1/po')
            .query({
                offset: params.offset,
                limit: params.limit
            });
        const graphQLResult = result.body;
        if (graphQLResult == null) {
            logger.info('purchase orders was null', { body: result.body, status: result.status });
        }
        return graphQLResult;
    } catch (error) {
        console.log(error);
        logger.error(`error while purchase orders :: status ${error.status} :: statusCode ${error.statusCode}`, params);
        return null;
    }
}

const getInvoice = async (po) => {
    let result = null;
    try {
        const response = await ulaClient()
            .post(`/po/${po.id}/invoice`);
        result = response.body;
    } catch (error) {
        csvService.appendCsv('errors/po_invoice.csv', [po]);
        logger.error('error while getting po invoice', po);
    }
    return {
        ...po,
        result,
    }
}

module.exports = {
    getPurchaseOrders,
    getInvoice,
}