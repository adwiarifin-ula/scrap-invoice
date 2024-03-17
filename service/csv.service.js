const fs = require("fs");
const { parse } = require("csv-parse");
const { stringify } = require("csv-stringify");

function readCsv(path, dataFunction, endFunction, errorFunction) {
  fs.createReadStream(path)
    .pipe(parse({ delimiter: ",", from_line: 2 }))
    .on("data", dataFunction)
    .on("end", endFunction)
    .on("error", errorFunction);
}

const processFile = async (path) => {
  const records = [];
  const parser = fs
    .createReadStream(path)
    .pipe(parse({ delimiter: ",", from_line: 2 }));
  for await (const record of parser) {
    // Work with each record
    records.push(record);
  }
  return records;
};

function writeCsv(path, data) {
  stringify(data, (err, output) => {
    fs.writeFileSync(path, output);
  }); 
}

function appendCsv(path, data) {
  // if (!fs.existsSync(path)) {
  //   fs.mkdirSync(path, { recursive: true });
  // }
  stringify(data, (err, output) => {
    fs.appendFileSync(path, output);
  }); 
}

module.exports = {
  readCsv,
  writeCsv,
  appendCsv,
  processFile,
};
