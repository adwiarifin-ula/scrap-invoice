const { ulaClient } = require('../utils/request.utils');
const { logger } = require('../utils/log.utils');

const refreshToken = async () => {
    try {
        return ulaClient
            .post('/v1/users/refreshToken')
            .send({
                refreshToken: process.env.REFRESH_TOKEN,
            });
    } catch (error) {
        logger.error('error while refresh token');
    }
}

module.exports = {
    refreshToken,
}