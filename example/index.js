var express = require("express");
var logger = require("morgan");
var path = require("path");
var app = express();
app.use(logger("dev"));
app.use(express.static(path.join(__dirname, "public")));
app.get("/", function(req, res) {
	res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.use(function(req, res) {
	res.sendStatus(404);
});
app.listen(process.env.PORT || 3001);