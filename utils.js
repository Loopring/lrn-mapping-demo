const fs = require("fs");

const dataFile = "data.csv";

function loadData() {
  // parse csv file here:
  const fileContent = fs.readFileSync(dataFile, "utf8");
  const allLines = fileContent.split("\n");
  const resMap = new Map();
  allLines.forEach((line) => {
    const lineTrimed = line.trim();
    if (lineTrimed.startsWith("#")) {
      // skip comment, do nothing.
    } else {
      const fields = line.split(",");
      resMap.set(fields[0], fields[1]);
    }
  });

  return resMap;
}

function addItem(neoAddr, ethAddr, signText) {
  const line = neoAddress + "," + ethAddress + "," + signText;
  fs.appendFileSync(utils.dataFile, line + "\n");
}

function search(neoAddr) {
  const dataMap = loadData();
  return dataMap.get(neoAddr);
}
