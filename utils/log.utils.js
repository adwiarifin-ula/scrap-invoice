const { transports, createLogger, format } = require('winston');
const WinstonCloudWatch = require('winston-cloudwatch');

const winstonTransports = [,
  new transports.Console(),
  new transports.File({ filename: 'storage/logs/error.log', level: 'error' }),
  new transports.File({ filename: 'storage/logs/combined.log' }),
];

if (process.env.STAGE === 'production') {
  winstonTransports.push(new WinstonCloudWatch({
    level: process.env.CLOUDWATCH_LEVEL || 'info',
    logGroupName: process.env.CLOUDWATCH_LOG_GROUP || '/scrap/orders/invoice',
    logStreamName: process.env.CLOUDWATCH_LOG_NAME || 'infos',
    awsRegion: process.env.AWS_REGION,
  }));
}

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: winstonTransports,
});

module.exports = {
    logger,
}