const AWS = require("aws-sdk");

const uploadToS3 = async (bucket, data, filePath, awsConfig, expiryTime) => {
  const params = {
    Body: data,
    Bucket: bucket,
    Key: filePath,
    ACL: "private",
  };

  await uploadInS3(params, awsConfig);
  const presignedGetUrl = preSignedUrl(bucket, filePath, awsConfig, expiryTime);
  console.log(`upload to s3 success, for file ${filePath}`);
  return presignedGetUrl;
};

const uploadInS3 = async (params, awsConfig) => {
  return new Promise((resolve, reject) => {
    AWS.config.update({
      region: awsConfig.region,
    });
    const s3 = new AWS.S3();
    s3.upload(params, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data);
      }
    });
  });
};

const preSignedUrl = (
  bucket,
  filePath,
  awsConfig,
  expiryTime,
  operationType = "getObject"
) => {
  AWS.config.update({
    region: awsConfig.region,
  });
  const s3 = new AWS.S3();
  return s3.getSignedUrl(operationType, {
    Bucket: bucket,
    Key: filePath,
    Expires: expiryTime ?? 60 * 12,
  });
};

module.exports = {
  uploadToS3,
  preSignedUrl,
};
