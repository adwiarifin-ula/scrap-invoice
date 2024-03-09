const fs = require("fs");
const { parse } = require("csv-parse");
const { stringify } = require("csv-stringify");

function readCsv(path, dataFunction) {
  fs.createReadStream(path)
    .pipe(parse({ delimiter: ",", from_line: 2 }))
    .on("data", dataFunction)
    .on("end", function () {
      console.log("finished");
    })
    .on("error", function (error) {
      console.log(error.message);
    });
}

function writeCsv(path, data) {
  const columns = Object.keys(data[0]);
  const writableStream = fs.createWriteStream(path);
  const stringifier = stringify({ header: true, columns: columns });
  data.forEach(d => stringifier.write(d));
  stringifier.pipe(writableStream);
}

module.exports = {
  readCsv,
  writeCsv,
};
