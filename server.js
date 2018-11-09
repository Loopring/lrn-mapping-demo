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
  res.locals = {
    msg: "",
    neoAddress: "",
    ethAddress: "",
    signText: ""
  };

  res.render("bind");
});

app.post("/bind", function(req, res){
  const verify = () => {
    return true;
  };
  
  console.log("req body:", req.body);
  console.log("req query:", req.query);

  const neoAddress = req.body.neoAddress;
  const ethAddress = req.body.ethAddress;
  const signText = req.body.signText;
  let msg;
  if (verify()) {
    msg = "Bind succeeded!";
  } else {
    msg = "Bind Failed! Verify signature failed.";
  }

  addItem(neoAddress, ethAddress, signText);
  res.locals = {
    msg: msg,
    neoAddress: neoAddress,
    ethAddress: ethAddress,
    signText: signText
  };
  
  res.render("bind");
});

app.get("/search", function(req, res) {
  res.render("search", {searchResult: ""});
});

app.post("/search", function(req, res) {
  const neoAddr = req.body.neoAddress;
  const bindEthAddr = search(neoAddr);
  let msg;
  if (bindEthAddr) {
    msg = "Your Binding Ethereum Address Is:  " + bindEthAddr;
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
  const dataMap = loadData();
  const ethAddr = dataMap.get(neoAddress);
  if (ethAddress === ethAddr) {
    // eth address already binded to this neo address, skip.
  } else {
    const line = neoAddress + "," + ethAddress + "," + signText;
    fs.appendFileSync(dataFile, line + "\n");
  }
}

function search(neoAddr) {
  const dataMap = loadData();
  return dataMap.get(neoAddr);
}

app.listen(3000, function() {
  console.log("server started at port 3000.");
});
