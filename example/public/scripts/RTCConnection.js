var RTCConnectionBuilder = (function() {

	var PeerConnection = window.mozRTCPeerConnection || window.webkitRTCPeerConnection;
	var SessionDescription = window.mozRTCSessionDescription || window.RTCSessionDescription;
	var IceCandidate = window.mozRTCIceCandidate || window.RTCIceCandidate;

	var config = Symbol("config");
	var pc = Symbol("pc");
	var channel = Symbol("channel");
	var sdpSent = Symbol("sdpSent");
	var peerId = Symbol("peerId");
	var connectionId = Symbol("connectionId");
	var isInConnection = Symbol("isInConnection");

	var RTCConnection = (function() {

		function RTCConnection(connectionConfig) {
			this[config] = connectionConfig;
			this[sdpSent] = false;

			this.onPeerDisconnected = null;
			this.onChannelOpen = null;
			this.onMessage = null;
		}

		RTCConnection.prototype.connect = function(to_id) {
			var that = this;
			this[isInConnection] = false;
			this[peerId] = to_id;
			this[connectionId] = this[config].builder.nextConnectionId++;
			if (!this[config].builder.outConnections[to_id]) {
				this[config].builder.outConnections[to_id] = {};
			}
			this[config].builder.outConnections[to_id][this[connectionId]] = this;
			var _pc = new PeerConnection(this[config].serverOptions, this[config].connectionOptions);
			_pc.candidateCache = [];
			initConnection.call(this, _pc, to_id, -1, "offer");
			this[channel] = _pc.createDataChannel("peer-cdn", {
				reliable: true,
				ordered: true
			});
			bindEvents.call(this, this[channel]);
			_pc.createOffer(function(offer) {
				_pc.setLocalDescription(offer);
				if (!that[sdpSent]) {
					sendViaSocket.call(that, "offer", offer, to_id, -1);
					that[sdpSent] = true;
				}
			});
			this[pc] = _pc;
		};

		RTCConnection.prototype.send = function(message) {
			this[channel].send(message); 
		};

		RTCConnection.prototype.close = function() {
			var that = this;
			this[channel].onclose = function() {
				that[pc].close();
			}
			this[channel].close();
			

			if (this[peerId] !== undefined) {
				if (this[isInConnection]) {
					delete this[config].builder.inConnections[this[peerId]][this[connectionId]];
					if (Object.keys(this[config].builder.inConnections[this[peerId]]).length == 0) {
						delete this[config].builder.inConnections[this[peerId]];
					}
				} else {
					delete this[config].builder.outConnections[this[peerId]][this[connectionId]];
					if (Object.keys(this[config].builder.outConnections[this[peerId]]).length == 0) {
						delete this[config].builder.outConnections[this[peerId]];
					}
				}
			}
		};

		return RTCConnection;
	})();

	function sendViaSocket(type, message, to, toConnectionId) {
		this[config].socket.emit("webrtc", JSON.stringify({
			id: this[config].id,
			connectionId: this[connectionId],
			to: to,
			toConnectionId: toConnectionId,
			type: type,
			data: message
		}));
	}

	function initConnection(pc, id, connectionId, sdpType) {
		var that = this;
		pc.onicecandidate = function (event) {
			if (event.candidate) {
				if (!that[sdpSent]) {
					pc.candidateCache.push(event.candidate);
				} else {
					while (pc.candidateCache.length > 0) {
						sendViaSocket.call(that, "candidate", pc.candidateCache.shift(), id, connectionId);
					}
					sendViaSocket.call(that, "candidate", event.candidate, id, connectionId);
				}
			} else {
				if (!that[sdpSent]) {
					that[sdpSent] = true;
					sendViaSocket.call(that, sdpType, pc.localDescription, id, connectionId);
				}
				for (var i = 0; i < pc.candidateCache.length; i++) {
					sendViaSocket.call(that, "candidate", pc.candidateCache[i], id, connectionId);
				}
			}
		}
		pc.oniceconnectionstatechange = function (event) {
			if (pc.iceConnectionState == "disconnected") {
				if (that.onPeerDisconnected) {
					that.onPeerDisconnected(pc);
				}
				that.close();
			}
		}
	}

	function bindEvents (channel) {
		var that = this;
		channel.onopen = function () {
			if (that.onChannelOpen) that.onChannelOpen();
		};
		channel.onmessage = function (e) {
			if (that.onMessage) that.onMessage(e.data);
		};
	}

	function createConnection(id) {
		if (this[pc] === undefined) {
			var that = this;
			var _pc = new PeerConnection(this[config].serverOptions, this[config].connectionOptions);
			_pc.candidateCache = [];
			initConnection.call(this, _pc, id, this[connectionId], "answer");
			this[pc] = _pc;
			_pc.ondatachannel = function(e) {
				that[channel] = e.channel;
				bindEvents.call(that, that[channel]);
			}
		}
	}

	function remoteCandidateReceived(data) {
		this[pc].addIceCandidate(new IceCandidate(data));
	}

	function remoteOfferReceived(id, connId, data) {
		var that = this;

		this[isInConnection] = true;
		this[peerId] = id;
		this[connectionId] = connId;
		if (!this[config].builder.inConnections[id]) {
			this[config].builder.inConnections[id] = {};
		}
		this[config].builder.inConnections[id][this[connectionId]] = this;
		createConnection.call(this, id);
		var _pc = this[pc];

		_pc.setRemoteDescription(new SessionDescription(data));
		_pc.createAnswer(function(answer) {
			_pc.setLocalDescription(answer);
			if (!that[sdpSent]) {
				sendViaSocket.call(that, "answer", answer, id, that[connectionId]);
				that[sdpSent] = true;
			}
		});
	}

	function remoteAnswerReceived(data) {
		this[pc].setRemoteDescription(new SessionDescription(data));
	}

	function socketReceived(data) {
		var json = JSON.parse(data);
		switch (json.type) {
			case "candidate":
				if (json.toConnectionId == -1) {
					if (this.inConnections[json.id] !== undefined && this.inConnections[json.id][json.connectionId] !== undefined) 
						remoteCandidateReceived.call(this.inConnections[json.id][json.connectionId], json.data);
				} else {
					if (this.outConnections[json.id] !== undefined && this.outConnections[json.id][json.toConnectionId] !== undefined) 
						remoteCandidateReceived.call(this.outConnections[json.id][json.toConnectionId], json.data);
				}
				break;
			case "offer":
				if (this.listening) {
					var connection = this.createConnection(this.inConnectionsConfig);
					this.inConnectionsCallback(connection);
					remoteOfferReceived.call(connection, json.id, json.connectionId, json.data);
				}
				break;
			case "answer":
				if (this.outConnections[json.id] !== undefined && this.outConnections[json.id][json.toConnectionId] !== undefined) 
					remoteAnswerReceived.call(this.outConnections[json.id][json.toConnectionId], json.data);
				break;
		}
	}

	function onBeforeUnload(event) {
		for (var i in this.inConnections) {
			if (this.inConnections.hasOwnProperty(i)) {
				this.inConnections[i].close();
			}
		}
		for (var i in this.outConnections) {
			if (this.outConnections.hasOwnProperty(i)) {
				this.outConnections[i].close();
			}
		}
	}

	function RTCConnectionBuilder(socket){
		var that = this;

		this.outConnections = {};
		this.inConnections = {};
		this.listening = false;
		this.nextConnectionId = 0;
		this.socket = socket;

		this.socket.on("webrtc", function(data){socketReceived.call(that, data);});
		window.addEventListener("beforeunload", function(event){onBeforeUnload.call(that, event);});
	};

	//RFC4122 Section 4.4
	RTCConnectionBuilder.prototype.uuid = function() {
		return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function(c) {
			return (c == 'x' ? (Math.random() * 16 | 0) : (Math.random() * 4 | 8)).toString(16);
		});
	};

	// id
	// serverOptions
	// connectionOptions
	RTCConnectionBuilder.prototype.createConnection = function(connectionConfig) {
		connectionConfig.builder = this;
		connectionConfig.socket = this.socket;
		return new RTCConnection(connectionConfig);
	};

	RTCConnectionBuilder.prototype.listen = function(isListeting, connectionConfig, callback) {
		if (isListeting) {
			this.inConnectionsConfig = connectionConfig;
			this.inConnectionsCallback = callback;
			this.listening = true;
		} else {
			this.listening = false;
		}
	}

	return RTCConnectionBuilder;
})();