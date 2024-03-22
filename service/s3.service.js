const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');

const uploadDir = function(s3Path, bucketName) {
  let s3 = new S3Client();

  function walkSync(currentDirPath, callback) {
    fs.readdirSync(currentDirPath).forEach(function (name) {
      var filePath = path.join(currentDirPath, name);
      var stat = fs.statSync(filePath);
      if (stat.isFile()) {
        callback(filePath, stat);
      } else if (stat.isDirectory()) {
        walkSync(filePath, callback);
      }
    });
  }

  walkSync(s3Path, function(filePath, stat) {
    let bucketPath = 'invoice/' + filePath.substring(s3Path.length-1);
    let params = {
      Bucket: bucketName, 
      Key: bucketPath, 
      Body: fs.readFileSync(filePath) 
    };
    const command = new PutObjectCommand(params);
    s3.send(command, function(err, data) {
      if (err) {
          console.log(err)
      } else {
          console.log('Successfully uploaded '+ bucketPath +' to ' + bucketName);
          fs.rmSync(filePath);
      }
    });
  });
};

const uploadFile = (filePath, bucketName) => {
  return new Promise((resolve, reject) => {
    const s3 = new S3Client();
    const part = filePath.split('/');
    const lastPart = part.pop();
    const bucketPath = 'invoice/' + lastPart;
    const params = {
      Bucket: bucketName, 
      Key: bucketPath, 
      Body: fs.readFileSync(filePath) 
    };
    const command = new PutObjectCommand(params);
    s3.send(command, function(err, data) {
      if (err) {
          reject(err);
      } else {
          console.log('Successfully uploaded '+ bucketPath +' to ' + bucketName);
          // fs.rmSync(filePath);
          resolve();
      }
    });
  });
}

const listFiles = async (prefix, bucketName) => {
  try {
    const path = 'invoice/';
    const client = new S3Client();
    const params = {
      Bucket: bucketName,
      // MaxKeys: 2,
      Delimiter: '/',
      Prefix: path + prefix,
    }
    const command = new ListObjectsV2Command(params);
    const data = await client.send(command);
    logger.info('Contents' + JSON.stringify(data.Contents));
    return data.Contents.map(e => e.Key.replace(path, ''));
  } catch {

  }
}

module.exports = {
  uploadDir,
  uploadFile,
  listFiles,
};
