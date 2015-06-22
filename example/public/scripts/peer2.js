getFS(function(fs){
	var CHUNK_SIZE = 1024;

	var server = {
		iceServers: [
			{url: "stun:23.21.150.121"},
			{url: "stun:stun.l.google.com:19302"},
			{url: "turn:numb.viagenie.ca", credential: "this is a test pass", username: "g1339055@trbvm.com"}
		]
	};
	var options = {
		optional: [
			{DtlsSrtpKeyAgreement: true} // требуется для соединения между Chrome и Firefox
			//{RtpDataChannels: true} // требуется в Firefox для использования DataChannels API
		]
	};

	var getFullURL = (function(){
		var a = document.createElement("a");
		function inner(path) {
			a.href = path;
			return a.href;
		}
		return inner;
	})();

	var socket, rtcConnectionBuilder, user_id;

	function webRTCGetFile(url, fileName, callback) {

		var rtcConnection = rtcConnectionBuilder.createConnection({
			socket: socket,
			id: user_id,
			serverOptions: server,
			connectionOptions: options
		});

		function webRTCFileReceivedBuilder() {
			var chunks = [];
			function inner(data) {
				data = JSON.parse(data);
				if (data.final) {
					rtcConnection.close();

					var md5state = StreamMD5.init();

					chunks.push(data);
					// chunks.sort(function(a, b){
					// 	return a.num - b.num;
					// });
					var fileType = chunks[0].type;
					for (var i = 0; i < chunks.length; i++) {
						chunks[i] = base64DecToArr(chunks[i].data);
						StreamMD5.update(md5state, chunks[i]);
					}
					var fileHash = StreamMD5.finalize(md5state);
					console.log("Recieved " + fileName + " with hash " + fileHash);
					if (fileName == fileHash) {
						fs.write(fileName, fileType, chunks, function(fileEntry) {
							localStorage["peer_" + fileName] = fileType;
							callback(fileEntry.toURL());
						});
					} else {
						xhrGetFile(url, fileName, callback);
					}
				} else {
					chunks.push(data);
				}
			};
			return inner;
		};

		rtcConnection.onChannelOpen = function() {
			console.log("Sending request for file " + fileName);
			rtcConnection.send(fileName);
		}
		rtcConnection.onMessage = webRTCFileReceivedBuilder();

		function filePeerReceived(message) {
			var json = JSON.parse(message);
			if (json.fileName == fileName) {
				socket.removeListener("file", filePeerReceived);
				if (json.found) {
					rtcConnection.connect(json.peer);
				} else {
					xhrGetFile(url, fileName, callback);
				}
			}
		}

		socket.on("file", filePeerReceived);
		socket.emit("get", fileName);
	}

	function webRTCServeFiles() {
		rtcConnectionBuilder.listen(true, {
			socket: socket,
			id: user_id,
			serverOptions: server,
			connectionOptions: options
		}, function(rtcConnection) {
			rtcConnection.onMessage = function(fileName) {
				console.log("Sending file " + fileName);
				var read = 0;
				fs.read(fileName, function(fileContent) {
					// for (var i = 0; i * CHUNK_SIZE < fileContent.byteLength; i++) {
					// 	var chunk = {
					// 		//num: i,
					// 		final: (i + 1) * CHUNK_SIZE > fileContent.byteLength,
					// 		data: base64EncArr(new Uint8Array(fileContent.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)))
					// 	};
					// 	if (i == 0) {
					// 		chunk.type = localStorage["peer_" + fileName] || "application/octet-stream";
					// 	}
					// 	//rtcConnection.send(JSON.stringify(chunk));
					// }
					// rtcConnection.close();
					// socket.emit("post", fileName);
					rtcConnection.send(JSON.stringify({final: true, data: ""}));
					//rtcConnection.close();
					socket.emit("post", fileName);
				}, function(reader){
					var len = reader.result.byteLength;
					var chunk = {final: false};
					if (read == 0) {
						chunk.type = localStorage["peer_" + fileName] || "application/octet-stream";
					}
					chunk.data = base64EncArr(new Uint8Array(reader.result.slice(read, len)));
					read = len;
					rtcConnection.send(JSON.stringify(chunk));
					//console.log(base64EncArr(new Uint8Array(reader.result.slice(0, len))));
				});
				// var read = 0;
				// fs.read(fileName, function(reader) {
				// 	rtcConnection.send(JSON.stringify({final: true, data: ""}));
				// 	rtcConnection.close();
				// 	socket.emit("post", fileName);
				// }, function(reader) {
				// 	var len = reader.result.byteLength;
				// 	var chunk = {final: false};
				// 	if (read == 0) {
				// 		chunk.type = localStorage["peer_" + fileName] || "application/octet-stream";
				// 	}
				// 	chunk.data = base64EncArr(new Uint8Array(reader.result.slice(read, len)));
				// 	read = len;
				// 	rtcConnection.send(JSON.stringify(chunk));
				// });
			};
		});
	}

	function xhrGetFile(fileName, localFSFileName, callback) {
		var ajax = new Ajax();
		ajax.connect(fileName, function(xhr) {
			var fileType = xhr.getResponseHeader("Content-Type");
			fs.write(localFSFileName, fileType, [xhr.response], function(fileEntry) {
				localStorage["peer_" + localFSFileName] = fileType;
				callback(fileEntry.toURL());
			});
		});
	}

	var isPeerDisabled = !!document.cookie.match("(?:^|;) ?peer-disabled=([^;]*)");

	function onPeerElementCreatedBuilder(sourceAttribute) {
		function inner() {
			var path = this.getAttribute("data-peer-" + sourceAttribute);
			if (isPeerDisabled) {
				this[sourceAttribute] = path;
				return;
			}
			var source = getFullURL(path);
			var localFSFileName = this.getAttribute("data-peer-hash");
			var that = this;
			fs.exists(localFSFileName, function(fileEntry) {
				if (fileEntry) {
					that[sourceAttribute] = fileEntry.toURL();
					socket.emit("post", localFSFileName);
				} else {
					// if (confirm("Use WebRTC?")) {
					// 	webRTCGetFile(that.getAttribute("data-peer-src"), webRTCFileReceivedBuilder().arg(that));
					// } else {
					// 	xhc.connect(source, onXHRImageReceived.arg(that, fs, localFSFileName));
					// }
					webRTCGetFile(source, localFSFileName, function(fileURL) {
						that[sourceAttribute] = fileURL;
						socket.emit("post", localFSFileName);
					});
				}
			});
		}
		return inner;
	}

	var onPeerElementCreatedWithSrc = onPeerElementCreatedBuilder('src'),
		onPeerElementCreatedWithHref = onPeerElementCreatedBuilder('href');

	function onInitFS() {
		if (!isPeerDisabled) {
			socket = io.connect("http://localhost:3000/", {"sync disconnect on unload": true});
			rtcConnectionBuilder = new RTCConnectionBuilder(socket);
			user_id = rtcConnectionBuilder.uuid();
			socket.emit("announce", user_id);
		}

		var PeerImgProto = Object.create(HTMLImageElement.prototype);
		PeerImgProto.createdCallback = onPeerElementCreatedWithSrc;
		// PeerImgProto.attributeChangedCallback = function(attrName, oldValue, newValue) {
		// 	alert(attrName + " " + oldValue + " " + newValue);
		// }
		var PeerImg = document.registerElement('peer-img', {
			prototype: PeerImgProto,
			extends: "img"
		});

		var PeerScriptProto = Object.create(HTMLScriptElement.prototype);
		PeerScriptProto.createdCallback = onPeerElementCreatedWithSrc;
		var PeerScript = document.registerElement('peer-script', {prototype: PeerScriptProto, extends: "script"});

		var PeerLinkProto = Object.create(HTMLLinkElement.prototype);
		PeerLinkProto.createdCallback = onPeerElementCreatedWithHref;
		var PeerLink = document.registerElement('peer-link', {prototype: PeerLinkProto, extends: "link"});

		if (!isPeerDisabled) {
			webRTCServeFiles();
		}
	}

	onInitFS();
});