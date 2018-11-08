const bodyParser = require("body-parser");
const express = require("express");
const fs = require("fs");

const app = express();

app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended: true}));
app.set("view engine", "ejs");

app.get("/", function(req, res) {
  res.render("index");
});

app.get("/bind", function(req, res) {
  res.render("bind", {msg: ""});
});

app.post("/bind", function(req, res){
  const verify = () => {
    return true;
  };
  
  console.log("req body:", req.body);
  console.log("req query:", req.query);

  const neoAddress = req.query.neoAddress;
  const ethAddress = req.body.ethAddress;
  const signText = req.query.signText;
  let msg = "";
  if (verify()) {
    msg = "Bind succeeded!<br/> <p>Your Neo Address:  " + neoAddress +
      "</p> <p>Your Ethereum Address:  " + ethAddress +
      "</p> <p>Sign Text:  " + signText + "</p>";
  }

  addItem(neoAddress, ethAddress, signText);
  
  res.render("bind", { msg: msg, ethAddress: ethAddress });
});

app.get("/search", function(req, res) {
  res.render("search", {searchResult: ""});
});

app.post("/search", function(req, res) {
  const neoAddr = req.body.neoAddress;
  const bindEthAddr = search(neoAddr);
  let msg;
  if (bindEthAddr) {
    msg = "Your Bind Ethereum Address Is:  " + bindEthAddr;
  } else {
    msg = "No Ethereum Address Binded To This Neo Address.  ";
  }

  res.render("search", {searchResult: msg});  
});

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

function addItem(neoAddress, ethAddress, signText) {
  const line = neoAddress + "," + ethAddress + "," + signText;
  fs.appendFileSync(dataFile, line + "\n");
}

function search(neoAddr) {
  const dataMap = loadData();
  return dataMap.get(neoAddr);
}

app.listen(3000, function() {
  console.log("server started at port 3000.");
});
