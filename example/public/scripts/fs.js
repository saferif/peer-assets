function getFS(callback) {
	function fsErrorHandler(e) {
	  console.log('Error: ' + e.name + " " + e.message);
	}

	var requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
	requestFileSystem(window.TEMPORARY, 10 * 1024 * 1024, function(fs){
		function fsExists(fileName, callback) {
			fs.root.getFile(fileName, {create: false, exclusive: false}, callback, function(e) {
				if (e.name == "NotFoundError") {
					callback(false);
				} else {
					fsErrorHandler(e);
				}
			});
		}

		function fsRead(fileName, readComplete, readProgress) {
			fs.root.getFile(fileName, {create: false, exclusive: false}, function(fileEntry) {
				fileEntry.file(function(file) {
					var reader = new FileReader();
					reader.onerror = fsErrorHandler;
					// reader.onload = function(e) {
					// 	readComplete(reader);
					// }
					reader.onprogress = function(e) {
						readProgress(reader);
					}
					reader.onloadend = function() {
						readComplete(this.result);
					};
					reader.readAsArrayBuffer(file);
				}, fsErrorHandler);
			}, fsErrorHandler);
		}

		function fsWrite(fileName, fileType, fileContent, callback) {
			fs.root.getFile(fileName, {create: true, exclusive: true}, function(fileEntry) {
				fileEntry.createWriter(function(writer) {
					writer.onerror = fsErrorHandler;
					writer.onwriteend = function(e) {
						callback(fileEntry);
					};
					if (!(fileContent instanceof Array)) {
						fileContent = [fileContent];
					}
					var blob = new Blob(fileContent, {type: fileType});
					writer.write(blob);
				}, fsErrorHandler);
			}, fsErrorHandler);
		}
		callback({
			exists: fsExists,
			read: fsRead,
			write: fsWrite
		});
	}, fsErrorHandler);
}