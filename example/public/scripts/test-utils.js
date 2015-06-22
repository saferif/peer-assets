function clearFS() {
	function fsErrorHandler(e) {
	  console.log('Error: ' + e.name + " " + e.message);
	}
	var requestFileSystem = window.requestFileSystem || window.webkitRequestFileSystem;
	requestFileSystem(window.TEMPORARY, 10 * 1024 * 1024, function(fs) {
		var dirReader = fs.root.createReader();
		dirReader.readEntries(function(entries) {
			for (var i = 0; i < entries.length; i++) {
				if (entries[i].isDirectory) {
					entries[i].removeRecursively(function(){}, fsErrorHandler);
				} else {
					entries[i].remove(function(){}, fsErrorHandler);
				}
			}
		});
	}, fsErrorHandler);
}

function onCBClicked(cb) {
	var d;
	if (cb.checked) {
		d = "Thu, 01 Jan 1970 00:00:00 GMT";
	} else {
		d = "Mon, 01 Jan 2300 00:00:00 GMT";
	}
	document.cookie = "peer-disabled=true; expires=" + d;
}

document.querySelector("input[type=\"checkbox\"]").checked = !document.cookie.match("(?:^|;) ?peer-disabled=([^;]*)");