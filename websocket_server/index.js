var Queue = require("./Queue");
var app = require("http").createServer(httpHandler);
var io = require("socket.io")(app);

app.listen(process.env.PORT || 3000);

function httpHandler(req, res) {
	if (req.method != "GET" && (req.url == "/" || req.url == "/robots.txt" || req.url == "/favicon.ico")) {
		res.writeHead(405, {"Allow": "GET", "Content-Type": "text/plain"});
		res.end("Method Not Allowed");
	} else if (req.url == "/") {
		res.writeHead(426, {"Connection": "Upgrade", "Upgrade": "websocket", "Content-Type": "text/plain"});
		res.end("Upgrade Required");
	} else if (req.url == "/robots.txt") {
		res.writeHead(200, {"Content-Type": "text/plain"});
		res.end("User-agent: *\r\nDisallow: /\r\n");
	} else if (req.url == "/favicon.ico") {
		res.writeHead(404, {"Content-Type": "text/plain"});
		res.end("Not Found");
	} else {
		res.writeHead(303, {"Location": "/", "Content-Type": "text/html"});
		res.end("<a href=\"/\">See Other</a>");
	}
}

var users = new Map(),
	files = new Map();

function clientAnnounced(socket, message) {
	console.log("announce: " + message);

	socket.user_id = message;
	users.set(message, socket);
}

function fileRequested(socket, message) {
	console.log("get: " + message);

	var result = {found: false, fileName: message};
	if (files.has(message)) {
		var q = files.get(message);
		if (!q.isEmpty()) {
			var peer, isPeerActive;
			while (!q.isEmpty()) {
				peer = q.dequeue();
				isPeerActive = users.has(peer);
				if (isPeerActive) break;
			}
			if (q.isEmpty()) {
				files.delete(message);
			}
			result.found = isPeerActive;
			if (isPeerActive) result.peer = peer;
		} else {
			files.delete(message);
		}
	}
	socket.emit("file", JSON.stringify(result));
}

function fileReceived(socket, message) {
	console.log("post: " + message);

	if (socket.user_id !== undefined && users.has(socket.user_id)) {
		var q;
		if (!files.has(message)) {
			q = new Queue();
			files.set(message, q);
		} else {
			q = files.get(message);
		}
		q.enqueue(socket.user_id);
	}
}

function webrtcMessageReceived(socket, message) {
	console.log("webrtc: " + message);

	var json = JSON.parse(message);
	if (json.to !== undefined && users.has(json.to)) {
		users.get(json.to).emit("webrtc", message);
	}
}

function clientDisconnected(socket) {
	if (socket.user_id !== undefined) {
		users.delete(socket.user_id);
	}
}

function clientConnected(socket) {
	socket.on("announce", clientAnnounced.bind(this, socket));
	socket.on("get", fileRequested.bind(this, socket));
	socket.on("post", fileReceived.bind(this, socket));
	socket.on("webrtc", webrtcMessageReceived.bind(this, socket));
	socket.on("disconnect", clientDisconnected.bind(this, socket));
}

io.on("connection", clientConnected);