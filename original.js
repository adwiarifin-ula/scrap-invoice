const fs = require('fs');
const superagent = require('superagent');
const { parseISO, formatISO, addDays } = require('date-fns');
const fileUtils = require('./utils/file.utils');

const authToken = `Bearer eyJraWQiOiI4WjFNckNSbUU4OVdOR1hSUW5NamROakJxYm10aGt3VUt0VTRwTVdnN1I0PSIsImFsZyI6IlJTMjU2In0.eyJzdWIiOiI0MDVhNWVmZC0xMTcxLTQ2M2EtYWFhNS1jM2M4NWFkYWUxZGIiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuYXAtc291dGhlYXN0LTEuYW1hem9uYXdzLmNvbVwvYXAtc291dGhlYXN0LTFfdlE2M09IaTAxIiwiY3VzdG9tOmlkIjoiMXYyRVhUNmhGS2p3UnBQbjN4bFJLWnhQeDRrIiwicGhvbmVfbnVtYmVyX3ZlcmlmaWVkIjpmYWxzZSwiY29nbml0bzp1c2VybmFtZSI6IjQwNWE1ZWZkLTExNzEtNDYzYS1hYWE1LWMzYzg1YWRhZTFkYiIsImF1ZCI6IjFvZHZyNDBqNGd0Y2kwNTBhbjAxNTAwbDh1IiwiZXZlbnRfaWQiOiIzNWE2NDM5My0xYjczLTQ2OWItYTEwNS0xYTIwOGYyNWY1OTYiLCJ0b2tlbl91c2UiOiJpZCIsImF1dGhfdGltZSI6MTcwOTUzMjg2NywicGhvbmVfbnVtYmVyIjoiKzYyODU3NTU1MjgyNTIyIiwiZXhwIjoxNzA5NTUzMDA1LCJjdXN0b206cm9sZSI6ImFkbWluIiwiaWF0IjoxNzA5NTQ5NDA1fQ.TCNnW6qW7zR-yru6Bv8tuz3Vx6THShWMzN6rM_Pigp80ciTPWZxqPDwQSd4idEUZRcDgOT_R_ufKI7bhqTewpGGsJcsobV3_SAuwkBkL-bfsFg_jWCrDf23wd7OEkKmEfj4RT_pWevNgkEAuKxg9ksZbLU8HkZsompOpNcelptojw00fQmdx-QTZAJkzJQDW_7Czh2J1UBVMusgZ9_8TpN7bEaktmgfZ4JCL2ul5azqfNQdITfrxrqtuMcydytMP_cmaj_GdSxPxNS-VcbXqxHFs-k25hZVQug2s--xNZgq6sCiZVXhuOWSo0frbqlo_4IgN1zKCmiihUw-wNW2Uow`;

const downloadInvoices = async (orders) => {
    const promises = [];
    for (const order of orders) {
        promises.push(getInvoice(order.id, order.status));
    }

    const results = await Promise.all(promises);
    for (let i = 0; i < orders.length; i++) {
        const orderId = orders[i].id;
        const date = orders[i].createdAt;
        // console.log(`--------- writing invoice ${orderId} ---------`);
        
        if (results[i]) {
            const y = date.split('T');
            const z = y[0];
            const dir = `./storage/invoices/INV/${z}`;
            fileUtils.ensureDirectoryExistence(dir);
            const invoiceStream = fs.createWriteStream(`${dir}/${orderId}.zip`);
            // const bankTransferStream = fs.createWriteStream(`./storage/invoices/BT/${order.id}.zip`);
            superagent.get(results[i].url).pipe(invoiceStream);
            // superagent.get(invoiceObj.bankTransferUrl).pipe(bankTransferStream);
        }
    }
}

const getInvoice = async (orderId, status) => {
    try {
        const result = await superagent
            .post(`https://api.ula.app/orders/${orderId}/invoice`)
            .set('content-type', 'application/json')
            .set('Authorization', authToken)
            .send();
        return result.body;
    } catch (error) {
        // console.error(`got some error when download invoice ${orderId}, status: ${status}, ${error}`);
        return null;
    }
}

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
    // console.log(query);
    return { query };
}

const getOrders = async () => {
    const startIterationDate = parseISO('2023-11-30T00:00:00');
    const perPage = 50;

    for (let i = 0; i < 32; i++) {
        const startDate = formatISO(addDays(startIterationDate, i));
        const endDate = formatISO(addDays(startIterationDate, i+1));
        console.log(`--- getting data for ${startDate} ---`);
        
        let page = 1;
        let totalPages = 1;
        while(page <= totalPages) {
            console.log(`------ Date: ${startDate}, Page: ${page} of ${totalPages} ------`);
            const params = {
                startDate,
                endDate,
                offset: (page-1) * perPage,
                limit: perPage,
            }
            const graphQLQuery = getGraphQLQuery(params);

            try {
                const result = await superagent
                    .post('https://api.ula.app/orders-graphql')
                    .set('content-type', 'application/json')
                    .set('Authorization', authToken)
                    .send(graphQLQuery);
                const adminResult = result.body.data.adminOrdersV2;
                page = adminResult.page.currentPage + 1;
                totalPages = adminResult.page.totalPages;

                await downloadInvoices(adminResult.data);
            } catch (error) {
                console.log(error);
                // console.error('got some error');
            }
        }
        
    }
    // const query = getGraphQLQuery(params);
}

(async () => {
    await getOrders();
})();