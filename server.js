const bodyParser = require("body-parser");
const express = require("express");
const fs = require("fs");
const utils = require("./utils");

const app = express();
// const dataFile = "data.csv";

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

  utils.addItem(neoAddress, ethAddress, signText);
  
  res.render("bind", { msg: msg, ethAddress: ethAddress });
});

app.get("/search", function(req, res) {
  res.render("search", {searchResult: ""});
});

app.post("/search", function(req, res) {
  const neoAddr = req.body.neoAddress;
  const bindEthAddr = utils.search(neoAddr);
  let msg;
  if (bindEthAddr) {
    msg = "Your Bind Ethereum Address Is:  " + bindEthAddr;
  } else {
    msg = "No Ethereum Address Binded To This Neo Address.  ";
  }

  res.render("search", {searchResult: msg});  
});


app.listen(3000, function() {
  console.log("server started at port 3000.");
});
