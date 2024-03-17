const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

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

module.exports = {
  uploadDir,
  uploadFile,
};
