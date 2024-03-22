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

const readCsvAsync = async (path) => {
  const records = [];
  const parser = fs
    .createReadStream(path)
    .pipe(parse({
      columns: true,
      skip_empty_lines: true,
    }));
  for await (const record of parser) {
    records.push(record);
  }
  return records;
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
  let headerOption = !Array.isArray(data[0]);
  stringify(data, { header: headerOption }, (err, output) => {
    fs.writeFileSync(path, output);
  }); 
}

function appendCsv(path, data) {
  stringify(data, (err, output) => {
    fs.appendFileSync(path, output);
  }); 
}

module.exports = {
  readCsv,
  readCsvAsync,
  writeCsv,
  appendCsv,
  processFile,
};
