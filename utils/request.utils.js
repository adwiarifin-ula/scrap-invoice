const superagent = require('superagent');
const prefix = require('superagent-prefix');

const ulaClient = () => {
    return superagent
        .agent()
        .use(prefix(process.env.BASE_URL))
        .auth(process.env.ACCESS_TOKEN, { type: 'bearer' })
        .set('Content-Type', 'application/json');
}

const defaultClient = superagent
    .agent();

module.exports = {
    ulaClient,
    defaultClient,
}