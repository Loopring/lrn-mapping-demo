const bodyParser = require("body-parser");
const express = require("express");
const app = express();

app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended: true}));
app.set("view engine", "ejs");

app.get("/", function(req, res) {
  res.render("index");
});

app.get("/bind", function(req, res) {
  res.render("bind");
});

app.get("/search", function(req, res) {
  res.render("search");
});


app.listen(3000, function() {
  console.log("server started at port 3000.");
});
