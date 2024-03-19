const { writeFileSync, mkdirSync, existsSync } = require("fs");
const fs = require('fs');
const path = require('path');

function existsDir(dirname) {
  return existsSync(dirname);
}

function ensureDirectoryExistence(dirname) {
  if (existsSync(dirname)) {
    return true;
  }
  mkdirSync(dirname, { recursive: true });
}

const storeJson = (id, object, type = "batch", requestId = "") => {
  try {
    const directory = `./storage/batch/${id}`;
    ensureDirectoryExistence(directory);
    const filename = requestId ? `${type}_${requestId}` : type;
    const fullpath = `${directory}/${filename}.json`;
    writeFileSync(fullpath, JSON.stringify(object, null, 2), "utf-8");
    console.log(`success write file ${fullpath}`);
  } catch (error) {
    console.error(`Error while writing file: ${error}`);
  }
};

const removeDir = (folderPath) => {
  fs.rmSync(folderPath, {
    recursive: true,
    force: true,
  });
}

const removeDirIfEmpty = (folderPath) => {
  const files = fs.readdirSync(folderPath);
  if (files.length === 0) {
    fs.rmSync(folderPath);
  }
}

const moveDir = (sourcePath, destinationPath) => {
  const splitter = sourcePath.split('/');
  const datePath = splitter.pop();
  const reversedDatePath = datePath.split('-').reverse().join('-');
  ensureDirectoryExistence(destinationPath);
  const files = fs.readdirSync(sourcePath);
  for(const file of files) {
    const filename = file.replace(/(\.[\w\d_-]+)$/i, '-' + reversedDatePath + '$1');
    const oldPath = path.join(sourcePath, file);
    const newPath = path.join(destinationPath, filename);
    fs.renameSync(oldPath, newPath);
  }
  // removeDir(sourcePath);
}

const copyDir = (src, dest, callback) => {
  const copy = (copySrc, copyDest) => {
    fs.readdir(copySrc, (err, list) => {
      if (err) {
        callback(err);
        return;
      }
      list.forEach((item) => {
        const ss = path.resolve(copySrc, item);
        fs.stat(ss, (err, stat) => {
          if (err) {
            callback(err);
          } else {
            const curSrc = path.resolve(copySrc, item);
            const curDest = path.resolve(copyDest, item);

            if (stat.isFile()) {
              // file, copy directly
              fs.createReadStream(curSrc).pipe(fs.createWriteStream(curDest));
            } else if (stat.isDirectory()) {
              // directory, recursively
              fs.mkdirSync(curDest, { recursive: true });
              copy(curSrc, curDest);
            }
          }
        });
      });
    });
  };

  fs.access(dest, (err) => {
    if (err) {
      // If the target directory does not exist, create it
      fs.mkdirSync(dest, { recursive: true });
    }
    copy(src, dest);
    // removeDir(src);
  });
};

const copyFile = (src, dest) => {
  fs.createReadStream(src).pipe(fs.createWriteStream(dest));
}

const getDirectoryContents = (currentDirPath, type) => {
  const contents = [];
  fs.readdirSync(currentDirPath).forEach(function (name) {
    var filePath = path.join(currentDirPath, name);
    var stat = fs.statSync(filePath);
    if (type === 'directory' && stat.isDirectory()) {
      contents.push(filePath);
    }
    if (type === 'file' && stat.isFile()) {
      contents.push(filePath);
    }
  });
  return contents;
}

module.exports = {
  storeJson,
  ensureDirectoryExistence,
  copyDir,
  removeDir,
  removeDirIfEmpty,
  moveDir,
  existsDir,
  copyFile,
  getDirectoryContents,
};
